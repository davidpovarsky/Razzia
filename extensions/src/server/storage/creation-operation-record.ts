import fs from "node:fs"
import path from "node:path"
import { computeCanonicalBaseDigest } from "../../core/index"
import {
  creationFamily,
  assertPrivateCreationDirectory,
  type CreationScope,
} from "./creation-scope"
import {
  assertDirectoryChain,
  lstatOrMissing,
  readDurableFile,
  sameDurableIdentity,
  type DurableIdentity,
  type DurableImage,
} from "./durable-files"
import type {
  NativeCreationResult,
  NativeCreationOperationBinding,
} from "./creation-operation-types"

export const OPERATION_FAMILY = ".tadazz-creation-operations-v1"

const HASH = /^[a-f0-9]{64}$/u
const ID = /^[A-Za-z0-9_-]{21}$/u
const NONCE = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u

export class NativeOperationConflict extends Error {}

export interface CreationOperationReference extends NativeCreationOperationBinding {
  requestDigest: string
}

export interface OperationTarget {
  quizId: string
  nonce: string
  logicalDigest: string
  baseSha256: string
  sidecarSha256: string | null
}

export interface OperationRecord {
  version: 1
  kind: "native-create-operation"
  binding: NativeCreationOperationBinding
  requestDigest: string
  scope: CreationScope
  pins: {
    configured: DurableIdentity
    root: DurableIdentity
    registry: DurableIdentity
    slot: DurableIdentity
  }
  phase: "claimed" | "reserved" | "committed" | "unresolved"
  target: OperationTarget | null
  result: NativeCreationResult | null
}

export interface OperationState {
  value: OperationRecord
  image: DurableImage
  slot: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function assertOperationBinding(
  binding: unknown,
): asserts binding is NativeCreationOperationBinding {
  if (
    !isRecord(binding) ||
    binding.version !== 1 ||
    typeof binding.operationId !== "string" ||
    !HASH.test(binding.operationId) ||
    typeof binding.authorizationDigest !== "string" ||
    !HASH.test(binding.authorizationDigest) ||
    Object.keys(binding).sort().join(",") !==
      "authorizationDigest,operationId,version"
  ) {
    throw new NativeOperationConflict("Invalid native operation binding")
  }
}

export function assertOperationReference(
  value: unknown,
): asserts value is CreationOperationReference {
  if (
    !isRecord(value) ||
    typeof value.requestDigest !== "string" ||
    typeof value.requestDigest !== "string" ||
    !HASH.test(value.requestDigest)
  ) {
    throw new Error("Invalid native operation request digest")
  }

  const { requestDigest: _request, ...binding } = value
  assertOperationBinding(binding)
}

export function operationPaths(
  scope: CreationScope,
  binding: NativeCreationOperationBinding,
) {
  assertOperationBinding(binding)
  creationFamily(scope)
  const registry = path.join(scope.configuredRoot, OPERATION_FAMILY)
  const slot = path.join(registry, binding.operationId)

  return { registry, slot, file: path.join(slot, "operation.json") }
}

export function originalOperationResult(
  target: OperationTarget,
): NativeCreationResult {
  return {
    quizId: target.quizId,
    revision: 1,
    baseDigest: target.logicalDigest,
  }
}

export function readOperation(
  scope: CreationScope,
  binding: NativeCreationOperationBinding,
): OperationState | null {
  const paths = operationPaths(scope, binding)

  if (!lstatOrMissing(paths.registry)) {
    return null
  }

  assertPrivateCreationDirectory(paths.registry)

  if (!lstatOrMissing(paths.slot)) {
    return null
  }

  assertPrivateCreationDirectory(paths.slot)

  if (fs.readdirSync(paths.slot).join(",") !== "operation.json") {
    throw new Error("Incomplete or foreign native operation evidence")
  }

  const stat = fs.lstatSync(paths.file)

  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size > 16384 ||
    (stat.mode & 0o777) !== 0o600
  ) {
    throw new Error("Unsafe native operation record")
  }

  const image = readDurableFile(paths.file)

  if (!image) {
    throw new Error("Missing native operation record")
  }

  const value = JSON.parse(image.raw) as Partial<OperationRecord> | null

  if (
    value?.version !== 1 ||
    value.kind !== "native-create-operation" ||
    typeof value.requestDigest !== "string" ||
    !HASH.test(value.requestDigest)
  ) {
    throw new Error("Invalid native operation record")
  }

  assertOperationBinding(value.binding)

  if (
    computeCanonicalBaseDigest(value.binding) !==
      computeCanonicalBaseDigest(binding) ||
    computeCanonicalBaseDigest(value.scope) !==
      computeCanonicalBaseDigest(scope)
  ) {
    throw new NativeOperationConflict(
      "Native operation authorization or scope mismatch",
    )
  }

  const pins = value.pins as Partial<OperationRecord["pins"]> | undefined

  for (const [name, directory] of [
    ["configured", scope.configuredRoot],
    ["root", scope.root],
    ["registry", paths.registry],
    ["slot", paths.slot],
  ] as const) {
    if (
      !pins?.[name] ||
      !sameDurableIdentity(assertDirectoryChain(directory), pins[name])
    ) {
      throw new Error("Native operation physical identity changed")
    }
  }

  if (
    typeof value.phase !== "string" ||
    !["claimed", "reserved", "committed", "unresolved"].includes(value.phase)
  ) {
    throw new Error("Invalid native operation phase")
  }

  const { target } = value

  if (
    target !== null &&
    (!target ||
      !ID.test(target.quizId) ||
      !NONCE.test(target.nonce) ||
      !HASH.test(target.logicalDigest) ||
      !HASH.test(target.baseSha256) ||
      (target.sidecarSha256 !== null && !HASH.test(target.sidecarSha256)))
  ) {
    throw new Error("Invalid native operation target")
  }

  if (
    (value.phase === "claimed" && target !== null) ||
    (["reserved", "committed"].includes(value.phase) && !target) ||
    (value.phase === "committed"
      ? !target ||
        computeCanonicalBaseDigest(value.result) !==
          computeCanonicalBaseDigest(originalOperationResult(target))
      : value.result !== null)
  ) {
    throw new Error("Inconsistent native operation outcome")
  }

  return { value: value as OperationRecord, image, slot: paths.slot }
}
