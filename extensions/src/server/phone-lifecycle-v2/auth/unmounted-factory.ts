// Server-only composition. No Hono route/export/mount or adopted native fence.
import type Game from "@razzia/socket/services/game"
import Registry from "@razzia/socket/services/registry"
import {
  activeAccount as scopedAccount,
  withAccount,
} from "@razzia/socket/services/account-scope"
import {
  NativeAccountAuthority,
  type PreparedManagerAuthority,
} from "../../../telephony/pilot-runtime/service-auth-v2/native-account-authority"
import { RequestBoundServiceVerifier } from "../../../telephony/pilot-runtime/service-auth-v2/request-bound-verifier"
import {
  identifier,
  type Action,
  type OperationInput,
  type Receipt,
  type RegistrationInput,
  type VerifiedServiceContext,
} from "../contracts"
import { RealGameFacade } from "../game-facade"
import { PrototypeStore } from "../store"
import { LifecyclePrototype } from "../prototype"
import {
  NativePhoneAdoption,
  isPhoneLifecycleV2Adopted,
} from "../native-adoption"
import { PrivateAuthorityFiles } from "./private-authority-files"
import {
  ReadonlyServiceLeaseReader,
  ServiceAuthorityWriter,
} from "./authority-store"
import {
  canonicalActions,
  deriveServiceId,
  PHONE_ACTIONS,
  sameHash,
  serviceCapabilityHash,
  serviceDenied,
} from "./credential-codec"
import type {
  ControlRequest,
  SecretAttempt,
  ServiceAddress,
  ServiceLeaseRecord,
} from "./contracts"
import {
  GATEWAY_DELIVERY_PURPOSE,
  type GatewayCallAuthorityPort,
  type GatewayBinding,
  type GatewayDeliveryDestination,
  type GatewayDeliveryAck,
} from "../../../telephony/pilot-runtime/gateway-v2/contracts"
import {
  acknowledgement,
  binding as gatewayBinding,
  bindingText,
  digest,
  integer,
} from "../../../telephony/pilot-runtime/gateway-v2/codec"

const MAX_LEASE_MS = 15 * 60 * 1000
interface ControlTarget {
  readonly game: string
  readonly provider: string
  readonly service: string
}
interface IssueInput {
  readonly game: string
  readonly provider: string
  readonly requestId: string
  readonly expiresAt: number
  readonly initialActions: readonly Action[]
}

export interface UnmountedAuthorityOptions {
  readonly authorityRoot: string
  readonly allowedProviders: readonly string[]
  // Explicit synthetic/server composition opt-in; no environment/public mount.
  readonly nativeAdoption?: boolean
  readonly gatewayDelivery?: boolean
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
  private readonly coordinators = new WeakMap<
    Game,
    Map<string, LifecyclePrototype>
  >()
  private readonly stores = new Set<PrototypeStore>()
  private readonly providers: readonly string[]
  private readonly rootResolver: UnmountedAuthorityOptions["lifecycleRoot"]
  private readonly adoption?: NativePhoneAdoption
  private readonly gatewayEnabled: boolean
  private readonly staged = new WeakSet<Game>()
  private readonly deliveries = new WeakMap<
    SecretAttempt,
    { game: Game; binding: GatewayBinding; requestId: string }
  >()
  private closed = false

  constructor(options: UnmountedAuthorityOptions) {
    if (
      options.allowedProviders.length === 0 ||
      typeof options.lifecycleRoot !== "function"
    ) {
      serviceDenied()
    }

    for (const provider of options.allowedProviders) {
      identifier(provider)
    }
    this.providers = Object.freeze([...new Set(options.allowedProviders)])
    this.rootResolver = options.lifecycleRoot
    this.gatewayEnabled = options.gatewayDelivery === true

    if (this.gatewayEnabled && options.nativeAdoption !== true) {
      serviceDenied()
    }

    if (options.nativeAdoption === true) {
      this.adoption = new NativePhoneAdoption()
    }

    // Constructors only capture fixed paths. No SQL/file creation at assembly.
    const files = new PrivateAuthorityFiles(options.authorityRoot)
    this.reader = new ReadonlyServiceLeaseReader(files)
    this.writer = new ServiceAuthorityWriter(files)
    this.verifier = new RequestBoundServiceVerifier(this.reader)
  }

