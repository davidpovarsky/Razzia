// QA fixture protocol only. No real gateway storage or authentication authority.
import { randomBytes } from "node:crypto"
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { normalizePhoneE164 } from "@razzia/extensions/core"
import {
  capabilityHash,
  identifier,
  validateContext,
  type Action,
  type RegistrationInput,
  type VerifiedServiceContext,
} from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"

export type ExpectedAttempt = Omit<RegistrationInput, "capability">
type Scope = Omit<VerifiedServiceContext, "verified">
export interface ScopedFixtureRecord {
  schema: 1
  protocol: 2
  scope: Scope
  request: RegistrationInput
}
export type VerifyExpectedFixture = (context: VerifiedServiceContext) => boolean

export class ScopedFixtureError extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}
function deny(reason: string): never {
  throw new ScopedFixtureError(reason)
}

function expectedScope(
  context: VerifiedServiceContext,
  verify: VerifyExpectedFixture,
): Scope {
  try {
    validateContext(context, "register")
    if (!verify(context)) deny("expected_context_denied")
    const actions = [...context.actions].sort()
    if (
      actions.length !== new Set(actions).size ||
      actions.some((a) => !["register", "poll", "answer", "hangup"].includes(a))
    )
      deny("expected_context_denied")
    return {
      owner: context.owner,
      game: context.game,
      provider: context.provider,
      issuerSid: context.issuerSid,
      service: context.service,
      executorId: context.executorId,
      actions: actions as Action[],
      expiresAt: context.expiresAt,
    }
  } catch {
    return deny("expected_context_denied")
  }
}
function validateAttempt(attempt: ExpectedAttempt): ExpectedAttempt {
  try {
    identifier(attempt.requestId)
    identifier(attempt.providerReference)
    if (
      typeof attempt.phone !== "string" ||
      normalizePhoneE164(attempt.phone) !== attempt.phone ||
      !Number.isSafeInteger(attempt.expectedPredecessor) ||
      attempt.expectedPredecessor < 0 ||
      attempt.expectedPredecessor >= Number.MAX_SAFE_INTEGER
    )
      deny("expected_attempt_invalid")
    return {
      requestId: attempt.requestId,
      providerReference: attempt.providerReference,
      phone: attempt.phone,
      expectedPredecessor: attempt.expectedPredecessor,
    }
  } catch {
    return deny("expected_attempt_invalid")
  }
}
function privatePath(root: string, requestId: string) {
  const actual = resolve(root)
  if (
    !isAbsolute(root) ||
    actual !== realpathSync(root) ||
    !lstatSync(root).isDirectory() ||
    (lstatSync(root).mode & 0o077) !== 0
  )
    deny("private_fixture_root_required")
  const marker = join(root, "PHONE_V2A_SYNTHETIC_ONLY"),
    stat = lstatSync(marker)
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    readFileSync(marker, "utf8") !== "synthetic-v2a-only\n"
  )
    deny("private_fixture_root_required")
  return join(root, requestId + ".synthetic-journal")
}

// Both the file and parent directory are flushed before this function returns.
// A partial record after failure is unusable; no automatic replacement/recovery.
export function writeScopedPrecommit(
  root: string,
  context: VerifiedServiceContext,
  expected: ExpectedAttempt,
  verify: VerifyExpectedFixture,
): RegistrationInput {
  const scope = expectedScope(context, verify),
    attempt = validateAttempt(expected)
  const path = privatePath(root, attempt.requestId)
  const request = { ...attempt, capability: randomBytes(32).toString("hex") }
  const record: ScopedFixtureRecord = { schema: 1, protocol: 2, scope, request }
  const bytes = Buffer.from(JSON.stringify(record) + "\n"),
    fd = openSync(path, "wx", 0o600)
  try {
    let offset = 0
    while (offset < bytes.length) {
      const n = writeSync(fd, bytes, offset)
      if (n <= 0) deny("fixture_write_failed")
      offset += n
    }
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  const directory = openSync(root, "r")
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
  return request
}

export function reopenScopedPrecommit(
  root: string,
  expectedContext: VerifiedServiceContext,
  expectedAttempt: ExpectedAttempt,
  verify: VerifyExpectedFixture,
): ScopedFixtureRecord {
  // Independently held fixture authority, not journal assertions, permits read.
  const scope = expectedScope(expectedContext, verify),
    attempt = validateAttempt(expectedAttempt)
  try {
    const path = privatePath(root, attempt.requestId),
      stat = lstatSync(path)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > 8192
    )
      deny("scoped_record_invalid")
    const text = readFileSync(path, "utf8"),
      record = JSON.parse(text) as ScopedFixtureRecord
    if (
      record.schema !== 1 ||
      record.protocol !== 2 ||
      JSON.stringify(record.scope) !== JSON.stringify(scope)
    )
      deny("scoped_record_mismatch")
    const request = record.request
    capabilityHash(request.capability)
    const canonical: ScopedFixtureRecord = {
      schema: 1,
      protocol: 2,
      scope: record.scope,
      request: { ...attempt, capability: request.capability },
    }
    // All required fields, immutable attempt data, unexpected fields and even
    // duplicate/noncanonical JSON must match the one durable writer protocol.
    if (text !== JSON.stringify(canonical) + "\n")
      deny("scoped_record_mismatch")
    return record
  } catch (error) {
    // JSON/parser/filesystem diagnostics must never echo raw capability bytes.
    if (error instanceof ScopedFixtureError) throw error
    return deny("scoped_record_unavailable")
  }
}

export function dispatchScopedRegistration<T>(
  root: string,
  expectedContext: VerifiedServiceContext,
  expectedAttempt: ExpectedAttempt,
  verify: VerifyExpectedFixture,
  dispatch: (context: VerifiedServiceContext, request: RegistrationInput) => T,
): T {
  const record = reopenScopedPrecommit(
    root,
    expectedContext,
    expectedAttempt,
    verify,
  )
  const context: VerifiedServiceContext = Object.freeze({
    ...record.scope,
    actions: Object.freeze([...record.scope.actions]),
    // This flag comes from the independently verified synthetic source. Reading
    // a journal cannot authenticate a caller, service or account.
    verified: expectedContext.verified,
  })
  expectedScope(context, verify)
  return dispatch(context, record.request)
}
