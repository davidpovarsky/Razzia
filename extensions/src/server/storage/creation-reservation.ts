import fs from "node:fs"
import path from "node:path"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { quizzValidator } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  quizExtrasV1Schema,
  quizExtrasV2Schema,
  type AnyQuizExtras,
} from "../../core/index"
import {
  assertCreationScope,
  captureCreationScope,
  CREATION_FAMILY,
  creationFamily,
  discoverCreationScopes,
  type CreationEnvironment,
  type CreationScope,
} from "./creation-scope"
import {
  assertDirectoryChain,
  durablePath,
  ensureDurableDirectory,
  lstatOrMissing,
  readDurableFile,
  replaceDurablePrivateRecord,
  requireLinuxFences,
  sameDurableIdentity,
  sameDurableImage,
  syncDirectory,
  syncOwnedFile,
  utf8Image,
  writeDurableExclusive,
  type DurableIdentity,
  type DurableImage,
} from "./durable-files"

export interface NativeCreationResult {
  quizId: string
  revision: number
  baseDigest: string
}
export interface NativeCreationPort {
  assertScope(): void
  create(
    input: Record<string, unknown>,
    extras: AnyQuizExtras | null,
  ): NativeCreationResult
}
interface PreparedNativeQuiz {
  id: string
  baseFileName: string
  normalizedBase: Record<string, unknown>
}
interface Intent {
  version: 1
  kind: "quiz-create"
  phase: "preparing" | "ready" | "committed" | "rolled-back"
  scope: CreationScope
  quizId: string
  baseFileName: string
  nonce: string
  tokenDigest: string
  createdAt: number
  expiresAt: number
  logicalDigest: string
  targetBase: ReturnType<typeof utf8Image>
  targetSidecar: ReturnType<typeof utf8Image> | null
  base: DurableImage | null
  sidecar: DurableImage | null
  slot: DurableIdentity
  configuredRootIdentity: DurableIdentity
  rootIdentity: DurableIdentity
  parentIdentities: { base: DurableIdentity; sidecar: DurableIdentity }
}
interface State {
  intent: Intent
  slot: string
  record: DurableImage
  token: string
  status: "reserved" | "publishing"
}
export type CreationIntent = Intent
const ID = /^[A-Za-z0-9_-]{21}$/u
const NONCE = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const leases = new Set<string>()
const blocked = new Set<string>()
const identity = (directory: string): DurableIdentity => {
  const stat = fs.lstatSync(directory, { bigint: true })
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: Number(stat.mode & 0o777n),
  }
}
const recordPath = (slot: string) => path.join(slot, "intent.json")
function privateDirectory(directory: string) {
  const result = assertDirectoryChain(directory)
  if ((result.mode & 0o077) !== 0)
    throw new Error("Creation registry is not private")
  return result
}
function imageValid(image: ReturnType<typeof utf8Image>) {
  if (!image || typeof image.raw !== "string")
    throw new Error("Missing creation byte image")
  const actual = utf8Image(image.raw)
  if (actual.sha256 !== image.sha256 || actual.length !== image.length)
    throw new Error("Invalid creation byte image")
}
function validateIntent(
  value: unknown,
  scope: CreationScope,
  slot: string,
  resolved: boolean,
): Intent {
  const entry = value as Intent
  if (
    !entry ||
    entry.version !== 1 ||
    entry.kind !== "quiz-create" ||
    !ID.test(entry.quizId) ||
    !NONCE.test(entry.nonce) ||
    !/^[a-f0-9]{64}$/u.test(entry.tokenDigest) ||
    computeCanonicalBaseDigest(entry.scope) !==
      computeCanonicalBaseDigest(scope) ||
    !/^[a-z0-9-]{1,10}-[A-Za-z0-9_-]{8}\.json$/u.test(entry.baseFileName) ||
    !["preparing", "ready", "committed", "rolled-back"].includes(entry.phase) ||
    !Number.isSafeInteger(entry.createdAt) ||
    !Number.isSafeInteger(entry.expiresAt) ||
    entry.expiresAt <= entry.createdAt ||
    path.basename(slot) !==
      (resolved ? `${entry.quizId}-${entry.nonce}` : entry.quizId) ||
    !sameDurableIdentity(identity(slot), entry.slot)
  )
    throw new Error("Foreign, malformed or incompatible creation intent")
  creationFamily(scope)
  privateDirectory(slot)
  publicPaths(entry)
  imageValid(entry.targetBase)
  const base = JSON.parse(entry.targetBase.raw) as Record<string, unknown>
  if (base.id !== entry.quizId)
    throw new Error("Creation base identity mismatch")
  const { id: _matchedId, ...payload } = base
  const validated = quizzValidator.safeParse(payload)
  if (
    !validated.success ||
    computeCanonicalBaseDigest(validated.data) !==
      computeCanonicalBaseDigest(payload) ||
    computeCanonicalBaseDigest(payload) !== entry.logicalDigest
  )
    throw new Error("Creation logical payload/digest mismatch")
  if (entry.targetSidecar !== null) {
    imageValid(entry.targetSidecar)
    const extras = JSON.parse(entry.targetSidecar.raw) as AnyQuizExtras
    const parsed = (
      extras.schemaVersion === 2 ? quizExtrasV2Schema : quizExtrasV1Schema
    ).safeParse(extras)
    if (
      !parsed.success ||
      extras.quizId !== entry.quizId ||
      extras.revision !== 1 ||
      extras.baseDigest !== entry.logicalDigest ||
      computeCanonicalBaseDigest(parsed.data) !==
        computeCanonicalBaseDigest(extras)
    )
      throw new Error("Creation sidecar identity/content mismatch")
  }
  if (entry.phase !== "preparing") {
    if (
      !entry.base ||
      (entry.targetSidecar === null ? entry.sidecar !== null : !entry.sidecar)
    )
      throw new Error("Missing pre-publication inode ownership")
    for (const [owned, target] of [
      [entry.base, entry.targetBase],
      [entry.sidecar, entry.targetSidecar],
    ] as const) {
      if (!owned || !target) continue
      imageValid(owned)
      if (
        !/^\d+$/u.test(owned.dev) ||
        !/^\d+$/u.test(owned.ino) ||
        owned.mode !== 0o600 ||
        owned.raw !== target.raw ||
        owned.sha256 !== target.sha256 ||
        owned.length !== target.length
      )
        throw new Error("Creation witness differs from frozen target")
    }
  }
  return entry
}
function readIntent(scope: CreationScope, slot: string, resolved = false) {
  if (fs.lstatSync(recordPath(slot), { bigint: true }).nlink !== 1n)
    throw new Error("Linked creation intent")
  const record = readDurableFile(recordPath(slot))
  if (!record) throw new Error("Missing creation intent")
  return {
    intent: validateIntent(JSON.parse(record.raw), scope, slot, resolved),
    record,
  }
}
function publicPaths(intent: Intent) {
  if (
    !sameDurableIdentity(
      identity(intent.scope.configuredRoot),
      intent.configuredRootIdentity,
    ) ||
    !sameDurableIdentity(identity(intent.scope.root), intent.rootIdentity)
  )
    throw new Error("Creation physical root identity changed")
  const result = {
    base: durablePath(intent.scope.root, `quizz/${intent.baseFileName}`),
    sidecar: durablePath(
      intent.scope.root,
      `extensions/quizzes/${intent.quizId}.json`,
    ),
  }
  for (const name of ["base", "sidecar"] as const) {
    const parent = identity(path.dirname(result[name]))
    if (
      !sameDurableIdentity(parent, intent.parentIdentities[name]) ||
      parent.dev !== intent.slot.dev
    )
      throw new Error("Creation parent identity/device changed")
  }
  return result
}
function assertNoAmbiguousId(intent: Intent) {
  const directory = path.join(intent.scope.root, "quizz")
  for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith(".json") || name === intent.baseFileName) continue
    const file = path.join(directory, name)
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      if (name === `${intent.quizId}.json`)
        throw new Error("Ambiguous creation ID-named leaf")
      continue
    }
    let value: Record<string, unknown> | null
    try {
      value = JSON.parse(readDurableFile(file)!.raw) as Record<
        string,
        unknown
      > | null
    } catch (error) {
      if (name === `${intent.quizId}.json`) throw error
      continue
    }
    if (
      value?.id === intent.quizId ||
      (typeof value?.id !== "string" && name === `${intent.quizId}.json`)
    )
      throw new Error("Creation native identity is no longer unambiguous")
  }
}
/** Whole pair + BOTH private witnesses are admitted before either public unlink.
 * Public hard links cannot serve as proof of immutable bytes by themselves.
 */
