// Server-only composition. No Hono route/export/mount or adopted native fence.
import type Game from "@razzia/socket/services/game"
import Registry from "@razzia/socket/services/registry"
import { activeAccount as scopedAccount, withAccount } from "@razzia/socket/services/account-scope"
import { NativeAccountAuthority, type PreparedManagerAuthority } from "../../../telephony/pilot-runtime/service-auth-v2/native-account-authority"
import { RequestBoundServiceVerifier } from "../../../telephony/pilot-runtime/service-auth-v2/request-bound-verifier"
import { identifier, type Action, type OperationInput, type Receipt, type RegistrationInput,
  type VerifiedServiceContext } from "../contracts"
import { RealGameFacade } from "../game-facade"
import { PrototypeStore } from "../store"
import { LifecyclePrototype } from "../prototype"
import { PrivateAuthorityFiles } from "./private-authority-files"
import { ReadonlyServiceLeaseReader, ServiceAuthorityWriter } from "./authority-store"
import { canonicalActions, deriveServiceId, PHONE_ACTIONS, sameHash, serviceCapabilityHash, serviceDenied } from "./credential-codec"
import type { ControlRequest, SecretAttempt, ServiceAddress } from "./contracts"

const MAX_LEASE_MS = 15 * 60 * 1000
interface ControlTarget { readonly game: string; readonly provider: string; readonly service: string }
interface IssueInput { readonly game: string; readonly provider: string; readonly requestId: string;
  readonly expiresAt: number; readonly initialActions: readonly Action[] }
export interface UnmountedAuthorityOptions {
  readonly authorityRoot: string
  readonly allowedProviders: readonly string[]
  // Called ONLY after ACTIVE service proof/live owner/executor verification.
  // First batch supplies exact pre-created private synthetic roots, no fallback.
  readonly lifecycleRoot: (owner: string, game: string) => string
}

export class UnmountedPhoneAuthority {
  private readonly accounts = new NativeAccountAuthority()
  private readonly reader: ReadonlyServiceLeaseReader
  private readonly writer: ServiceAuthorityWriter
  private readonly verifier: RequestBoundServiceVerifier
  private readonly facades = new WeakMap<Game, RealGameFacade>()
  private readonly coordinators = new WeakMap<Game, Map<string, LifecyclePrototype>>()
  private readonly stores = new Set<PrototypeStore>()
  private readonly providers: readonly string[]
  private readonly rootResolver: UnmountedAuthorityOptions["lifecycleRoot"]
  private closed = false

  constructor(options: UnmountedAuthorityOptions) {
    if (options.allowedProviders.length === 0 || typeof options.lifecycleRoot !== "function") serviceDenied()
    for (const provider of options.allowedProviders) identifier(provider)
    this.providers = Object.freeze([...new Set(options.allowedProviders)])
    this.rootResolver = options.lifecycleRoot
    // Constructors only capture fixed paths. No SQL/file creation at assembly.
    const files = new PrivateAuthorityFiles(options.authorityRoot)
    this.reader = new ReadonlyServiceLeaseReader(files)
    this.writer = new ServiceAuthorityWriter(files)
    this.verifier = new RequestBoundServiceVerifier(this.reader)
  }

  private assertOpen() {
    if (this.closed) serviceDenied()
  }
  private provider(provider: string) {
    this.assertOpen()
    identifier(provider)
    if (!this.providers.includes(provider)) serviceDenied()
  }
  private pin(game: Game) {
    let facade = this.facades.get(game)
    if (!facade) {
      facade = new RealGameFacade(game, (id, owner) => Registry.getInstance().getManagerGame(id, owner))
      this.facades.set(game, facade)
    }
    return facade
  }
  private managerLive(prepared: PreparedManagerAuthority, game: Game, executorId?: string,
    issuerSid?: string): void {
    this.assertOpen()
    const live = this.accounts.revalidateManager(prepared)
    if (live.nativeGame !== game || (issuerSid !== undefined && live.issuerSid !== issuerSid) ||
      (executorId !== undefined && this.facades.get(game)?.executorId !== executorId)) serviceDenied()
  }
  private managerCheck(prepared: PreparedManagerAuthority, game: Game, executorId?: string,
    issuerSid?: string): void {
    this.managerLive(prepared, game, executorId, issuerSid)
    if (scopedAccount() !== this.accounts.revalidateManager(prepared).owner) serviceDenied()
  }
  private credentialDisclosure(result: SecretAttempt, address: ServiceAddress) {
    this.assertOpen()
    if (result.credential === undefined) return
    const current = this.reader.readCurrent({ ...address, version: result.receipt.version })
    if (!current || current.version !== result.receipt.version || current.state !== "PENDING_DELIVERY" ||
      current.expiresAt <= Date.now() ||
      !sameHash(serviceCapabilityHash(current, result.credential), current.capabilityHash)) serviceDenied()
  }

