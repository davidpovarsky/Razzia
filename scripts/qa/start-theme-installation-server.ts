/** Only disposable remote fixtures. This script must never provision a real account. */
import { tmpdir } from "node:os"
import { resolve, relative } from "node:path"
import {
  registerAccount,
  issueCode,
  consumeCode,
} from "../../packages/socket/src/services/account-auth"
import { ensureAccountStorage } from "../../packages/socket/src/services/account-directory"

const config = process.env.CONFIG_PATH && resolve(process.env.CONFIG_PATH)

if (
  process.env.TADAZZ_REMOTE_QA !== "1" ||
  !config ||
  !relative(resolve(tmpdir()), config).startsWith("tadazz-theme-installation-")
) {
  throw new Error(
    "Only the remote disposable theme-installation configuration is allowed",
  )
}

const password = "Theme-QA-only-password-2026"
async function provision(email: string) {
  const user = await registerAccount(email, password)
  consumeCode(email, "verify", issueCode(user.id, "verify"))
  ensureAccountStorage(user.id)

  return user.id
}
const author = await provision("theme-author@example.invalid")
const reviewer = await provision("theme-reviewer@example.invalid")
await provision("theme-stranger@example.invalid")
process.env.TADAZZ_THEME_WORKSPACE_GRANTS = JSON.stringify({
  [author]: { [author]: ["author", "publish"] },
  [reviewer]: { [author]: ["review", "publish"] },
})
await import("../../packages/socket/src/index")
