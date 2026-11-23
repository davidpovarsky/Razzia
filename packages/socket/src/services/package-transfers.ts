import path from "node:path"
import { PackageTransferStore } from "@razzia/extensions/server"
import { resolveConfigRoot } from "./config-scope"
import {
  packageInstallerEnabled,
  packageRuntimeSecret,
} from "./package-installation"

let store: PackageTransferStore | undefined = undefined
let root = ""

export function packageTransfers() {
  if (!packageInstallerEnabled()) {
    throw new Error("Package installer disabled")
  }

  const current = resolveConfigRoot()

  if (!store || root !== current) {
    store?.close()
    store = new PackageTransferStore(
      path.join(current, "extensions/mcp-package-transfers"),
      packageRuntimeSecret(),
    )
    root = current
  }

  return store
}