  private assertOpen() {
    if (this.closed) {
      serviceDenied()
    }
  }
  private provider(provider: string) {
    this.assertOpen()
    identifier(provider)

    if (!this.providers.includes(provider)) {
      serviceDenied()
    }
  }
  private pin(game: Game) {
    if (this.gatewayEnabled && !this.staged.has(game)) {
      serviceDenied()
    }

    if (this.adoption) {
      this.adoption.adopt(game)
    } else if (isPhoneLifecycleV2Adopted(game)) {
      serviceDenied()
    }

    let facade = this.facades.get(game)

    if (!facade) {
      facade = new RealGameFacade(game, (id, owner) =>
        Registry.getInstance().getManagerGame(id, owner),
      )
      this.facades.set(game, facade)
    }

    return facade
  }
  // Trusted host calls immediately after a genuine new Game constructor and
  // before publishing it. An empty roster alone cannot prove freshness.
  stageFreshGatewayGame(game: Game): void {
    this.assertOpen()

    if (
      !this.gatewayEnabled ||
      this.staged.has(game) ||
      this.facades.has(game) ||
      Registry.getInstance().getGameById(game.gameId) ||
      game.started ||
      game.players.length !== 0 ||
      !game.canAdoptPhoneLifecycleV2()
    ) {
      serviceDenied()
    }

    if (!this.adoption) {
      serviceDenied()
    }

    this.adoption.adopt(game)
    this.staged.add(game)
    this.pin(game)
  }
  private gatewayRecord(
    game: Game,
    address: ServiceAddress,
    issuerSid: string,
  ): ServiceLeaseRecord {
    this.assertOpen()
    this.provider(address.provider)

    if (!this.gatewayEnabled || !this.staged.has(game)) {
      serviceDenied()
    }

    const record = this.reader.readCurrent(address)

    if (
      !record ||
      record.state === "REVOKED" ||
      record.revokedAt !== null ||
      record.issuerSid !== issuerSid ||
      record.executorId !== this.facades.get(game)?.executorId
    ) {
      serviceDenied()
    }

    this.accounts.assertLiveOwner(record, game)

    return record
  }
  private static gatewayDescriptor(record: ServiceLeaseRecord): GatewayBinding {
    return gatewayBinding({
      protocol: 1,
      purpose: GATEWAY_DELIVERY_PURPOSE,
      owner: record.owner,
      game: record.game,
      provider: record.provider,
      service: record.service,
      version: record.version,
      issuerSid: record.issuerSid,
      executorId: record.executorId,
      expiresAt: record.expiresAt,
      initialActions: record.initialActions,
    })
  }
  private ticket({
    result,
    game,
    address,
    requestId,
    issuerSid,
  }: {
    result: SecretAttempt
    game: Game
    address: ServiceAddress
    requestId: string
    issuerSid: string
  }) {
    if (!this.gatewayEnabled || result.credential === undefined) {
      return
    }

    const record = this.gatewayRecord(game, address, issuerSid)

    if (record.version !== result.receipt.version) {
      serviceDenied()
    }

    this.deliveries.set(result, {
      game,
      binding: UnmountedPhoneAuthority.gatewayDescriptor(record),
      requestId,
    })
  }

