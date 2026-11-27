import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, LogOut, Play, RefreshCw } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  Input,
  StatusState,
} from "@razzia/extensions/platform-ui"
import type {
  ManagedClientGameSummary,
  ManagedClientSessionResponse,
} from "@razzia/common/types/managed-clients"
import { STATUS } from "@razzia/common/types/game/status"
import { socketClient } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { createStatus } from "@razzia/web/features/game/utils/createStatus"
import {
  enterManagedClientMode,
  MANAGED_CLIENT_EXPIRED_EVENT,
  managedClientHostUrl,
} from "@razzia/web/lib/managed-client-session"
import {
  closeManagedClientSession,
  isManagedClientCode,
  launchManagedClientGame,
  ManagedClientApiError,
  openManagedClientSession,
  readManagedClientGames,
  readManagedClientSession,
} from "../../adapters/managed-clients"
import {
  useManagedClientText,
  type ManagedClientTextKey,
} from "../../locales/clients"
import { ReferenceCanvas } from "../shared/ReferenceCanvas"
import styles from "./managed-clients.css?inline"

const sessionKey = ["tadazz-managed-client", "session"] as const
const gamesKey = (id: string) => ["tadazz-managed-client", id, "games"] as const

export function ManagedClientPortal() {
  const t = useManagedClientText()
  const queryClient = useQueryClient()
  const [expired, setExpired] = useState(
    () => new URLSearchParams(window.location.search).get("expired") === "1",
  )
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: async ({ signal }) => {
      try {
        return await readManagedClientSession(signal)
      } catch (error) {
        if (error instanceof ManagedClientApiError && error.status === 401) {
          return null
        }

        throw error
      }
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchInterval: 60_000,
  })
  const endLocalSession = useCallback(() => {
    socketClient.disconnect()
    useManagerStore.getState().resetManager()
    void queryClient
      .cancelQueries({ queryKey: ["tadazz-managed-client"] })
      .then(() => {
        queryClient.removeQueries({
          queryKey: ["tadazz-managed-client"],
          predicate: (query) => query.queryKey[1] !== "session",
        })
        queryClient.setQueryData(sessionKey, null)
      })
  }, [queryClient])
  const sessionEnded = useCallback(() => {
    setExpired(true)
    endLocalSession()
  }, [endLocalSession])

  useEffect(() => {
    window.addEventListener(MANAGED_CLIENT_EXPIRED_EVENT, sessionEnded)

    return () =>
      window.removeEventListener(MANAGED_CLIENT_EXPIRED_EVENT, sessionEnded)
  }, [sessionEnded])

  const opened = async (value: ManagedClientSessionResponse) => {
    enterManagedClientMode()
    socketClient.disconnect()
    useManagerStore.getState().resetManager()
    await queryClient.cancelQueries({ queryKey: ["tadazz-managed-client"] })
    queryClient.removeQueries({
      queryKey: ["tadazz-managed-client"],
      predicate: (query) => query.queryKey[1] !== "session",
    })
    queryClient.setQueryData(sessionKey, value)
    setExpired(false)
    window.history.replaceState(window.history.state, "", "/client")
  }

  return (
    <ReferenceCanvas variant="studio" styles={styles}>
      <main className="client-portal" data-testid="managed-client-portal">
        <header className="client-portal-header">
          <img
            className="client-portal-logo"
            src="/tadazz-design-reference/marketing-logo.webp"
            alt="Tadazz"
          />
          {session.data && <span>{session.data.client.name}</span>}
        </header>
        {session.isPending && (
          <StatusState kind="loading" title={t("loadingGames")} />
        )}
        {session.isError && (
          <StatusState
            kind="error"
            title={t("error")}
            action={
              <Button onClick={() => void session.refetch()}>
                {t("retry")}
              </Button>
            }
          />
        )}
        {session.isSuccess && !session.data && (
          <ClientCodeEntry expired={expired} onOpen={opened} />
        )}
        {session.data && (
          <ClientGameLibrary
            key={session.data.client.id}
            session={session.data}
            onExpired={sessionEnded}
            onSignOut={() => {
              setExpired(false)
              endLocalSession()
            }}
          />
        )}
      </main>
    </ReferenceCanvas>
  )
}

