import type { AnyQuizExtras } from "../../core/studio-migrate"

export interface NativeCreationResult {
  quizId: string
  revision: number
  baseDigest: string
}

// Trusted host derives both hashes from its authenticated immutable operation.
// This is correlation, not a token, caller path, grant or consent authority.
//
export type NativeCreationOperationBinding = Readonly<{
  version: 1
  operationId: string
  authorizationDigest: string
}>

export type NativeCreationOperationStatus =
  | { status: "absent" }
  | { status: "reserved"; quizId: string | null }
  | { status: "committed"; result: NativeCreationResult }
  | { status: "unresolved"; quizId: string | null }

// Optional, synchronous cooperating-writer seam. The host reauthorizes every
// call. Lookup precedes any current-draft read; committed results are historical.
// Interrupted uncommitted publication is never retried as a second creation.
//
export interface NativeCreationOperationPort {
  lookup(binding: NativeCreationOperationBinding): NativeCreationOperationStatus
  create(
    binding: NativeCreationOperationBinding,
    input: Record<string, unknown>,
    extras: AnyQuizExtras | null,
  ): NativeCreationResult
}
