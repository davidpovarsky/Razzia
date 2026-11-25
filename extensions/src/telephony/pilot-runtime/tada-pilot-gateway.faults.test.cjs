"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { EventEmitter } = require("node:events")
const crypto = require("node:crypto")

const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}
const hash = (id) => crypto.createHash("sha256").update(id).digest("hex")

// Execute the unchanged gateway handler with injected I/O, clock and timers.
// No listeners, real provider endpoints, credentials or wall-clock sleeps.
function fixture() {
  const audioModule = { exports: {} }
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "tada-audio-logic.cjs"), "utf8"),
    {
      module: audioModule,
      Date,
      Set,
      Map,
    },
  )
  const requests = []
  const votes = new Map()
  const roster = { activeCallId: null, connected: false, points: 0 }
  const rosters = new Map([["synthetic-phone-one", roster]])
  const timers = new Map()
  let timerId = 0
  let handler
  const f = {
    epoch: 1,
    accepting: true,
    answersCount: 5,
    rejectCaller: false,
    before: null,
    after: null,
    fetch: null,
    requests,
    votes,
    roster,
    timers,
    live: audioModule.exports.live,
  }
  const state = (callId) => ({
    gameId: "synthetic-room",
    epoch: f.epoch,
    acceptingAnswers: f.accepting,
    answersCount: f.answersCount,
    answeredCurrentQuestion: votes.has(f.epoch + ":" + callId),
    isSurvey: true,
  })
  const backendFetch = async (_url, options) => {
    if (f.fetch) return f.fetch(options)
    const body = JSON.parse(options.body)
    requests.push(body)
    if (f.before) await f.before(body)
    if (!rosters.has(body.phone))
      rosters.set(body.phone, {
        activeCallId: null,
        connected: false,
        points: 0,
      })
    const currentRoster = rosters.get(body.phone)
    let data = {
      ok: true,
      joined: true,
      rosterPlayerId: "roster-" + body.phone,
    }
    let status = 200
    if (f.rejectCaller && body.action === "join_or_poll") {
      status = 403
      data = { reason: "phone_invite_only" }
    } else if (body.action === "join_or_poll") {
      // Mirrors existing route behavior: a cached connected roster is polled,
      // while a new call joins/rebinds. This is a test double, not server QA.
      if (!body.rosterPlayerId || !currentRoster.connected) {
        currentRoster.activeCallId = body.callId
        currentRoster.connected = true
      }
    } else if (body.action === "hangup") {
      if (currentRoster.activeCallId === body.callId)
        currentRoster.connected = false
      data = { ok: true, disconnected: !currentRoster.connected }
    } else if (body.action === "answer") {
      const key = f.epoch + ":" + body.callId
      const reason =
        body.callId !== currentRoster.activeCallId
          ? "stale_call"
          : body.epoch !== f.epoch
            ? "stale_question_epoch"
            : !f.accepting
              ? "not_accepting_answers"
              : votes.has(key)
                ? "duplicate_answer"
                : null
      const accepted = !reason
      if (accepted) votes.set(key, body.answerIndex)
      data = { ...data, accepted, reason, isSurvey: true }
    }
    data.state = state(body.callId)
    if (f.after) await f.after(body, data)
    return { status, ok: status === 200, json: async () => data }
  }
  const gatewayModule = { exports: {} }
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "tada-pilot-gateway.cjs"), "utf8"),
    {
      module: gatewayModule,
      require: (name) =>
        name === "node:http"
          ? {
              createServer: (fn) => {
                handler = fn
                return {}
              },
            }
          : name === "./tada-audio-logic.cjs"
            ? audioModule.exports
            : require(name),
      process: {
        env: { TADA_PILOT_SECRET: "synthetic-only-gateway-fault-test-secret" },
      },
      Buffer,
      URL,
      URLSearchParams,
      AbortController,
      Date,
      fetch: backendFetch,
      setTimeout: (fn) => {
        const id = ++timerId
        timers.set(id, fn)
        return id
      },
      clearTimeout: (id) => timers.delete(id),
      console: { log() {}, error() {} },
    },
  )
  f.backend = gatewayModule.exports.callRazziaBackend
  f.expire = () => {
    for (const [id, fn] of [...timers]) {
      timers.delete(id)
      fn()
    }
  }
  f.call = (id, values = {}, phone = "synthetic-phone-one") => {
    const response = deferred()
    const req = new EventEmitter()
    req.url = "/yemot/synthetic-only-gateway-fault-test-secret"
    req.method = "POST"
    req.headers = { "content-type": "application/x-www-form-urlencoded" }
    req.destroy = () => {
      req.destroyed = true
      req.emit("aborted")
    }
    const res = { writeHead() {}, end: (body) => response.resolve(body) }
    handler(req, res)
    req.emit(
      "data",
      Buffer.from(
        new URLSearchParams({
          ApiCallId: id,
          ApiPhone: phone,
          ...values,
        }).toString(),
      ),
    )
    req.emit("end")
    return response.promise
  }
  return f
}