  async openGatewayAuthority(
    token: string,
    target: ControlTarget,
  ): Promise<GatewayCallAuthorityPort> {
    this.assertOpen()
    const prepared = await this.accounts.prepareManager(token, target.game)

    try {
      const live = this.accounts.revalidateManager(prepared)
      const address = Object.freeze({
        owner: live.owner,
        game: live.game,
        provider: target.provider,
        service: target.service,
        version: 1,
      })
      const current = () =>
        this.gatewayRecord(live.nativeGame, address, live.issuerSid)
      current()
      const assertCredential = (
        input: GatewayBinding,
        capability: string,
        action?: Action,
      ) => {
        const expected = UnmountedPhoneAuthority.gatewayDescriptor(current())

        if (bindingText(gatewayBinding(input)) !== bindingText(expected)) {
          serviceDenied()
        }

        const proof = this.verifier.authorizeActivation(
          expected,
          capability,
          (game) => this.facades.get(game),
        )

        if (
          proof.nativeGame !== live.nativeGame ||
          bindingText(
            UnmountedPhoneAuthority.gatewayDescriptor(proof.lease),
          ) !== bindingText(expected)
        ) {
          serviceDenied()
        }

        if (action !== undefined) {
          const context = this.verifier.begin(
            expected,
            capability,
            action,
            (game) => this.facades.get(game),
          )

          try {
            if (!this.verifier.verifyCurrent(context, action)) {
              serviceDenied()
            }
          } finally {
            this.verifier.release(context)
          }
        }
      }

      return Object.freeze({
        current: () => {
          const record = current()

          if (
            record.state !== "PENDING_DELIVERY" &&
            record.state !== "ACTIVE"
          ) {
            serviceDenied()
          }

          return Object.freeze({
            binding: UnmountedPhoneAuthority.gatewayDescriptor(record),
            state: record.state,
            allowedActions: canonicalActions(record.currentActions),
          })
        },
        assertCredential,
        operate: async (
          input: GatewayBinding,
          capability: string,
          operation: OperationInput,
        ) => {
          const request = Object.freeze({ ...operation })
          assertCredential(input, capability, request.action)
          const receipt = await this.operate(input, capability, request)
          assertCredential(input, capability, request.action)

          return receipt
        },
        register: async (
          input: GatewayBinding,
          capability: string,
          registration: RegistrationInput,
        ) => {
          assertCredential(input, capability, "register")
          const receipt = await this.register(input, capability, registration)
          assertCredential(input, capability, "register")

          return receipt
        },
        activate: async (
          input: GatewayBinding,
          capability: string,
          requestId: string,
        ) => {
          assertCredential(input, capability)
          const result = await this.activate(input, capability, {
            requestId,
            expectedVersion: input.version,
          })
          assertCredential(input, capability)

          return result.receipt
        },
      })
    } finally {
      this.accounts.releaseManager(prepared)
    }
  }

  deliverGatewayAttempt(
    ...args: [
      token: string,
      attempt: SecretAttempt,
      destination: GatewayDeliveryDestination,
      expectedStoredVersion: number,
    ]
  ): Promise<GatewayDeliveryAck> {
    const [token, attempt, destination, expectedStoredVersion] = args

    return this.deliverGatewayRequest({
      token,
      attempt,
      destination,
      expectedStoredVersion,
    })
  }

  private async deliverGatewayRequest({
    token,
    attempt,
    destination,
    expectedStoredVersion,
  }: {
    token: string
    attempt: SecretAttempt
    destination: GatewayDeliveryDestination
    expectedStoredVersion: number
  }): Promise<GatewayDeliveryAck> {
    const ticket = this.deliveries.get(attempt)
    // Consume before the first await, including failures.

    this.deliveries.delete(attempt)
    this.assertOpen()

    if (!ticket || attempt.credential === undefined) {
      serviceDenied()
    }

    integer(expectedStoredVersion)
    const capability = attempt.credential
    const prepared = await this.accounts.prepareManager(
      token,
      ticket.binding.game,
    )

    try {
      const check = () => {
        this.managerLive({
          prepared,
          game: ticket.game,
          executorId: ticket.binding.executorId,
          issuerSid: ticket.binding.issuerSid,
        })
        const record = this.gatewayRecord(
          ticket.game,
          ticket.binding,
          ticket.binding.issuerSid,
        )

        if (
          bindingText(UnmountedPhoneAuthority.gatewayDescriptor(record)) !==
            bindingText(ticket.binding) ||
          !sameHash(
            serviceCapabilityHash(record, capability),
            record.capabilityHash,
          )
        ) {
          serviceDenied()
        }
      }
      check()
      const deliveryId = digest(
        JSON.stringify([
          "gateway-delivery-v1",
          ticket.requestId,
          bindingText(ticket.binding),
        ]),
      )
      const result = await destination.acceptDelivery(
        Object.freeze({
          protocol: 1,
          purpose: GATEWAY_DELIVERY_PURPOSE,
          deliveryId,
          expectedStoredVersion,
          binding: ticket.binding,
          credential: capability,
        }),
      )
      check()
      const ack = acknowledgement(result)

      if (
        ack.deliveryId !== deliveryId ||
        ack.service !== ticket.binding.service ||
        ack.storedVersion !== ticket.binding.version
      ) {
        serviceDenied()
      }

      return ack
    } catch {
      // A destination exception is untrusted and may echo the in-flight secret.
      return serviceDenied()
    } finally {
      this.accounts.releaseManager(prepared)
    }
  }
  private managerLive({
    prepared,
    game,
    executorId,
    issuerSid,
  }: {
    prepared: PreparedManagerAuthority
    game: Game
    executorId?: string
    issuerSid?: string
  }): void {
    this.assertOpen()
    const live = this.accounts.revalidateManager(prepared)

    if (
      live.nativeGame !== game ||
      (issuerSid !== undefined && live.issuerSid !== issuerSid) ||
      (executorId !== undefined &&
        this.facades.get(game)?.executorId !== executorId)
    ) {
      serviceDenied()
    }
  }
  private managerCheck({
    prepared,
    game,
    executorId,
    issuerSid,
  }: {
    prepared: PreparedManagerAuthority
    game: Game
    executorId?: string
    issuerSid?: string
  }): void {
    this.managerLive({ prepared, game, executorId, issuerSid })

    if (scopedAccount() !== this.accounts.revalidateManager(prepared).owner) {
      serviceDenied()
    }
  }
  private credentialDisclosure(result: SecretAttempt, address: ServiceAddress) {
    this.assertOpen()

    if (result.credential === undefined) {
      return
    }

    const current = this.reader.readCurrent({
      ...address,
      version: result.receipt.version,
    })

    if (
      !current ||
      current.version !== result.receipt.version ||
      current.state !== "PENDING_DELIVERY" ||
      current.expiresAt <= Date.now() ||
      !sameHash(
        serviceCapabilityHash(current, result.credential),
        current.capabilityHash,
      )
    ) {
      serviceDenied()
    }
  }