function ClientCodeEntry({
  expired,
  onOpen,
}: {
  expired: boolean
  onOpen: (session: ManagedClientSessionResponse) => Promise<void>
}) {
  const t = useManagedClientText()
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ManagedClientTextKey | null>(null)
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const pending = useRef<AbortController | null>(null)
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000))

  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (!retryAt) {
      return
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000)

    return () => window.clearInterval(timer)
  }, [retryAt])

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (pending.current || !isManagedClientCode(code) || remaining) {
      return
    }

    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError(null)

    try {
      const session = await openManagedClientSession(code, controller.signal)

      if (!controller.signal.aborted) {
        setCode("")
        await onOpen(session)
      }
    } catch (failure) {
      if (controller.signal.aborted) {
        return
      }

      if (failure instanceof ManagedClientApiError && failure.status === 429) {
        const delay = Math.max(1, failure.retryAfterSeconds || 30)
        setNow(Date.now())
        setRetryAt(Date.now() + delay * 1000)
        setError("rateLimited")
      } else {
        setError(
          failure instanceof ManagedClientApiError && failure.status === 401
            ? "invalidCode"
            : "error",
        )
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setBusy(false)
      }
    }
  }

  return (
    <Card className="client-entry client-access-form">
      <h1>{t("entryTitle")}</h1>
      <p className="client-muted">{t("entryDescription")}</p>
      {expired && <p role="status">{t("sessionExpired")}</p>}
      <form
        className="client-access-form"
        onSubmit={(event) => void submit(event)}
      >
        <Input
          label={t("codeLabel")}
          description={t("codeFormat")}
          className="client-access-code"
          name="client-access-code"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
          spellCheck={false}
          dir="ltr"
          value={code}
          disabled={busy}
          onChange={(event) => {
            setCode(event.target.value)
            setError(null)
          }}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={busy}
          disabled={!isManagedClientCode(code) || remaining > 0}
        >
          {t(busy ? "signingIn" : "continue")}
          <ArrowRight
            size={18}
            className="site-directional-icon"
            aria-hidden="true"
          />
        </Button>
        {error && <p role="alert">{t(error)}</p>}
        {remaining > 0 && (
          <p className="client-muted">{t("retryIn", { seconds: remaining })}</p>
        )}
      </form>
    </Card>
  )
}

