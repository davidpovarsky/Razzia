import { AsyncLocalStorage } from "node:async_hooks"
import { resolve, sep } from "node:path"

const ownerScope = new AsyncLocalStorage<string>()

export const accountsEnabled = () =>
  process.env.TADAZZ_ACCOUNTS_ENABLED === "true"

export const withAccount = async <T>(
  accountId: string,
  task: () => T | Promise<T>,
): Promise<T> => ownerScope.run(accountId, task)

export const activeAccount = (): string | undefined => ownerScope.getStore()

/** Keep every authenticated tenant's stored resources physically disjoint. */
export const resolveTenantFile = (
  basePath: string,
  relativePath = "",
): string => {
  const owner = activeAccount()
  if (!accountsEnabled() || !owner) return resolve(basePath, relativePath)
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(owner)) {
    throw new Error("Invalid account scope")
  }
  const tenantRoot = resolve(basePath, "tenants", owner)
  const target = resolve(tenantRoot, relativePath)
  if (target !== tenantRoot && !target.startsWith(tenantRoot + sep)) {
    throw new Error("Tenant path traversal rejected")
  }
  return target
}
