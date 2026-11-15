import { DatabaseSync } from "node:sqlite"
import { existsSync, readFileSync } from "node:fs"
if (process.env.PHONE_AUTHORITY_SOURCE_RUN !== "granted") throw new Error("No runtime grant")
const input = JSON.parse(readFileSync(process.env.PHONE_AUTHORITY_WAIT_INPUT!, "utf8")) as {
  authorityFile: string; entered: string; sid: string
}
const { revokeAccountSession } = await import("@razzia/socket/services/account-auth")
const db = new DatabaseSync(input.authorityFile)
db.exec("BEGIN IMMEDIATE")
process.send?.({ held: true })
const deadline = Date.now() + 15000
while (!existsSync(input.entered)) {
  if (Date.now() > deadline) throw new Error("No observed writer BEGIN")
  await new Promise(resolve => setTimeout(resolve, 10))
}
revokeAccountSession(input.sid) // Actual account-session authority, not a lambda.
db.exec("COMMIT"); db.close()
process.send?.({ sessionRevoked: true }, () => process.disconnect?.())