function classifyPair(intent: Intent, slot: string, record: DurableImage) {
  privateDirectory(slot)
  if (!sameDurableIdentity(identity(slot), intent.slot))
    throw new Error("Creation slot changed")
  const currentRecord = readDurableFile(recordPath(slot))
  if (
    !currentRecord ||
    !sameDurableImage(currentRecord, record) ||
    fs.lstatSync(recordPath(slot), { bigint: true }).nlink !== 1n
  )
    throw new Error("Creation intent changed before pair mutation")
  const names = new Set([
    "intent.json",
    "base.record",
    ...(intent.sidecar ? ["sidecar.record"] : []),
  ])
  if (fs.readdirSync(slot).some((name) => !names.has(name)))
    throw new Error("Unknown private creation evidence; retaining whole pair")
  const paths = publicPaths(intent)
  const base = readDurableFile(paths.base),
    sidecar = readDurableFile(paths.sidecar)
  for (const [name, expected, current] of [
    ["base", intent.base, base],
    ["sidecar", intent.sidecar, sidecar],
  ] as const) {
    const witness = readDurableFile(path.join(slot, `${name}.record`))
    if (
      expected
        ? !witness || !sameDurableImage(witness, expected)
        : witness !== null
    )
      throw new Error(`Missing or changed private ${name} witness`)
    if (
      witness &&
      fs.lstatSync(path.join(slot, `${name}.record`), { bigint: true })
        .nlink !== (current ? 2n : 1n)
    )
      throw new Error(`Unrecorded ${name} hard link; retaining whole pair`)
    if (current && (!expected || !sameDurableImage(current, expected)))
      throw new Error(`Foreign or changed public ${name}; retaining whole pair`)
  }
  assertNoAmbiguousId(intent)
  return { paths, base, sidecar }
}
function updateIntent(
  state: State,
  patch: Partial<Pick<Intent, "phase" | "base" | "sidecar">>,
) {
  const intent = { ...state.intent, ...patch }
  const record = replaceDurablePrivateRecord(
    recordPath(state.slot),
    JSON.stringify(intent, null, 2),
    state.record,
  )
  state.intent = intent
  state.record = record
}
/** Once durably resolved, cleanup has authority ONLY over private slot entries.
 * Unknown private entries/inodes retain evidence; committed customer edits are
 * never restored/deleted. A consumed witness is an idempotent cleanup retry.
 */
