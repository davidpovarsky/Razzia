// LOCAL QA ONLY. Real account/API/socket implementation, isolated files, no
// production data or outbound mail. This file is never imported by the product.
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createAdaptorServer } from "@hono/node-server"
import { app, createSocketServer } from "../../packages/socket/src/app"
import { initConfig } from "../../packages/socket/src/services/config"
import { checkAccountConfiguration } from "../../packages/socket/src/services/account-db"

const root = process.env.CONFIG_PATH

const allowed = [
  resolve(import.meta.dirname, "../.site-test-config"),
  resolve(import.meta.dirname, "../../packages/e2e/.config"),
]

if (!root || !allowed.includes(resolve(root))) {
  throw new Error("QA requires its isolated config directory")
}

mkdirSync(root, { recursive: true })
const messages: Record<string, { subject: string; code: string }> = {}
globalThis.fetch = (input, init) => {
  if (
    typeof input !== "string" ||
    input !== "https://api.resend.com/emails" ||
    typeof init?.body !== "string"
  ) {
    throw new Error("QA outbound network blocked")
  }

  const message = JSON.parse(init.body) as {
    to: string[]
    text: string
    subject: string
  }
  const code = /\b\d{6}\b/u.exec(message.text)?.[0]

  if (!code) {
    throw new Error("Expected test email code")
  }

  messages[message.to[0]] = { code, subject: message.subject }
  writeFileSync(join(root, "test-mail.json"), JSON.stringify(messages))

  return Promise.resolve(
    new Response(JSON.stringify({ id: "local-test-mail" }), {
      status: 200,
    }),
  )
}
initConfig()
checkAccountConfiguration()
const server = createAdaptorServer({ fetch: app.fetch })
const io = createSocketServer(server)
server.listen(Number(process.env.SOCKET_PORT), "127.0.0.1", () =>
  console.log("Isolated site QA server ready"),
)
const stop = () => {
  io.close()
  server.close()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