  async initializeAuthority(
    token: string,
    game: string,
  ): Promise<{ status: "ready" }> {
    if (this.closed) {
      serviceDenied()
    }

    const prepared = await this.accounts.prepareManager(token, game)

    try {
      const live = this.accounts.revalidateManager(prepared)
      const result = await withAccount(live.owner, () => {
        this.writer.initialize(() => {
          this.managerCheck({ prepared, game: live.nativeGame })
        })
        this.managerCheck({ prepared, game: live.nativeGame })

        return { status: "ready" as const }
      })
      this.managerLive({ prepared, game: live.nativeGame })

      return result
    } finally {
      this.accounts.releaseManager(prepared)
    }
  }

  async issue(token: string, input: IssueInput): Promise<SecretAttempt> {
    const prepared = await this.accounts.prepareManager(token, input.game)

    try {
      this.provider(input.provider)
      identifier(input.requestId)
      const live = this.accounts.revalidateManager(prepared),
        initial = canonicalActions(input.initialActions)

      // The first experimental profile is precisely the four phone actions;
      // no account/admin authority or transparent expiry renewal is granted.
      if (
        JSON.stringify(initial) !== JSON.stringify([...PHONE_ACTIONS].sort()) ||
        !Number.isSafeInteger(input.expiresAt) ||
        input.expiresAt <= Date.now() ||
        input.expiresAt > Date.now() + MAX_LEASE_MS ||
        input.expiresAt > live.expiresAt
      ) {
        serviceDenied()
      }

      const facade = this.pin(live.nativeGame)
      const binding = {
        owner: live.owner,
        game: input.game,
        provider: input.provider,
        service: deriveServiceId(
          live.owner,
          input.game,
          input.provider,
          input.requestId,
        ),
        version: 1,
        issuerSid: live.issuerSid,
        executorId: facade.executorId,
        expiresAt: input.expiresAt,
        initialActions: initial,
      }
      const result = await withAccount(live.owner, () => {
        const issuedResult = this.writer.issue(
          binding,
          { requestId: input.requestId, expectedVersion: 0 },
          live.issuerSid,
          () => {
            this.managerCheck({
              prepared,
              game: live.nativeGame,
              executorId: facade.executorId,
              issuerSid: live.issuerSid,
            })
          },
        )
        this.managerCheck({
          prepared,
          game: live.nativeGame,
          executorId: facade.executorId,
          issuerSid: live.issuerSid,
        })

        return issuedResult
      })
      this.managerLive({
        prepared,
        game: live.nativeGame,
        executorId: facade.executorId,
        issuerSid: live.issuerSid,
      })
      this.credentialDisclosure(result, binding)
      this.ticket({
        result,
        game: live.nativeGame,
        address: binding,
        requestId: input.requestId,
        issuerSid: live.issuerSid,
      })

      return result
    } finally {
      this.accounts.releaseManager(prepared)
    }
  }