function cleanupResolved(
  scope: CreationScope,
  slot: string,
  intent: Intent,
  record: DurableImage,
) {
  privateDirectory(slot)
  if (!sameDurableIdentity(identity(slot), intent.slot))
    throw new Error("Resolved slot ownership changed")
  const allowed = new Set(["intent.json", "base.record", "sidecar.record"])
  if (fs.readdirSync(slot).some((name) => !allowed.has(name)))
    throw new Error("Unknown private creation residue")
  for (const name of ["base", "sidecar"] as const) {
    const file = path.join(slot, `${name}.record`)
    const current = readDurableFile(file)
    const expected = intent[name]
    if (current && (!expected || !sameDurableIdentity(current, expected)))
      throw new Error("Private cleanup ownership changed")
    if (current) syncOwnedFile(file, current)
  }
  syncOwnedFile(recordPath(slot), record)
  syncDirectory(slot)
  syncDirectory(path.dirname(slot))
  for (const name of ["base.record", "sidecar.record"]) {
    const file = path.join(slot, name)
    if (lstatOrMissing(file)) {
      fs.unlinkSync(file)
      syncDirectory(slot)
    }
  }
  fs.unlinkSync(recordPath(slot))
  syncDirectory(slot)
  fs.rmdirSync(slot)
  syncDirectory(path.dirname(slot))
  creationFamily(scope)
}
function resolveSlot(state: State) {
  const family = creationFamily(state.intent.scope)
  const resolvedParent = path.join(family, "resolved")
  ensureDurableDirectory(resolvedParent)
  privateDirectory(resolvedParent)
  const destination = path.join(
    resolvedParent,
    `${state.intent.quizId}-${state.intent.nonce}`,
  )
  if (lstatOrMissing(destination))
    throw new Error("Resolved creation slot collision")
  fs.renameSync(state.slot, destination)
  syncDirectory(path.dirname(state.slot))
  syncDirectory(resolvedParent)
  state.slot = destination
  cleanupResolved(state.intent.scope, destination, state.intent, state.record)
}
function rollback(state: State) {
  if (state.intent.phase !== "ready")
    throw new Error("Creation is not rollback-ready")
  const pair = classifyPair(state.intent, state.slot, state.record)
  // Classification is complete before the first sibling is removed.
  for (const name of ["base", "sidecar"] as const) {
    classifyPair(state.intent, state.slot, state.record)
    if (pair[name]) {
      fs.unlinkSync(pair.paths[name])
      syncDirectory(path.dirname(pair.paths[name]))
    }
  }
  const absent = classifyPair(state.intent, state.slot, state.record)
  if (absent.base || absent.sidecar)
    throw new Error("Creation rollback absence not established")
  updateIntent(state, { phase: "rolled-back" })
  resolveSlot(state)
}
/** Prototype A: ONE synchronous cooperating writer, stable service-owned paths.
 * The scope lease excludes C1 reentrancy, not native CRUD/other processes. B must
 * enforce those actual writers before production enablement. No pair-wide
 * filesystem atomicity or arbitrary external-reader isolation is claimed.
 */
