import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
} from "node:fs"
import { isAbsolute, join, parse, resolve, sep } from "node:path"
import {
  type FirstPartyBindings,
  type FirstPartySessionPrincipal,
  assertFirstPartyBindings,
} from "./bindings.ts"
import { ToolError } from "../server/errors.ts"

const unavailable = () => new ToolError("DEPENDENCY_UNAVAILABLE")
const missing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

/**
 * Service-owned local root; no cached DB or ambient-owner fallback. No file
 * access precedes the real session/scope check. No hostile-OS race guarantee.
 */

export class OwnedStorePath {
  constructor(private readonly auth: FirstPartyBindings) {
    assertFirstPartyBindings(auth)
  }
  check(p: FirstPartySessionPrincipal) {
    this.auth.assertActive(p)
  }
  private static ancestry(target: string, createFrom?: string) {
    const absolute = resolve(target)
    let current = parse(absolute).root
    for (const component of absolute
      .slice(current.length)
      .split(sep)
      .filter(Boolean)) {
      current = join(current, component)

      try {
        const stat = lstatSync(current)

        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw unavailable()
        }
      } catch (error) {
        if (!missing(error)) {
          throw unavailable()
        }

        if (!createFrom) {
          return false
        }

        if (current !== createFrom && !current.startsWith(createFrom + sep)) {
          throw unavailable()
        }

        mkdirSync(current, { mode: 0o700 })
        const made = lstatSync(current)

        if (!made.isDirectory() || made.isSymbolicLink()) {
          throw unavailable()
        }
      }
    }

    return true
  }
  path(
    p: FirstPartySessionPrincipal,
    mutation: boolean,
  ): { file: string; exists: boolean } | undefined {
    this.check(p)
    const { root } = this.auth

    if (!isAbsolute(root) || root === parse(root).root) {
      throw unavailable()
    }

    if (!OwnedStorePath.ancestry(root)) {
      throw unavailable()
    }

    const owned = join(root, "tenants", p.accountId)
    const dir = join(owned, "extensions", "mcp-first-party")

    if (
      !OwnedStorePath.ancestry(
        dir,
        mutation ? join(root, "tenants") : undefined,
      )
    ) {
      return undefined
    }

    const file = join(dir, "drafts.sqlite")
    // ANY sidecar means concurrent/recovery/WAL state; GET never resolves it.
    for (const suffix of ["-journal", "-wal", "-shm"]) {
      try {
        lstatSync(file + suffix)
        throw unavailable()
      } catch (error) {
        if (!missing(error)) {
          throw error
        }
      }
    }
    let exists = true

    try {
      const stat = lstatSync(file)

      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw unavailable()
      }

      const fd = openSync(
        file,
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- Keep the existing cross-platform fallback because this optional native flag is absent on some supported hosts.
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      )

      try {
        const actual = fstatSync(fd)

        if (stat.ino !== actual.ino || stat.dev !== actual.dev) {
          throw unavailable()
        }

        const header = Buffer.alloc(100)

        if (
          readSync(fd, header, 0, 100, 0) !== 100 ||
          header.subarray(0, 16).toString("binary") !== "SQLite format 3\0" ||
          header[18] !== 1 ||
          header[19] !== 1
        ) {
          throw unavailable()
        }
      } finally {
        closeSync(fd)
      }
    } catch (error) {
      if (missing(error)) {
        exists = false
      } else {
        throw error
      }
    }

    this.check(p)

    return exists || mutation ? { file, exists } : undefined
  }
}
