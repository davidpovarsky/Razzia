// Server QA only. Configure normal workspace grants for isolated fixture users.
// No product endpoint, default grant, real account or portable-code approval changes.
import { writeFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { initConfig } from "../../../packages/socket/src/services/config"
import { checkAccountConfiguration } from "../../../packages/socket/src/services/account-db"
import {
  registerAccount,
  issueCode,
  consumeCode,
} from "../../../packages/socket/src/services/account-auth"
import { ensureAccountStorage } from "../../../packages/socket/src/services/account-directory"

const root = process.env.CONFIG_PATH

if (
  process.env.TADAZZ_REMOTE_QA !== "1" ||
  !root ||
  resolve(root) !== resolve(import.meta.dirname, "../../.site-test-config")
) {
  throw new Error("Remote isolated Phase 2 QA only")
}

initConfig()
checkAccountConfiguration()
const password = "Isolated-phase2-ui-account-password-2026"
const publisher = await registerAccount(
  `publisher-${crypto.randomUUID()}@example.invalid`,
  password,
)
const collaborator = await registerAccount(
  `collaborator-${crypto.randomUUID()}@example.invalid`,
  password,
)
for (const account of [publisher, collaborator]) {
  if (!consumeCode(account.email, "verify", issueCode(account.id, "verify"))) {
    throw new Error("Fixture verification failed")
  }

  ensureAccountStorage(account.id)
}
process.env.TADAZZ_THEME_WORKSPACE_GRANTS = JSON.stringify({
  [publisher.id]: { [publisher.id]: ["author", "publish"] },
  [collaborator.id]: { [publisher.id]: ["author"] },
})
writeFileSync(
  join(root, "phase2-workspaces.json"),
  JSON.stringify({ publisher, collaborator }),
)
await import("../site-fixture-server")