  async initializeAuthority(token: string, game: string): Promise<{ status: "ready" }> {
    if (this.closed) serviceDenied()
    const prepared = await this.accounts.prepareManager(token, game)
    try {
      const live = this.accounts.revalidateManager(prepared)
      const result = await withAccount(live.owner, () => {
        this.writer.initialize(() => { this.managerCheck(prepared, live.nativeGame) })
        this.managerCheck(prepared, live.nativeGame)
        return { status: "ready" as const }
      })
      this.managerLive(prepared, live.nativeGame)
      return result
    } finally { this.accounts.releaseManager(prepared) }
  }

  async issue(token: string, input: IssueInput): Promise<SecretAttempt> {
    const prepared = await this.accounts.prepareManager(token, input.game)
    try {
      this.provider(input.provider); identifier(input.requestId)
      const live = this.accounts.revalidateManager(prepared), initial = canonicalActions(input.initialActions)
      // The first experimental profile is precisely the four phone actions;
      // no account/admin authority or transparent expiry renewal is granted.
      if (JSON.stringify(initial) !== JSON.stringify([...PHONE_ACTIONS].sort()) ||
        !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= Date.now() ||
        input.expiresAt > Date.now() + MAX_LEASE_MS || input.expiresAt > live.expiresAt) serviceDenied()
      const facade = this.pin(live.nativeGame)
      const binding = { owner: live.owner, game: input.game, provider: input.provider,
        service: deriveServiceId(live.owner, input.game, input.provider, input.requestId), version: 1,
        issuerSid: live.issuerSid, executorId: facade.executorId, expiresAt: input.expiresAt,
        initialActions: initial }
      const result = await withAccount(live.owner, () => {
        const result = this.writer.issue(binding, { requestId: input.requestId, expectedVersion: 0 },
          live.issuerSid, () => { this.managerCheck(prepared, live.nativeGame, facade.executorId, live.issuerSid) })
        this.managerCheck(prepared, live.nativeGame, facade.executorId, live.issuerSid)
        return result
      })
      this.managerLive(prepared, live.nativeGame, facade.executorId, live.issuerSid)
      this.credentialDisclosure(result, binding)
      return result
    } finally { this.accounts.releaseManager(prepared) }
  }

