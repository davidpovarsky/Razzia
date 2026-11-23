import fs from "node:fs"
import path from "node:path"
import { recoverStartupJournals } from "../media-library"
import type { StartupOwnerSnapshot } from "./startup-owner-snapshot"

export type { StartupOwnerSnapshot } from "./startup-owner-snapshot"

// Internal startup composition. Snapshot comes only from the native owner
// provider, never request input. Admit every known root before journal writes.
//
export function recoverStartupOwnerJournals(snapshot: StartupOwnerSnapshot) {
  snapshot.assertUnchanged()
  const configuredRoot = path.resolve(snapshot.configuredRoot)

  if (
    configuredRoot !== snapshot.configuredRoot ||
    fs.realpathSync(configuredRoot) !== configuredRoot
  ) {
    throw new Error("Invalid configured recovery root")
  }

  if (
    !["legacy-global-only", "accounts"].includes(snapshot.mode) ||
    (snapshot.mode === "legacy-global-only" && snapshot.ownerIds.length)
  ) {
    throw new Error("Invalid recovery owner snapshot mode")
  }

  const seen = new Set<string>()
  for (const id of snapshot.ownerIds) {
    if (
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(id) ||
      seen.has(id.toLowerCase())
    ) {
      throw new Error("Invalid or conflicting snapshot owner")
    }

    seen.add(id.toLowerCase())
  }
  const roots = [configuredRoot]
  for (const owner of snapshot.ownerIds) {
    const parent = path.join(configuredRoot, "tenants"),
      root = path.join(parent, owner)
    for (const directory of [parent, root]) {
      try {
        const stat = fs.lstatSync(directory)

        if (
          !stat.isDirectory() ||
          stat.isSymbolicLink() ||
          fs.realpathSync(directory) !== directory
        ) {
          throw new Error("Unsafe known recovery root")
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error
        }
      }
    }

    if (fs.existsSync(root)) {
      roots.push(root)
    }
  }
  const bindings = roots.map((root) => {
    const identity = fs.lstatSync(root, { bigint: true })
    const getPath = (relative = "") => {
      const current = fs.lstatSync(root, { bigint: true })

      if (
        current.dev !== identity.dev ||
        current.ino !== identity.ino ||
        current.isSymbolicLink()
      ) {
        throw new Error("Recovery root changed")
      }

      if (path.isAbsolute(relative) || relative.includes(":")) {
        throw new Error("Unsafe recovery relative path")
      }

      const parts = relative.replaceAll("\\", "/").split("/")

      if (parts.some((part) => part === "." || part === "..")) {
        throw new Error("Unsafe recovery relative path")
      }

      let resolved = root
      for (const part of parts.filter(Boolean)) {
        resolved = path.join(resolved, part)

        try {
          if (fs.lstatSync(resolved).isSymbolicLink()) {
            throw new Error("Linked recovery path")
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error
          }
        }
      }

      return resolved
    }
    for (const relative of [
      "quizz",
      "media",
      "extensions/quizzes/.journal/media-delete",
    ]) {
      getPath(relative)
    }

    return { root, getPath }
  })

  return bindings.map(({ root, getPath }) => {
    snapshot.assertUnchanged()

    return { root, report: recoverStartupJournals({ getPath }) }
  })
}