test("gateway maps 1..5 across two questions and rejects invalid, duplicate and closed-window input", async () => {
  const f = fixture()
  for (let digit = 1; digit <= 5; digit++) {
    const id = "synthetic-dtmf-" + digit
    await f.call(id, {}, "synthetic-phone-" + digit)
    await f.call(id, { td1: String(digit) }, "synthetic-phone-" + digit)
    assert.equal(f.votes.get("1:" + hash(id).slice(0, 24)), digit - 1)
    await f.call(id, { td2: String(digit) }, "synthetic-phone-" + digit)
  }
  assert.equal(f.votes.size, 5)
  f.epoch = 2
  for (let digit = 1; digit <= 5; digit++) {
    const id = "synthetic-dtmf-" + digit
    await f.call(id, { td3: String(digit) }, "synthetic-phone-" + digit)
  }
  assert.equal(f.votes.size, 10)
  const invalid = "synthetic-invalid"
  await f.call(invalid, {}, "synthetic-invalid-phone")
  for (const [i, digit] of ["0", "6", "9", "*", "#"].entries()) {
    assert.match(
      await f.call(
        invalid,
        { ["td" + (i + 1)]: digit },
        "synthetic-invalid-phone",
      ),
      /f-\/9\/004/,
    )
  }
  f.accepting = false
  await f.call(invalid, { td6: "1" }, "synthetic-invalid-phone")
  assert.equal(f.votes.size, 10)
})

test("A to B redial survives late A hangup and rejects closed/reused A callbacks", async () => {
  const f = fixture()
  await f.call("synthetic-call-A")
  await f.call("synthetic-call-B")
  const b = hash("synthetic-call-B").slice(0, 24)
  await f.call("synthetic-call-A", { hangup: "yes" })
  assert.equal(f.roster.activeCallId, b)
  assert.equal(f.roster.connected, true)
  const before = f.requests.length
  assert.equal(await f.call("synthetic-call-A", { td1: "1" }), "hangup")
  assert.equal(
    f.requests.length,
    before,
    "closed call cannot silently join/rebind on delayed callbacks",
  )
  assert.equal(f.roster.activeCallId, b)
  await f.call("synthetic-call-B", { td1: "5" })
  assert.equal(f.votes.get("1:" + b), 4)
})

test("overlapping duplicate provider callbacks issue only one answer request", async () => {
  const f = fixture()
  await f.call("synthetic-duplicate")
  const entered = deferred(),
    release = deferred()
  f.after = async (body) => {
    if (body.action === "answer") {
      entered.resolve()
      await release.promise
    }
  }
  const first = f.call("synthetic-duplicate", { td1: "5" })
  await entered.promise
  const duplicate = f.call("synthetic-duplicate", { td1: "5" })
  await flush()
  release.resolve()
  await Promise.all([first, duplicate])
  assert.equal(f.requests.filter((x) => x.action === "answer").length, 1)
  assert.equal(f.votes.size, 1)
})

test("superseded A cannot rebind after B disconnects, even without an A hangup", async () => {
  const f = fixture()
  await f.call("synthetic-superseded-A")
  await f.call("synthetic-superseded-B")
  await f.call("synthetic-superseded-B", { hangup: "yes" })
  assert.equal(f.roster.connected, false)
  const before = f.requests.length
  assert.equal(await f.call("synthetic-superseded-A", { td1: "1" }), "hangup")
  assert.equal(f.requests.length, before)
  assert.equal(f.roster.connected, false)
})

test("delayed initial A join cannot arrive after the newer B rebind", async () => {
  const f = fixture()
  const entered = deferred(),
    release = deferred()
  let held = false
  f.before = async (body) => {
    if (body.action === "join_or_poll" && !held) {
      held = true
      entered.resolve()
      await release.promise
    }
  }
  const a = f.call("synthetic-delayed-A")
  await entered.promise
  const b = f.call("synthetic-delayed-B")
  await flush()
  release.resolve()
  await Promise.all([a, b])
  assert.equal(f.roster.activeCallId, hash("synthetic-delayed-B").slice(0, 24))
})

test("failed hangup cleanup can be retried without reopening the call", async () => {
  const f = fixture()
  await f.call("synthetic-cleanup")
  f.before = async (body) => {
    if (body.action === "hangup") throw new Error("synthetic disconnect")
  }
  assert.equal(await f.call("synthetic-cleanup", { hangup: "yes" }), "hangup")
  assert.equal(f.live.size, 0)
  assert.equal(f.roster.connected, true, "backend cleanup has not happened")
  f.before = null
  assert.equal(await f.call("synthetic-cleanup", { hangup: "yes" }), "hangup")
  assert.equal(f.roster.connected, false)
  const before = f.requests.length
  assert.equal(await f.call("synthetic-cleanup", { td1: "5" }), "hangup")
  assert.equal(f.requests.length, before)
})