  private controlRecord(prepared: PreparedManagerAuthority, target: ControlTarget,
    expectedVersion: number, sameIssuer: boolean) {
    this.provider(target.provider); identifier(target.service)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) serviceDenied()
    const live = this.accounts.revalidateManager(prepared)
    const facade = this.facades.get(live.nativeGame)
    if (!facade) serviceDenied() // Never reconstruct a durable executor on retry/restart.
    const address: ServiceAddress = { owner: live.owner, game: live.game,
      provider: target.provider, service: target.service, version: expectedVersion }
    const record = this.reader.readCurrent(address)
    if (!record || record.executorId !== facade.executorId ||
      (sameIssuer && record.issuerSid !== live.issuerSid)) serviceDenied()
    return { live, facade, record }
  }

  async rotate(token: string, target: ControlTarget, input: ControlRequest): Promise<SecretAttempt> {
    const prepared = await this.accounts.prepareManager(token, target.game)
    try {
      const { live, facade, record } = this.controlRecord(prepared, target, input.expectedVersion, true)
      const result = await withAccount(live.owner, () => {
        const result = this.writer.rotate(record, input, live.issuerSid,
          () => { this.managerCheck(prepared, live.nativeGame, facade.executorId, record.issuerSid) })
        this.managerCheck(prepared, live.nativeGame, facade.executorId, record.issuerSid)
        return result
      })
      this.managerLive(prepared, live.nativeGame, facade.executorId, record.issuerSid)
      this.credentialDisclosure(result, record)
      return result
    } finally { this.accounts.releaseManager(prepared) }
  }

  async revoke(token: string, target: ControlTarget, input: ControlRequest): Promise<SecretAttempt> {
    const prepared = await this.accounts.prepareManager(token, target.game)
    try {
      // A fresh verified owner session may revoke, but cannot replace/renew, the
      // old issuer. The actual Game/executor must still be the exact live pin.
      const { live, facade, record } = this.controlRecord(prepared, target, input.expectedVersion, false)
      const result = await withAccount(live.owner, () => {
        const result = this.writer.revoke(record, input, live.issuerSid,
          () => { this.managerCheck(prepared, live.nativeGame, facade.executorId) })
        this.managerCheck(prepared, live.nativeGame, facade.executorId)
        return result
      })
      this.managerLive(prepared, live.nativeGame, facade.executorId)
      return result
    } finally { this.accounts.releaseManager(prepared) }
  }

  async activate(address: ServiceAddress, capability: string, input: ControlRequest): Promise<SecretAttempt> {
    this.provider(address.provider)
    const proof = this.verifier.authorizeActivation(address, capability, game => this.facades.get(game))
    const live = () => {
      this.assertOpen()
      this.accounts.assertLiveOwner({ owner: proof.lease.owner, issuerSid: proof.lease.issuerSid,
        game: proof.lease.game, expiresAt: proof.lease.expiresAt }, proof.nativeGame)
      if (this.facades.get(proof.nativeGame) !== proof.facade ||
        proof.facade.executorId !== proof.lease.executorId) serviceDenied()
    }
    const check = () => { live(); if (scopedAccount() !== proof.lease.owner) serviceDenied() }
    const result = await withAccount(proof.lease.owner, () => {
      const result = this.writer.activate(proof.address, capability, input, check)
      check()
      return result
    })
    live()
    const current = this.verifier.authorizeActivation(address, capability, game => this.facades.get(game))
    if (current.nativeGame !== proof.nativeGame || current.facade !== proof.facade) serviceDenied()
    return result
  }

  private coordinator(context: VerifiedServiceContext) {
    this.assertOpen()
    const live = this.accounts.assertLiveOwner({ owner: context.owner, issuerSid: context.issuerSid,
      game: context.game, expiresAt: context.expiresAt })
    const facade = this.facades.get(live.nativeGame)
    if (!facade || facade.executorId !== context.executorId ||
      !this.verifier.verifyCurrent(context, "register")) serviceDenied()
    let cache = this.coordinators.get(live.nativeGame)
    if (!cache) { cache = new Map(); this.coordinators.set(live.nativeGame, cache) }
    let coordinator = cache.get(context.service)
    if (!coordinator) {
      // First lifecycle root/DB access is strictly after successful ACTIVE proof.
      const root = this.rootResolver(context.owner, context.game)
      if (typeof root !== "string") serviceDenied()
      const store = new PrototypeStore(root, context, this.verifier.verifyCurrent)
      this.stores.add(store)
      coordinator = new LifecyclePrototype(store, facade, this.verifier.verifyCurrent)
      cache.set(context.service, coordinator)
    }
    return coordinator
  }

  private async dispatch(address: ServiceAddress, capability: string,
    action: Action, input: RegistrationInput | OperationInput): Promise<Receipt> {
    this.provider(address.provider)
    const context = this.verifier.begin(address, capability, action, game => this.facades.get(game))
    try {
      const result = await withAccount(context.owner, () => {
        this.assertOpen()
        if (scopedAccount() !== context.owner || !this.verifier.verifyCurrent(context, action)) serviceDenied()
        const coordinator = this.coordinator(context)
        // No await/Promise/native reconstruction inside this owning turn.
        const receipt = action === "register" ? coordinator.register(context, input as RegistrationInput) :
          coordinator.operate(context, input as OperationInput)
        this.assertOpen()
        if (!this.verifier.verifyCurrent(context, action)) serviceDenied()
        return receipt
      })
      // Async owner-scope completion is also a revalidation boundary before
      // returning a secret-free receipt. An earlier effect is never rolled back.
      this.assertOpen()
      if (!this.verifier.verifyCurrent(context, action)) serviceDenied()
      return result
    } finally { this.verifier.release(context) }
  }
  register(address: ServiceAddress, capability: string, input: RegistrationInput) {
    return this.dispatch(address, capability, "register", input)
  }
  operate(address: ServiceAddress, capability: string, input: OperationInput) {
    if (!["poll", "answer", "hangup"].includes(input.action)) serviceDenied()
    return this.dispatch(address, capability, input.action, input)
  }
  close() {
    if (this.closed) return
    this.closed = true
    for (const store of this.stores) store.close()
    this.stores.clear()
  }
}
