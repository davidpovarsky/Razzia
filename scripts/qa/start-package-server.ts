/** Synthetic account setup for the isolated package staging test, restart-safe. */
import { resolve } from "node:path"
import {
  registerAccount,
  accountForEmail,
  issueCode,
  consumeCode,
} from "../../packages/socket/src/services/account-auth"
import { ensureAccountStorage } from "../../packages/socket/src/services/account-directory"
const config = process.env.CONFIG_PATH && resolve(process.env.CONFIG_PATH)

if (
  process.platform !== "linux" ||
  process.env.TADAZZ_REMOTE_QA !== "1" ||
  !config?.startsWith("/evidence/package-staging-")
) {
  throw new Error("Disposable remote package fixture only")
}

const password = "Package-QA-only-password-2026"
async function provision(email: string) {
  const existing = accountForEmail(email)

  if (existing) {
    return existing.id
  }

  const user = await registerAccount(email, password)
  consumeCode(email, "verify", issueCode(user.id, "verify"))
  ensureAccountStorage(user.id)

  return user.id
}
const author = await provision("package-author@example.invalid")
const reviewer = await provision("package-reviewer@example.invalid")
await provision("package-stranger@example.invalid")
process.env.TADAZZ_THEME_WORKSPACE_GRANTS = JSON.stringify({
  [author]: { [author]: ["author"] },
  [reviewer]: { [author]: ["review"] },
})
await import("../../packages/socket/src/index")
