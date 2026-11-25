/** Owner-managed, play-only clients. Credentials are never part of list responses. */
export interface ManagedClientSummary {
  id: string
  name: string
  enabled: boolean
  gameIds: string[]
  createdAt: number
  updatedAt: number
}

export interface ManagedClientGameSummary {
  id: string
  title: string
  questionCount: number
  themeId: string | null
  customTheme: boolean
  available: boolean
  unavailableReason?: "game-unavailable" | "theme-unavailable"
}

export interface ManagedClientListResponse {
  clients: ManagedClientSummary[]
  games: ManagedClientGameSummary[]
}

export interface CreateManagedClientRequest {
  name: string
  gameIds: string[]
  requestId: string
}

export interface UpdateManagedClientRequest {
  name?: string
  /** Enabling always issues a fresh code through the rotate-code operation. */
  enabled?: false
}

export interface AssignManagedClientGamesRequest {
  gameIds: string[]
}

export interface ManagedClientResponse {
  client: ManagedClientSummary
}

/** Returned only by creation and rotation; do not persist, log, or cache code. */
export interface ManagedClientCodeResponse extends ManagedClientResponse {
  code: string
}

export interface ManagedClientSessionResponse {
  kind: "managed-client"
  role: "manager"
  client: { id: string; name: string }
  /** Unix seconds. Authentication stays in the HttpOnly session cookie. */
  expiresAt: number
}

export interface ManagedClientGamesResponse {
  games: ManagedClientGameSummary[]
}

export interface ManagedClientLaunchRequest {
  requestId: string
}

export interface ManagedClientLaunchResponse {
  gameId: string
  inviteCode: string
  hostUrl: string
}

export type ManagedClientError =
  | "invalid-client-code"
  | "client-session-expired"
  | "client-code-rate-limited"
  | "client-launch-request-conflict"
  | "client-game-unavailable"
  | "client-game-theme-unavailable"
  | "client-create-already-completed"
  | "client-not-found"
  | "client-invalid-request"
  | "client-code-space-exhausted"
