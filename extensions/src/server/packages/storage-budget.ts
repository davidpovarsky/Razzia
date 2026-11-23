import fs from "node:fs"
import path from "node:path"
import { PackageError } from "./error"

/** Include retained/orphaned files, so deleting metadata cannot reset disk quotas. */
export function enforcePackageStorageBudget(root: string, incoming: number) {
  const pending = fs.existsSync(root) ? [root] : []
  let bytes = incoming,
    files = 0

  while (pending.length) {
    const directory = pending.pop()

    if (!directory) {
      break
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        pending.push(target)
      } else if (entry.isFile()) {
        bytes += fs.statSync(target).size
        files += 1
      } else {
        throw new PackageError("PACKAGE_STORAGE_INVALID", 409)
      }

      if (bytes > 2_000_000_000 || files > 200_000) {
        throw new PackageError("PACKAGE_QUOTA", 413)
      }
    }
  }

  if (bytes > 2_000_000_000) {
    throw new PackageError("PACKAGE_QUOTA", 413)
  }
}