  private controlRecord({
    prepared,
    target,
    expectedVersion,
    sameIssuer,
  }: {
    prepared: PreparedManagerAuthority
    target: ControlTarget
    expectedVersion: number
    sameIssuer: boolean
  }) {
    this.provider(target.provider)
    identifier(target.service)

    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      serviceDenied()
    }

    const live = this.accounts.revalidateManager(prepared)
    const facade = this.facades.get(live.nativeGame)
    // Never reconstruct a durable executor on retry/restart.

    if (!facade) {
      serviceDenied()
    }

    const address: ServiceAddress = {
      owner: live.owner,
      game: live.game,
      provider: target.provider,
      service: target.service,
      version: expectedVersion,
    }
    const record = this.reader.readCurrent(address)

    if (
      !record ||
      record.executorId !== facade.executorId ||
      (sameIssuer && record.issuerSid !== live.issuerSid)
    ) {
      serviceDenied()
    }

    return { live, facade, record }
  }

  async rotate(
    token: string,
    target: ControlTarget,
    input: ControlRequest,
  ): Promise<SecretAttempt> {
    const prepared = await this.accounts.prepareManager(token, target.game)

    try {
      const { live, facade, record } = this.controlRecord({
        prepared,
        target,
        expectedVersion: input.expectedVersion,
        sameIssuer: true,
      })
      const result = await withAccount(live.owner, () => {
        const rotatedResult = this.writer.rotate(
          record,
          input,
          live.issuerSid,
          () => {
            this.managerCheck({
              prepared,
              game: live.nativeGame,
              executorId: facade.executorId,
              issuerSid: record.issuerSid,
            })
          },
        )
        this.managerCheck({
          prepared,
          game: live.nativeGame,
          executorId: facade.executorId,
          issuerSid: record.issuerSid,
        })

        return rotatedResult
      })
      this.managerLive({
        prepared,
        game: live.nativeGame,
        executorId: facade.executorId,
        issuerSid: record.issuerSid,
      })
      this.credentialDisclosure(result, record)
      this.ticket({
        result,
        game: live.nativeGame,
        address: record,
        requestId: input.requestId,
        issuerSid: record.issuerSid,
      })

      return result
    } finally {
      this.accounts.releaseManager(prepared)
    }
  }

  async revoke(
    token: string,
    target: ControlTarget,
    input: ControlRequest,
  ): Promise<SecretAttempt> {
    const prepared = await this.accounts.prepareManager(token, target.game)

    try {
      // A fresh verified owner session may revoke, but cannot replace/renew, the
      // old issuer. The actual Game/executor must still be the exact live pin.
      const { live, facade, record } = this.controlRecord({
        prepared,
        target,
        expectedVersion: input.expectedVersion,
        sameIssuer: false,
      })
      const result = await withAccount(live.owner, () => {
        const revokedResult = this.writer.revoke(
          record,
          input,
          live.issuerSid,
          () => {
            this.managerCheck({
              prepared,
              game: live.nativeGame,
              executorId: facade.executorId,
            })
          },
        )
        this.managerCheck({
          prepared,
          game: live.nativeGame,
          executorId: facade.executorId,
        })

        return revokedResult
      })
      this.managerLive({
        prepared,
        game: live.nativeGame,
        executorId: facade.executorId,
      })

      return result
    } finally {
      this.accounts.releaseManager(prepared)
    }
  }

  async activate(
    address: ServiceAddress,
    capability: string,
    input: ControlRequest,
  ): Promise<SecretAttempt> {
    this.provider(address.provider)
    const proof = this.verifier.authorizeActivation(
      address,
      capability,
      (game) => this.facades.get(game),
    )
    const live = () => {
      this.assertOpen()
      this.accounts.assertLiveOwner(
        {
          owner: proof.lease.owner,
          issuerSid: proof.lease.issuerSid,
          game: proof.lease.game,
          expiresAt: proof.lease.expiresAt,
        },
        proof.nativeGame,
      )

      if (
        this.facades.get(proof.nativeGame) !== proof.facade ||
        proof.facade.executorId !== proof.lease.executorId
      ) {
        serviceDenied()
      }
    }
    const check = () => {
      live()

      if (scopedAccount() !== proof.lease.owner) {
        serviceDenied()
      }
    }
    const result = await withAccount(proof.lease.owner, () => {
      const activatedResult = this.writer.activate(
        proof.address,
        capability,
        input,
        check,
      )
      check()

      return activatedResult
    })
    live()
    const current = this.verifier.authorizeActivation(
      address,
      capability,
      (game) => this.facades.get(game),
    )

    if (
      current.nativeGame !== proof.nativeGame ||
      current.facade !== proof.facade
    ) {
      serviceDenied()
    }

    return result
  }

  private coordinator(context: VerifiedServiceContext) {
    this.assertOpen()
    const live = this.accounts.assertLiveOwner({
      owner: context.owner,
      issuerSid: context.issuerSid,
      game: context.game,
      expiresAt: context.expiresAt,
    })
    const facade = this.facades.get(live.nativeGame)

    if (
      !facade ||
      facade.executorId !== context.executorId ||
      !this.verifier.verifyCurrent(context, "register")
    ) {
      serviceDenied()
    }

    let cache = this.coordinators.get(live.nativeGame)

    if (!cache) {
      cache = new Map()
      this.coordinators.set(live.nativeGame, cache)
    }

    let coordinator = cache.get(context.service)

    if (!coordinator) {
      // First lifecycle root/DB access is strictly after successful ACTIVE proof.
      const root = this.rootResolver(context.owner, context.game)

      if (typeof root !== "string") {
        serviceDenied()
      }

      const store = new PrototypeStore(
        root,
        context,
        this.verifier.verifyCurrent,
      )
      this.stores.add(store)
      coordinator = new LifecyclePrototype(
        store,
        facade,
        this.verifier.verifyCurrent,
      )
      cache.set(context.service, coordinator)
    }

    return coordinator
  }

  private async dispatch({
    address,
    capability,
    action,
    input,
  }: {
    address: ServiceAddress
    capability: string
    action: Action
    input: RegistrationInput | OperationInput
  }): Promise<Receipt> {
    this.provider(address.provider)
    const context = this.verifier.begin(address, capability, action, (game) =>
      this.facades.get(game),
    )

    try {
      const result = await withAccount(context.owner, () => {
        this.assertOpen()

        if (
          scopedAccount() !== context.owner ||
          !this.verifier.verifyCurrent(context, action)
        ) {
          serviceDenied()
        }

        const coordinator = this.coordinator(context)
        // No await/Promise/native reconstruction inside this owning turn.
        const work = () =>
          action === "register"
            ? coordinator.register(context, input as RegistrationInput)
            : coordinator.operate(context, input as OperationInput)
        const receipt = this.adoption
          ? this.adoption.run(
              this.accounts.assertLiveOwner(context).nativeGame,
              () => {
                this.assertOpen()

                if (
                  scopedAccount() !== context.owner ||
                  !this.verifier.verifyCurrent(context, action)
                ) {
                  serviceDenied()
                }
              },
              work,
            )
          : work()
        this.assertOpen()

        if (!this.verifier.verifyCurrent(context, action)) {
          serviceDenied()
        }

        return receipt
      })
      // Async owner-scope completion is also a revalidation boundary before
      // returning a secret-free receipt. An earlier effect is never rolled back.
      this.assertOpen()

      if (!this.verifier.verifyCurrent(context, action)) {
        serviceDenied()
      }

      return result
    } finally {
      this.verifier.release(context)
    }
  }
  register(
    address: ServiceAddress,
    capability: string,
    input: RegistrationInput,
  ) {
    return this.dispatch({ address, capability, action: "register", input })
  }
  operate(address: ServiceAddress, capability: string, input: OperationInput) {
    if (!["poll", "answer", "hangup"].includes(input.action)) {
      serviceDenied()
    }

    return this.dispatch({ address, capability, action: input.action, input })
  }
  close() {
    if (this.closed) {
      return
    }

    this.closed = true
    this.adoption?.close()
    for (const store of this.stores) {
      store.close()
    }
    this.stores.clear()
  }
}
