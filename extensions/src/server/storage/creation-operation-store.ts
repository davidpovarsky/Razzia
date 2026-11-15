import fs from "node:fs"
import {
  computeCanonicalBaseDigest,
  type AnyQuizExtras,
} from "../../core/index"
import {
  assertPrivateCreationDirectory,
  type CreationScope,
} from "./creation-scope"
import {
  assertDirectoryChain,
  ensureDurableDirectory,
  replaceDurablePrivateRecord,
  syncDirectory,
  syncOwnedFile,
  writeDurableExclusive,
  type DurableImage,
} from "./durable-files"
import {
  assertOperationReference,
  NativeOperationConflict,
  operationPaths,
  originalOperationResult,
  readOperation,
  type CreationOperationReference,
  type OperationState,
  type OperationTarget,
} from "./creation-operation-record"
import type {
  NativeCreationOperationBinding,
  NativeCreationOperationStatus,
} from "./creation-operation-types"

export interface OperationIntent {
  scope: CreationScope
  quizId: string
  nonce: string
  logicalDigest: string
  targetBase: Pick<DurableImage, "sha256">
  targetSidecar: Pick<DurableImage, "sha256"> | null
  phase: string
  operation?: CreationOperationReference
}

export function freezeOperationInput(
  input: Record<string, unknown>,
  extras: AnyQuizExtras | null,
) {
  const raw = JSON.stringify({ input, extras })

  if (Buffer.byteLength(raw) > 4 * 1024 * 1024) {
    throw new Error("Native operation input exceeds bound")
  }

  const frozen = JSON.parse(raw) as {
    input: Record<string, unknown>
    extras: AnyQuizExtras | null
  }

  return { ...frozen, requestDigest: computeCanonicalBaseDigest(frozen) }
}

export function claimOperation(
  scope: CreationScope,
  binding: NativeCreationOperationBinding,
  requestDigest: string,
): OperationState {
  const paths = operationPaths(scope, binding)
  ensureDurableDirectory(scope.root)
  ensureDurableDirectory(paths.registry)
  assertPrivateCreationDirectory(paths.registry)
  // Exclusive directory CAS establishes identity before allocation/publication.
  fs.mkdirSync(paths.slot, { mode: 0o700 })
  assertPrivateCreationDirectory(paths.slot)
  syncDirectory(paths.slot)
  syncDirectory(paths.registry)
  const value: OperationState["value"] = {
    version: 1,
    kind: "native-create-operation",
    binding: { ...binding },
    requestDigest,
    scope,
    pins: {
      configured: assertDirectoryChain(scope.configuredRoot),
      root: assertDirectoryChain(scope.root),
      registry: assertDirectoryChain(paths.registry),
      slot: assertDirectoryChain(paths.slot),
    },
    phase: "claimed",
    target: null,
    result: null,
  }
  const image = writeDurableExclusive(
    paths.file,
    JSON.stringify(value, null, 2),
  )

  return { value, image, slot: paths.slot }
}

export function operationReference(
  state: OperationState,
): CreationOperationReference {
  return { ...state.value.binding, requestDigest: state.value.requestDigest }
}

export function intentOperationTarget(
  intent: OperationIntent,
): OperationTarget {
  return {
    quizId: intent.quizId,
    nonce: intent.nonce,
    logicalDigest: intent.logicalDigest,
    baseSha256: intent.targetBase.sha256,
    sidecarSha256: intent.targetSidecar?.sha256 ?? null,
  }
}

function replaceOperation(
  state: OperationState,
  value: OperationState["value"],
) {
  const current = readOperation(state.value.scope, state.value.binding)

  if (
    !current ||
    current.image.raw !== state.image.raw ||
    current.image.ino !== state.image.ino ||
    current.image.dev !== state.image.dev
  ) {
    throw new Error("Native operation CAS lost; evidence retained")
  }

  const { file } = operationPaths(state.value.scope, state.value.binding)
  state.image = replaceDurablePrivateRecord(
    file,
    JSON.stringify(value, null, 2),
    state.image,
  )
  state.value = value
}

export function bindOperationTarget(
  state: OperationState,
  intent: OperationIntent,
) {
  if (
    state.value.phase !== "claimed" ||
    computeCanonicalBaseDigest(state.value.scope) !==
      computeCanonicalBaseDigest(intent.scope) ||
    state.value.target !== null ||
    computeCanonicalBaseDigest(operationReference(state)) !==
      computeCanonicalBaseDigest(intent.operation)
  ) {
    throw new Error("Native operation target association mismatch")
  }

  replaceOperation(state, {
    ...state.value,
    phase: "reserved",
    target: intentOperationTarget(intent),
  })
}

export function settleIntentOperation(intent: OperationIntent) {
  if (!intent.operation) {
    return
  }

  assertOperationReference(intent.operation)
  const { requestDigest, ...binding } = intent.operation
  const state = readOperation(intent.scope, binding)

  if (!state || state.value.requestDigest !== requestDigest) {
    throw new Error("Missing or mismatched native operation witness")
  }

  const target = intentOperationTarget(intent)

  if (
    state.value.target &&
    computeCanonicalBaseDigest(state.value.target) !==
      computeCanonicalBaseDigest(target)
  ) {
    throw new Error("Native operation target changed")
  }

  if (intent.phase === "committed") {
    if (state.value.phase === "committed") {
      fenceOperation(state)

      return
    }

    if (state.value.phase !== "reserved") {
      throw new Error("Unresolved native operation commit")
    }

    replaceOperation(state, {
      ...state.value,
      phase: "committed",
      result: originalOperationResult(target),
    })
  } else if (intent.phase === "rolled-back") {
    if (state.value.phase === "committed") {
      throw new Error("Committed operation cannot roll back")
    }

    replaceOperation(state, {
      ...state.value,
      phase: "unresolved",
      target,
      result: null,
    })
  } else {
    throw new Error("Operation intent is not durably resolved")
  }
}

export function fenceOperation(state: OperationState) {
  const { file } = operationPaths(state.value.scope, state.value.binding)
  syncOwnedFile(file, state.image)
  syncDirectory(state.slot)
  syncDirectory(operationPaths(state.value.scope, state.value.binding).registry)
}

export function operationStatus(
  state: OperationState,
): NativeCreationOperationStatus {
  if (state.value.phase === "committed" && state.value.result) {
    fenceOperation(state)

    return { status: "committed", result: { ...state.value.result } }
  }

  return {
    status: state.value.phase === "reserved" ? "reserved" : "unresolved",
    quizId: state.value.target?.quizId ?? null,
  }
}

export function assertOperationRequest(
  state: OperationState,
  requestDigest: string,
) {
  if (state.value.requestDigest !== requestDigest) {
    throw new NativeOperationConflict("Native operation content changed")
  }
}
