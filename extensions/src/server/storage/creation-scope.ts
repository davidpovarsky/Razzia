import fs from "node:fs"
import path from "node:path"
import { assertDirectoryChain, lstatOrMissing } from "./durable-files"

export const CREATION_FAMILY = ".tadazz-creation-v1"
const OWNER = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu
export interface CreationScope {
  configuredRoot: string
  root: string
  mode: "tenant" | "legacy-global"
  owner: string | null
}
export interface CreationEnvironment {
  configuredRoot: () => string
  accountsEnabled: () => boolean
  activeOwner: () => string | undefined
  getPath: (subPath?: string) => string
}
/** Called before preparation, ID allocation, collision lookup or private writes.
 * The enabled-account missing-owner fallback of legacy getPath is never used.
 */
export function captureCreationScope(
  environment: CreationEnvironment,
): CreationScope {
  const enabled = environment.accountsEnabled()
  const owner = enabled ? environment.activeOwner() : null
  if (enabled && (!owner || !OWNER.test(owner)))
    throw new Error("Missing or invalid authenticated creation owner")
  const configuredRoot = path.resolve(environment.configuredRoot())
  const root = owner
    ? path.join(configuredRoot, "tenants", owner)
    : configuredRoot
  if (path.resolve(environment.getPath()) !== root)
    throw new Error("Native creation root does not match trusted owner")
  return {
    configuredRoot,
    root,
    mode: enabled ? "tenant" : "legacy-global",
    owner: owner ?? null,
  }
}
export function assertCreationScope(
  environment: CreationEnvironment,
  expected: CreationScope,
) {
  const current = captureCreationScope(environment)
  if (
    current.configuredRoot !== expected.configuredRoot ||
    current.root !== expected.root ||
    current.mode !== expected.mode ||
    current.owner !== expected.owner
  )
    throw new Error("Native creation scope changed during operation")
}
export function creationFamily(scope: CreationScope) {
  if (
    path.resolve(scope.configuredRoot) !== scope.configuredRoot ||
    (scope.mode === "tenant"
      ? !scope.owner ||
        !OWNER.test(scope.owner) ||
        scope.root !== path.join(scope.configuredRoot, "tenants", scope.owner)
      : scope.mode !== "legacy-global" ||
        scope.owner !== null ||
        scope.root !== scope.configuredRoot)
  )
    throw new Error("Invalid persisted creation scope")
  return scope.owner
    ? path.join(scope.configuredRoot, CREATION_FAMILY, "tenants", scope.owner)
    : path.join(scope.configuredRoot, CREATION_FAMILY, "legacy-global")
}
function existingDirectory(directory: string): boolean {
  const current = lstatOrMissing(directory)
  if (!current) {
    const parent = path.dirname(directory)
    if (parent !== directory) existingDirectory(parent)
    return false
  }
  assertDirectoryChain(directory)
  return true
}
/** Enumerates ONLY the service-owned creation registry. It never scans public
 * quizzes, customer tenant data or a real server to guess ownership. Registry
 * owner spelling must match persisted scope exactly; feature-flag changes do
 * not remove either explicit legacy-global or tenant discovery.
 */
export function discoverCreationScopes(
  configuredRootInput: string,
): CreationScope[] {
  const configuredRoot = path.resolve(configuredRootInput)
  const registry = path.join(configuredRoot, CREATION_FAMILY)
  if (!existingDirectory(registry)) return []
  const scopes: CreationScope[] = []
  for (const entry of fs.readdirSync(registry).sort()) {
    const family = path.join(registry, entry)
    assertDirectoryChain(family)
    if (entry === "legacy-global") {
      scopes.push({
        configuredRoot,
        root: configuredRoot,
        mode: "legacy-global",
        owner: null,
      })
    } else if (entry === "tenants") {
      for (const owner of fs.readdirSync(family).sort()) {
        if (!OWNER.test(owner))
          throw new Error("Untrusted creation registry owner")
        assertDirectoryChain(path.join(family, owner))
        scopes.push({
          configuredRoot,
          root: path.join(configuredRoot, "tenants", owner),
          mode: "tenant",
          owner,
        })
      }
    } else throw new Error("Unknown creation registry family")
  }
  return scopes
}