export function createNativeCreationPort(
  environment: CreationEnvironment & {
    prepare: (input: unknown) => PreparedNativeQuiz
  },
) {
  const states = new WeakMap<object, State>()
  const assertScope = () => {
    requireLinuxFences()
    captureCreationScope(environment)
  }
  const reserve = (
    input: Record<string, unknown>,
    extras: AnyQuizExtras | null,
  ) => {
    requireLinuxFences()
    const scope = captureCreationScope(environment)
    if (leases.has(scope.root) || blocked.has(scope.root))
      throw new Error("C1 creation scope is busy or unresolved")
    leases.add(scope.root)
    let slot: string | undefined
    try {
      const prepared = environment.prepare(input)
      assertCreationScope(environment, scope)
      if (
        !ID.test(prepared.id) ||
        !/^[a-z0-9-]{1,10}-[A-Za-z0-9_-]{8}\.json$/u.test(prepared.baseFileName)
      )
        throw new Error("Invalid native preparation identity/basename")
      const payload = JSON.parse(
        JSON.stringify(prepared.normalizedBase),
      ) as Record<string, unknown>
      if ("id" in payload)
        throw new Error(
          "Prepared native payload unexpectedly contains storage ID",
        )
      const logicalDigest = computeCanonicalBaseDigest(payload)
      const targetBase = utf8Image(
        JSON.stringify({ id: prepared.id, ...payload }, null, 2),
      )
      const targetExtras =
        extras === null
          ? null
          : (extras.schemaVersion === 2
              ? quizExtrasV2Schema
              : quizExtrasV1Schema
            ).parse({
              ...extras,
              quizId: prepared.id,
              revision: 1,
              baseDigest: logicalDigest,
            })
      const targetSidecar =
        targetExtras === null
          ? null
          : utf8Image(JSON.stringify(targetExtras, null, 2))
      ensureDurableDirectory(path.join(scope.root, "quizz"))
      ensureDurableDirectory(path.join(scope.root, "extensions/quizzes"))
      const paths = {
        base: durablePath(scope.root, `quizz/${prepared.baseFileName}`),
        sidecar: durablePath(
          scope.root,
          `extensions/quizzes/${prepared.id}.json`,
        ),
      }
      if (lstatOrMissing(paths.base) || lstatOrMissing(paths.sidecar))
        throw new Error("Pre-existing creation sibling collision")
      const family = creationFamily(scope)
      ensureDurableDirectory(path.join(family, "active"))
      for (
        let directory = path.join(family, "active");
        directory !== scope.configuredRoot;
        directory = path.dirname(directory)
      )
        privateDirectory(directory)
      const privateDevice = identity(path.join(family, "active")).dev
      if (
        identity(path.dirname(paths.base)).dev !== privateDevice ||
        identity(path.dirname(paths.sidecar)).dev !== privateDevice
      )
        throw new Error(
          "C1 requires one filesystem for private and public objects",
        )
      slot = path.join(family, "active", prepared.id)
      fs.mkdirSync(slot, { mode: 0o700 })
      syncDirectory(slot)
      syncDirectory(path.dirname(slot))
      const token = randomBytes(32).toString("hex")
      const createdAt = Date.now()
      const intent: Intent = {
        version: 1,
        kind: "quiz-create",
        phase: "preparing",
        scope,
        quizId: prepared.id,
        baseFileName: prepared.baseFileName,
        nonce: randomUUID(),
        tokenDigest: digest(token),
        createdAt,
        expiresAt: createdAt + 300000,
        logicalDigest,
        targetBase,
        targetSidecar,
        base: null,
        sidecar: null,
        slot: identity(slot),
        configuredRootIdentity: identity(scope.configuredRoot),
        rootIdentity: identity(scope.root),
        parentIdentities: {
          base: identity(path.dirname(paths.base)),
          sidecar: identity(path.dirname(paths.sidecar)),
        },
      }
      publicPaths(intent)
      const record = writeDurableExclusive(
        recordPath(slot),
        JSON.stringify(intent, null, 2),
      )
      const state: State = { intent, slot, record, token, status: "reserved" }
      const base = writeDurableExclusive(
        path.join(slot, "base.record"),
        targetBase.raw,
      )
      const sidecar = targetSidecar
        ? writeDurableExclusive(
            path.join(slot, "sidecar.record"),
            targetSidecar.raw,
          )
        : null
      updateIntent(state, { phase: "ready", base, sidecar })
      validateIntent(state.intent, scope, slot, false)
      assertCreationScope(environment, scope)
      classifyPair(state.intent, slot, state.record)
      const capability = Object.freeze({})
      states.set(capability, state)
      return capability
    } catch (error) {
      if (slot) blocked.add(scope.root)
      leases.delete(scope.root)
      throw new Error(
        `C1 reservation failed${slot ? `; evidence ${path.basename(slot)}` : ""}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  const publish = (capability: object): NativeCreationResult => {
    const state = states.get(capability)
    if (
      !state ||
      state.status !== "reserved" ||
      digest(state.token) !== state.intent.tokenDigest
    )
      throw new Error("Foreign, consumed or restarted creation capability")
    if (Date.now() >= state.intent.expiresAt) {
      states.delete(capability)
      leases.delete(state.intent.scope.root)
      blocked.add(state.intent.scope.root)
      throw new Error("Expired creation capability; intent retained")
    }
    state.status = "publishing"
    try {
      assertCreationScope(environment, state.intent.scope)
      const before = readIntent(state.intent.scope, state.slot)
      if (!sameDurableImage(before.record, state.record))
        throw new Error("Creation intent changed before publish")
      const paths = publicPaths(state.intent)
      // Non-null sidecar is create-new FIRST: a raced sidecar EEXIST never
      // reaches base publication. Null sidecar relies on prototype A's writer
      // contract; external interference retains the entire pair and intent.
      for (const name of ["sidecar", "base"] as const) {
        assertCreationScope(environment, state.intent.scope)
        if (Date.now() >= state.intent.expiresAt)
          throw new Error("Creation capability expired before publication")
        const pair = classifyPair(state.intent, state.slot, state.record)
        const expected = state.intent[name]
        if (!expected) continue
        if (pair[name]) throw new Error("Public creation name already exists")
        fs.linkSync(path.join(state.slot, `${name}.record`), paths[name])
        syncDirectory(path.dirname(paths[name]))
      }
      assertCreationScope(environment, state.intent.scope)
      const pair = classifyPair(state.intent, state.slot, state.record)
      if (!pair.base || (state.intent.sidecar && !pair.sidecar))
        throw new Error("Creation target publication incomplete")
      syncOwnedFile(paths.base, state.intent.base!)
      if (state.intent.sidecar)
        syncOwnedFile(paths.sidecar, state.intent.sidecar)
      syncDirectory(path.dirname(paths.base))
      syncDirectory(path.dirname(paths.sidecar))
      updateIntent(state, { phase: "committed" })
      const result = {
        quizId: state.intent.quizId,
        revision: 1,
        baseDigest: state.intent.logicalDigest,
      }
      resolveSlot(state)
      return result
    } catch (error) {
      blocked.add(state.intent.scope.root)
      let resolved = false
      // A visible committed rename is NEVER treated as rollback authorization.
      // If record/phase changed or a sibling is foreign, preserve both siblings.
      try {
        assertCreationScope(environment, state.intent.scope)
        const current = readIntent(state.intent.scope, state.slot)
        if (
          current.intent.phase === "ready" &&
          sameDurableImage(current.record, state.record)
        ) {
          rollback(state)
          blocked.delete(state.intent.scope.root)
          resolved = true
        }
      } catch {
        /* Retained private intent is the restart/manual-resolution authority. */
      }
      throw new Error(
        `C1 creation ${resolved ? "failed; rollback complete" : "unresolved"} ${state.intent.quizId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      states.delete(capability)
      leases.delete(state.intent.scope.root)
    }
  }
  return {
    assertScope,
    reserve,
    publish,
    create: (input: Record<string, unknown>, extras: AnyQuizExtras | null) =>
      publish(reserve(input, extras)),
  } satisfies NativeCreationPort & {
    reserve: typeof reserve
    publish: typeof publish
  }
}

/** Trusted startup entry: derives ALL intended roots only from the dedicated
 * private registry, independent of request ALS or current accounts flag. It
 * never calls native getters, allocators, directory-delta or orphan cleanup.
 */
export function recoverCreationReservations(configuredRoot: string) {
  if (process.platform !== "linux") {
    if (
      lstatOrMissing(path.join(path.resolve(configuredRoot), CREATION_FAMILY))
    )
      throw new Error("Pending C1 intents require qualified Linux recovery")
    return { recovered: 0, unresolved: [], qualified: false }
  }
  const unresolved: string[] = []
  let recovered = 0
  for (const scope of discoverCreationScopes(configuredRoot)) {
    if (leases.has(scope.root))
      throw new Error("Cannot replay a live creation scope")
    const family = creationFamily(scope)
    privateDirectory(family)
    for (const phase of ["resolved", "active"] as const) {
      const parent = path.join(family, phase)
      if (!lstatOrMissing(parent)) continue
      privateDirectory(parent)
      for (const name of fs.readdirSync(parent).sort()) {
        const slot = path.join(parent, name)
        try {
          privateDirectory(slot)
          if (phase === "resolved" && !lstatOrMissing(recordPath(slot))) {
            if (
              !/^[A-Za-z0-9_-]{21}-[a-f0-9-]{36}$/u.test(name) ||
              fs.readdirSync(slot).length
            )
              throw new Error("Ambiguous resolved creation residue")
            syncDirectory(slot)
            syncDirectory(parent)
            fs.rmdirSync(slot)
            syncDirectory(parent)
          } else {
            const { intent, record } = readIntent(
              scope,
              slot,
              phase === "resolved",
            )
            if (phase === "resolved") {
              if (!["committed", "rolled-back"].includes(intent.phase))
                throw new Error("Unresolved intent in resolved family")
              cleanupResolved(scope, slot, intent, record)
            } else {
              const state: State = {
                intent,
                record,
                slot,
                token: "",
                status: "publishing",
              }
              // Re-fence a warm-visible record before cleanup authority advances.
              syncOwnedFile(recordPath(slot), record)
              syncDirectory(slot)
              syncDirectory(parent)
              if (intent.phase === "ready") rollback(state)
              else if (
                intent.phase === "committed" ||
                intent.phase === "rolled-back"
              )
                resolveSlot(state)
              else
                throw new Error(
                  "Incomplete pre-publication creation intent retained",
                )
            }
          }
          recovered++
        } catch (error) {
          blocked.add(scope.root)
          unresolved.push(
            `${scope.mode}:${scope.owner ?? "global"}:${name}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }
    if (
      !unresolved.some((entry) =>
        entry.startsWith(`${scope.mode}:${scope.owner ?? "global"}:`),
      )
    )
      blocked.delete(scope.root)
  }
  if (unresolved.length)
    throw new Error(`C1 startup blocked; ${unresolved.join(" | ")}`)
  return { recovered, unresolved, qualified: true }
}
