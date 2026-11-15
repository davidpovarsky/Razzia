"use strict"
// Isolated test process only. It never reads an existing deployment environment.
if (process.env.TADAZZ_PHONE_QA_CHILD !== "1" || !process.send) {
  throw new Error("phone QA child requires its isolated IPC parent")
}
const target = new URL(process.env.TADA_RAZZIA_API_URL)
if (target.protocol !== "http:" || target.hostname !== "127.0.0.1") {
  throw new Error("phone QA backend must be container loopback")
}
const realNow = Date.now.bind(Date)
let offset = 0
Date.now = () => realNow() + offset
const nativeFetch = global.fetch
let failHangups = 0
let heldCall = null
let releaseJoin = null
const forwarded = []
const emitted = (message) => process.send?.(message)
global.fetch = async (url, options) => {
  const payload = JSON.parse(options.body)
  if (payload.action === "hangup" && failHangups > 0) {
    failHangups--
    emitted({ event: "dropped-hangup", callId: payload.callId })
    return new Response(JSON.stringify({ ok: false }), { status: 503 })
  }
  if (payload.action === "join_or_poll" && payload.callId === heldCall) {
    heldCall = null
    await new Promise((resolve) => {
      releaseJoin = resolve
      emitted({ event: "join-held", callId: payload.callId })
    })
  }
  // Every non-dropped request reaches the real Hono API and real Game controller.
  forwarded.push({ action: payload.action, callId: payload.callId })
  return nativeFetch(url, options)
}
const { server } = require("./tada-pilot-gateway.cjs")
process.on("message", (message) => {
  if (message.op === "tick") offset += message.ms
  else if (message.op === "fail-hangups") failHangups = message.count
  else if (message.op === "hold-join") heldCall = message.callId
  else if (message.op === "release-join") {
    releaseJoin?.()
    releaseJoin = null
  } else if (message.op === "stop") {
    releaseJoin?.()
    server.closeAllConnections()
    server.close(() => process.exit(0))
  }
  emitted({ ack: message.id, ...(message.op === "stats" ? { forwarded } : {}) })
})
server.listen(0, "127.0.0.1", () => {
  emitted({ event: "ready", port: server.address().port })
})
