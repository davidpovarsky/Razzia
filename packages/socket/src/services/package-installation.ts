import path from "node:path"
import { createHmac } from "node:crypto"
import { PackageStore } from "@razzia/extensions/server"
import { resolveConfigRoot } from "./config-scope"
import { accountsEnabled } from "./account-scope"

export const packageInstallerEnabled = () =>
  process.env.TADAZZ_PACKAGE_INSTALLER_ENABLED === "true" &&
  (accountsEnabled() || process.env.TADAZZ_REMOTE_QA === "1")

export const packageRuntimeEnabled = () =>
  packageInstallerEnabled() &&
  process.env.TADAZZ_PACKAGE_RUNTIME_ENABLED === "true"

let store: PackageStore | undefined = undefined
let storeRoot = ""

export function packageRuntimeSecret() {
  const secret = process.env.JWT_SECRET

  if (!secret || secret.length < 32) {
    throw new Error("Persistent signing secret required")
  }

  return createHmac("sha256", secret)
    .update("tadazz-package-runtime-v1")
    .digest("hex")
}

export function packageStore() {
  if (!packageInstallerEnabled()) {
    throw new Error("Package installer disabled")
  }

  const root = resolveConfigRoot()

  if (!store || storeRoot !== root) {
    store?.close()
    store = new PackageStore(
      path.join(root, "extensions/packages"),
      packageRuntimeSecret(),
      (tenant) =>
        accountsEnabled() ? path.join(root, "tenants", tenant) : root,
    )
    storeRoot = root
  }

  return store
}

export function closePackageStore() {
  store?.close()
  store = undefined
  storeRoot = ""
}

export function installedPackageThemes(tenant: string, active = false) {
  return packageInstallerEnabled()
    ? packageStore()
        .catalog(tenant, active)
        .filter((d) => !d.sandbox || packageRuntimeEnabled())
    : []
}
