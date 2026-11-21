import type { QuizzWithId } from "@razzia/common/types/game"
import type {
  ManagedClientGameSummary,
  ManagedClientListResponse,
} from "@razzia/common/types/managed-clients"
import {
  assignManagedClientGamesValidator,
  createManagedClientValidator,
  updateManagedClientValidator,
} from "@razzia/common/validators/managed-clients"
import { showThemeRegistry } from "@razzia/extensions/core"
import { readSidecar, sidecarExists } from "@razzia/extensions/server"
import { z } from "zod"
import { accountsEnabled, activeAccount, withAccount } from "./account-scope"
import { getPath, getQuizz } from "./config"
import { ManagedClientFailure, ManagedClientStore } from "./managed-clients"
import {
  installedThemeForSelection,
  publishedCompositionForPin,
} from "./theme-installation"

const clientIdSchema = z.uuid()

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)

  if (!result.success) {
    throw new ManagedClientFailure("client-invalid-request", 400)
  }

  return result.data
}

/** Caller has already established the owner; never accepts an owner from JSON. */
export function describeManagedClientGame(
  ownerId: string,
  quiz: QuizzWithId,
): ManagedClientGameSummary {
  if (activeAccount() !== ownerId) {
    throw new Error("Managed-client catalogue requires its content-owner scope")
  }

  const extras = readSidecar(getPath, quiz.id)
  const selection =
    extras && "defaults" in extras ? extras.defaults.showTheme : undefined
  const composition =
    extras && "defaults" in extras ? extras.defaults.showComposition : undefined
  const builtIn = selection
    ? showThemeRegistry.get(selection.id, selection.version)
    : undefined
  const selectedAvailable =
    !selection ||
    Boolean(builtIn ?? installedThemeForSelection(ownerId, selection))
  const compositionAvailable =
    !composition ||
    Boolean(publishedCompositionForPin(ownerId, composition, quiz.subject))
  const available =
    (extras !== null || !sidecarExists(getPath, quiz.id)) &&
    selectedAvailable &&
    compositionAvailable

  return {
    id: quiz.id,
    title: quiz.subject,
    questionCount: quiz.questions.length,
    themeId: selection?.id ?? null,
    customTheme: Boolean(selection && !builtIn),
    available,
    ...(!available ? { unavailableReason: "theme-unavailable" as const } : {}),
  }
}

function requireEnabled(): void {
  if (!accountsEnabled()) {
    throw new ManagedClientFailure("client-not-found", 404)
  }
}

function validateGames(ids: string[]): void {
  const owned = new Set(getQuizz().map((quiz) => quiz.id))

  if (ids.some((id) => !owned.has(id))) {
    throw new ManagedClientFailure("client-game-unavailable", 404)
  }
}

/** Owner API and the documented operator CLI use this same validated service. */
export class ManagedClientOwnerService {
  constructor(private readonly store = new ManagedClientStore()) {}

  async list(ownerId: string): Promise<ManagedClientListResponse> {
    requireEnabled()
    const clients = this.store.list(ownerId)

    return await withAccount(ownerId, () => ({
      clients,
      games: getQuizz().map((quiz) => describeManagedClientGame(ownerId, quiz)),
    }))
  }

  async create(ownerId: string, input: unknown) {
    requireEnabled()
    const value = parse(createManagedClientValidator, input)
    // Reject disabled/missing owners before entering any native data scope.
    this.store.list(ownerId)

    return await withAccount(ownerId, () => {
      validateGames(value.gameIds)

      return this.store.create(ownerId, value)
    })
  }

  update(ownerId: string, id: string, input: unknown) {
    requireEnabled()

    return {
      client: this.store.update(
        ownerId,
        parse(clientIdSchema, id),
        parse(updateManagedClientValidator, input),
      ),
    }
  }

  async assign(ownerId: string, id: string, input: unknown) {
    requireEnabled()
    const clientId = parse(clientIdSchema, id)
    const value = parse(assignManagedClientGamesValidator, input)
    this.store.get(ownerId, clientId)

    return await withAccount(ownerId, () => {
      validateGames(value.gameIds)

      return { client: this.store.assign(ownerId, clientId, value.gameIds) }
    })
  }

  rotate(ownerId: string, id: string) {
    requireEnabled()

    return this.store.rotate(ownerId, parse(clientIdSchema, id))
  }

  async requireOwnedGame(ownerId: string, quizId: string): Promise<void> {
    requireEnabled()
    this.store.list(ownerId)
    await withAccount(ownerId, () => validateGames([quizId]))
  }

  findCreation(ownerId: string, requestId: string) {
    requireEnabled()

    return this.store.findCreation(ownerId, parse(z.uuid(), requestId))
  }

  get(ownerId: string, id: string) {
    requireEnabled()

    return this.store.get(ownerId, parse(clientIdSchema, id))
  }
}