test("hangup during an in-flight poll prevents a later answer and cleans the joined session", async () => {
  const f = fixture()
  await f.call("synthetic-inflight")
  const entered = deferred(),
    release = deferred()
  f.after = async (body) => {
    if (body.action === "join_or_poll") {
      entered.resolve()
      await release.promise
    }
  }
  const digit = f.call("synthetic-inflight", { td1: "1" })
  await entered.promise
  const hangup = f.call("synthetic-inflight", { hangup: "yes" })
  await flush()
  release.resolve()
  await Promise.all([digit, hangup])
  assert.equal(f.requests.filter((x) => x.action === "answer").length, 0)
  assert.equal(f.roster.connected, false)
  assert.equal(f.live.size, 0)
})

test("out-of-order poll delivery cannot roll the local epoch back", async () => {
  const f = fixture()
  await f.call("synthetic-outoforder")
  const entered = deferred(),
    release = deferred()
  let held = false
  f.after = async (body) => {
    if (body.action === "join_or_poll" && !held) {
      held = true
      entered.resolve()
      await release.promise
    }
  }
  const oldPoll = f.call("synthetic-outoforder")
  await entered.promise
  f.epoch = 2
  const newPoll = f.call("synthetic-outoforder")
  await flush()
  release.resolve()
  await Promise.all([oldPoll, newPoll])
  assert.equal(f.live.get(hash("synthetic-outoforder")).questionEpoch, 2)
})

test("epoch advance between poll and answer stays rejected without a guessed verdict", async () => {
  const f = fixture()
  await f.call("synthetic-staleepoch")
  f.before = async (body) => {
    if (body.action === "answer") f.epoch = 2
  }
  const response = await f.call("synthetic-staleepoch", { td1: "5" })
  assert.equal(f.votes.size, 0)
  assert.match(response, /f-\/9\/004/)
  assert.doesNotMatch(response, /f-\/9\/00[23]/)
  assert.equal(f.requests.find((x) => x.action === "answer").epoch, 1)
})

test("out-of-order consumed read keys cannot answer a later question", async () => {
  const f = fixture()
  await f.call("synthetic-oldkey")
  await f.call("synthetic-oldkey", { td1: "1" })
  f.epoch = 2
  const before = f.requests.filter((x) => x.action === "answer").length
  await f.call("synthetic-oldkey", { td1: "5" })
  assert.equal(f.requests.filter((x) => x.action === "answer").length, before)
  await f.call("synthetic-oldkey", { td2: "5" })
  assert.equal(f.votes.get("2:" + hash("synthetic-oldkey").slice(0, 24)), 4)
})

test("backend disconnect leaves an unconfirmed call silent and permits a safe retry", async () => {
  const f = fixture()
  f.fetch = async () => {
    throw new Error("synthetic disconnect")
  }
  const response = await f.call("synthetic-retry")
  assert.match(response, /f-\/9\/000\.f-\/9\/005/)
  assert.doesNotMatch(response, /f-\/9\/001/)
  assert.equal(f.timers.size, 0)
  f.fetch = null
  assert.match(await f.call("synthetic-retry"), /f-\/9\/001/)
  await f.call("synthetic-retry", { hangup: "yes" })
  assert.equal(f.live.size, 0)
  assert.equal(f.roster.connected, false)
})

test(
  "one caller's stalled poll does not block an independent caller",
  { timeout: 1000 },
  async () => {
    const f = fixture()
    const entered = deferred(),
      release = deferred()
    f.before = async (body) => {
      if (body.phone === "synthetic-phone-one") {
        entered.resolve()
        await release.promise
      }
    }
    const a = f.call("synthetic-independent-A")
    await entered.promise
    try {
      assert.match(
        await f.call("synthetic-independent-B", {}, "synthetic-other-phone"),
        /read=/,
      )
    } finally {
      release.resolve()
      await a
    }
  },
)

test("invitation-only rejection removes the local session without a join cue", async () => {
  const f = fixture()
  f.rejectCaller = true
  assert.equal(await f.call("synthetic-uninvited"), "hangup")
  assert.equal(f.live.size, 0)
  assert.equal(f.requests.filter((x) => x.action === "answer").length, 0)
})

test("failed backend fetch always disposes its deadline timer", async () => {
  const f = fixture()
  f.fetch = async () => {
    throw new Error("synthetic disconnect")
  }
  assert.equal((await f.backend({ action: "join_or_poll" })).status, 0)
  assert.equal(f.timers.size, 0)
})

test("backend deadline covers a stalled response body, not just headers", async () => {
  const f = fixture()
  const entered = deferred(),
    body = deferred()
  f.fetch = async ({ signal }) => ({
    status: 200,
    ok: true,
    json: () => {
      signal.addEventListener(
        "abort",
        () => body.reject(new Error("synthetic abort")),
        { once: true },
      )
      entered.resolve()
      return body.promise
    },
  })
  const result = f.backend({ action: "join_or_poll" })
  await entered.promise
  try {
    assert.equal(
      f.timers.size,
      1,
      "deadline remains armed until body has completed",
    )
    f.expire()
    assert.equal((await result).ok, false)
    assert.equal(f.timers.size, 0)
  } finally {
    body.reject(new Error("fixture cleanup"))
    await result
  }
})
