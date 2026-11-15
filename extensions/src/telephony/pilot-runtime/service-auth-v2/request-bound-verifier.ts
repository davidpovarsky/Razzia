// Unmounted live verifier. The authority reader is concrete in auth/authority-store.
import { performance } from "node:perf_hooks"
import type Game from "@razzia/socket/services/game"
import { validateContext, type Action, type VerifiedServiceContext } from "../../../server/phone-lifecycle-v2/contracts"
import type { RealGameFacade } from "../../../server/phone-lifecycle-v2/game-facade"
import { canonicalActions, copyAddress, DUMMY_HASH, PHONE_ACTIONS, sameHash,
  serviceCapabilityHash, serviceDenied } from "../../../server/phone-lifecycle-v2/auth/credential-codec"
import type { ServiceAddress, ServiceLeaseRecord,
  SynchronousServiceLeaseReader } from "../../../server/phone-lifecycle-v2/auth/contracts"
import { NativeAccountAuthority } from "./native-account-authority"

export type { ServiceAddress, ServiceCredentialBinding, ServiceLeaseRecord,
  SynchronousServiceLeaseReader } from "../../../server/phone-lifecycle-v2/auth/contracts"
export { serviceCapabilityHash } from "../../../server/phone-lifecycle-v2/auth/credential-codec"

export type ResolvePinnedFacade = (game: Game) => RealGameFacade | undefined
export interface ActivationAuthorization {
  readonly address: ServiceAddress
  readonly lease: ServiceLeaseRecord
  readonly nativeGame: Game
  readonly facade: RealGameFacade
}
interface RequestProof {
  readonly address: ServiceAddress
  readonly suppliedHash: string
  readonly nativeGame: Game
  readonly facade: RealGameFacade
  readonly deadline: number
}
const REQUEST_LIFETIME_MS = 30000

export class RequestBoundServiceVerifier {
  private readonly requests = new WeakMap<VerifiedServiceContext, RequestProof>()
  private readonly accounts = new NativeAccountAuthority()
  constructor(private readonly leases: SynchronousServiceLeaseReader) {}

  private read(address: ServiceAddress): ServiceLeaseRecord {
    const record = this.leases.readCurrent(address)
    if (record && "then" in record) serviceDenied()
    if (!record) serviceDenied()
    return record
  }

  private match(record: ServiceLeaseRecord, address: ServiceAddress, suppliedHash: string,
    action?: Action) {
    if (record.owner !== address.owner || record.game !== address.game ||
      record.provider !== address.provider || record.service !== address.service ||
      record.version !== address.version || record.state === "REVOKED" ||
      record.revokedAt !== null || !Number.isSafeInteger(record.expiresAt) ||
      record.expiresAt <= Date.now() || !sameHash(suppliedHash, record.capabilityHash)) serviceDenied()
    const initial = canonicalActions(record.initialActions), current = canonicalActions(record.currentActions)
    if (!initial.includes("register") || current.length === 0 || current.some(a => !initial.includes(a))) serviceDenied()
    if (action !== undefined && (record.state !== "ACTIVE" || !PHONE_ACTIONS.includes(action) ||
      !initial.includes(action) || !current.includes(action))) serviceDenied()
    if (action === undefined && !["PENDING_DELIVERY", "ACTIVE"].includes(record.state)) serviceDenied()
    return initial
  }

  private credential(input: ServiceAddress, capability: string, resolve: ResolvePinnedFacade,
    action?: Action) {
    this.accounts.assertStrictProfile()
    const address = copyAddress(input)
    if (typeof capability !== "string" || !/^[0-9a-f]{64}$/u.test(capability)) serviceDenied()
    const candidate = this.leases.readCurrent(address)
    if (candidate && "then" in candidate) serviceDenied()
    const suppliedHash = serviceCapabilityHash(candidate ?? { ...address, issuerSid: "absent",
      executorId: "absent", expiresAt: 0, initialActions: [] }, capability)
    const expected = candidate?.capabilityHash
    if (!sameHash(suppliedHash, typeof expected === "string" && /^[0-9a-f]{64}$/u.test(expected) ? expected : DUMMY_HASH) || !candidate) serviceDenied()
    const initial = this.match(candidate, address, suppliedHash, action)
    const owner = this.accounts.assertLiveOwner({ owner: candidate.owner, issuerSid: candidate.issuerSid,
      game: candidate.game, expiresAt: candidate.expiresAt })
    // Called only AFTER service secret + real owner/session proof. No speculative
    // lifecycle/roster/Game lookup by the factory before authentication.
    const facade = resolve(owner.nativeGame)
    if (!facade || facade.executorId !== candidate.executorId) serviceDenied()
    return { address, suppliedHash, candidate, initial, owner, facade }
  }

  authorizeActivation(input: ServiceAddress, capability: string,
    resolve: ResolvePinnedFacade): ActivationAuthorization {
    try {
      const c = this.credential(input, capability, resolve)
      return Object.freeze({ address: c.address, lease: c.candidate,
        nativeGame: c.owner.nativeGame, facade: c.facade })
    } catch { return serviceDenied() }
  }

  begin(input: ServiceAddress, capability: string, action: Action,
    resolve: ResolvePinnedFacade): VerifiedServiceContext {
    try {
      if (!PHONE_ACTIONS.includes(action)) serviceDenied()
      const c = this.credential(input, capability, resolve, action)
      const context: VerifiedServiceContext = Object.freeze({ verified: true, owner: c.owner.owner,
        issuerSid: c.owner.issuerSid, game: c.owner.game, provider: c.candidate.provider,
        service: c.candidate.service, executorId: c.candidate.executorId,
        actions: c.initial, expiresAt: c.candidate.expiresAt })
      if (!c.facade.exists(context)) serviceDenied()
      this.requests.set(context, Object.freeze({ address: c.address, suppliedHash: c.suppliedHash,
        nativeGame: c.owner.nativeGame, facade: c.facade, deadline: performance.now() + REQUEST_LIFETIME_MS }))
      try { this.assertCurrent(context, action) }
      catch (error) { this.requests.delete(context); throw error }
      return context
    } catch { return serviceDenied() }
  }

  private assertCurrent(context: VerifiedServiceContext, action: Action) {
    const proof = this.requests.get(context)
    if (!proof || performance.now() >= proof.deadline) serviceDenied()
    validateContext(context, action)
    this.accounts.assertStrictProfile()
    const record = this.read(proof.address), initial = this.match(record, proof.address, proof.suppliedHash, action)
    if (context.owner !== record.owner || context.game !== record.game || context.provider !== record.provider ||
      context.service !== record.service || context.issuerSid !== record.issuerSid ||
      context.executorId !== record.executorId || context.expiresAt !== record.expiresAt ||
      JSON.stringify(context.actions) !== JSON.stringify(initial)) serviceDenied()
    this.accounts.assertLiveOwner({ owner: record.owner, issuerSid: record.issuerSid,
      game: record.game, expiresAt: record.expiresAt }, proof.nativeGame)
    if (proof.facade.executorId !== record.executorId || !proof.facade.exists(context)) serviceDenied()
  }

  readonly verifyCurrent = (context: VerifiedServiceContext, action: Action): boolean => {
    try { this.assertCurrent(context, action); return true } catch { return false }
  }
  release(context: VerifiedServiceContext) { this.requests.delete(context) }
}