function ClientGameLibrary({
  session,
  onExpired,
  onSignOut,
}: {
  session: ManagedClientSessionResponse
  onExpired: () => void
  onSignOut: () => void
}) {
  const t = useManagedClientText()
  const games = useQuery({
    queryKey: gamesKey(session.client.id),
    queryFn: ({ signal }) => readManagedClientGames(signal),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: "always",
  })
  const [opening, setOpening] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<ManagedClientTextKey | null>(null)
  const launchRequests = useRef(new Map<string, string>())
  const pending = useRef<AbortController | null>(null)
  const logoutPending = useRef(false)

  useEffect(() => {
    if (
      games.error instanceof ManagedClientApiError &&
      games.error.status === 401
    ) {
      onExpired()
    }
  }, [games.error, onExpired])
  useEffect(() => {
    const cancel = () => {
      pending.current?.abort()
      pending.current = null
    }
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        cancel()
        setOpening(null)
      }
    }
    window.addEventListener("pagehide", cancel)
    window.addEventListener("pageshow", restore)

    return () => {
      cancel()
      window.removeEventListener("pagehide", cancel)
      window.removeEventListener("pageshow", restore)
    }
  }, [])

  const start = async (game: ManagedClientGameSummary) => {
    if (pending.current || logoutPending.current || !game.available) {
      return
    }

    const controller = new AbortController()
    pending.current = controller
    setOpening(game.id)
    setError(null)
    const deadline = window.setTimeout(() => controller.abort(), 20_000)

    try {
      const requestId =
        launchRequests.current.get(game.id) ?? crypto.randomUUID()
      launchRequests.current.set(game.id, requestId)
      const response = await launchManagedClientGame(
        game.id,
        requestId,
        controller.signal,
      )

      if (pending.current !== controller || controller.signal.aborted) {
        return
      }

      const destination = managedClientHostUrl(
        response.gameId,
        response.hostUrl,
      )
      useManagerStore.getState().updateManager({
        gameId: response.gameId,
        inviteCode: response.inviteCode,
        status: createStatus(STATUS.SHOW_ROOM, {
          text: "game:waitingForPlayers",
          inviteCode: response.inviteCode,
        }),
      })
      window.location.replace(destination)
    } catch (failure) {
      if (pending.current !== controller) {
        return
      }

      if (failure instanceof ManagedClientApiError && failure.status === 401) {
        onExpired()
      } else {
        let message: ManagedClientTextKey = "launchFailed"

        if (failure instanceof ManagedClientApiError) {
          if (failure.code === "client-game-theme-unavailable") {
            message = "themeUnavailable"
          } else if (failure.code === "client-game-unavailable") {
            message = "gameUnavailable"
          }
        }

        setError(message)
        void games.refetch()
      }
    } finally {
      window.clearTimeout(deadline)

      if (pending.current === controller) {
        pending.current = null
        setOpening(null)
      }
    }
  }

  const signOut = async () => {
    if (logoutPending.current || pending.current) {
      return
    }

    logoutPending.current = true
    setSigningOut(true)
    setError(null)

    try {
      await closeManagedClientSession()
      onSignOut()
    } catch (failure) {
      if (failure instanceof ManagedClientApiError && failure.status === 401) {
        onSignOut()
      } else {
        setError("signOutFailed")
      }
    } finally {
      logoutPending.current = false
      setSigningOut(false)
    }
  }

  return (
    <section className="client-library" data-testid="client-game-library">
      <header className="client-library-header">
        <h1>{t("libraryTitle")}</h1>
        <p className="client-muted">{t("libraryDescription")}</p>
        <div className="client-actions">
          <Button
            disabled={Boolean(opening) || signingOut || games.isFetching}
            onClick={() => void games.refetch()}
          >
            <RefreshCw size={18} aria-hidden="true" />
            {t("refresh")}
          </Button>
          <Button
            disabled={Boolean(opening)}
            loading={signingOut}
            onClick={() => void signOut()}
          >
            <LogOut size={18} aria-hidden="true" />
            {t("signOut")}
          </Button>
        </div>
      </header>
      {error && <p role="alert">{t(error)}</p>}
      {games.isPending && (
        <StatusState kind="loading" title={t("loadingGames")} />
      )}
      {games.isError && (
        <StatusState
          kind="error"
          title={t("error")}
          action={
            <Button onClick={() => void games.refetch()}>{t("retry")}</Button>
          }
        />
      )}
      {games.isSuccess && (
        <div className="client-game-grid">
          {games.data.games.map((game) => (
            <Card
              key={game.id}
              className="client-game-card"
              data-testid="client-game-card"
            >
              <h2>{game.title || t("unknownGame")}</h2>
              <div className="client-access-form">
                <p className="client-muted">
                  {t("questionCount", { count: game.questionCount })}
                </p>
                {game.customTheme && <Badge>{t("customTheme")}</Badge>}
                {!game.available && (
                  <p>
                    {t(
                      game.unavailableReason === "theme-unavailable"
                        ? "themeUnavailable"
                        : "gameUnavailable",
                    )}
                  </p>
                )}
              </div>
              <Button
                variant="primary"
                loading={opening === game.id}
                disabled={!game.available || Boolean(opening) || signingOut}
                onClick={() => void start(game)}
              >
                <Play size={18} aria-hidden="true" />
                {t(opening === game.id ? "opening" : "start")}
              </Button>
            </Card>
          ))}
          {!games.data.games.length && (
            <StatusState kind="empty" title={t("noGames")} />
          )}
        </div>
      )}
    </section>
  )
}
