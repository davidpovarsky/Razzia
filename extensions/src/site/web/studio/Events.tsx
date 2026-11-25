import { SiteLink } from "../shared/SiteLink"
import { useTranslation } from "react-i18next"
import { SiteButton } from "../shared/SiteButton"
import { useCallback, useEffect, useRef, useState } from "react"
import { Select } from "@razzia/extensions/platform-ui"
import { useQuery } from "@tanstack/react-query"
import type { GameResult } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { createStatus } from "@razzia/web/features/game/utils/createStatus"
import ResultModal from "@razzia/web/features/manager/components/ResultModal"
import { siteKey, siteRequest } from "../../adapters/client"
import { SiteDialog, ResultDialog } from "../shared/Dialog"
import { useSiteText } from "../../locales"
import type { QuizMeta } from "./MyGames"

export interface ResultMeta {
  id: string
  subject: string
  date: string
  playerCount: number
}

export function Events({
  accountId,
  results,
  refresh,
}: {
  accountId: string
  results: ResultMeta[]
  refresh: () => Promise<unknown>
}) {
  const t = useSiteText()
  const { t: upstream } = useTranslation()
  const [selected, setSelected] = useState("")
  const [pending, setPending] = useState<ResultMeta | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const result = useQuery({
    queryKey: siteKey(accountId, "result", selected),
    queryFn: ({ signal }) =>
      siteRequest<GameResult>(`/api/results/${encodeURIComponent(selected)}`, {
        signal,
      }),
    enabled: Boolean(selected),
  })
  const { gameId } = useManagerStore()

  return (
    <>
      <div className="section-head">
        <h1>{t("My Events")}</h1>
        <SiteLink className="btn primary" href="/studio/prepare">
          {t("Prepare show")}
        </SiteLink>
      </div>
      {gameId && (
        <section className="editor-panel">
          <h2>{t("Last opened session")}</h2>
          <p>
            {t(
              "Sessions live in memory. The host verifies availability when you reopen one.",
            )}
          </p>
          <SiteLink
            className="btn ghost"
            href={`/party/manager/${encodeURIComponent(gameId)}`}
          >
            {t("Open host")}
          </SiteLink>
          <SiteLink
            className="btn ghost"
            href={`/display/${encodeURIComponent(gameId)}`}
          >
            {t("Open presenter")}
          </SiteLink>
        </section>
      )}
      <h2>{t("Past events")}</h2>
      <p className="muted">
        {t(
          "Saved results from completed shows. Scheduled events are not supported yet.",
        )}
      </p>
      <div className="site-results">
        {[...results]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((event) => (
            <article className="editor-panel" key={event.id}>
              <h3>{event.subject}</h3>
              <p>
                {new Date(event.date).toLocaleString()} ·{" "}
                {upstream("manager:result.playerCount", {
                  count: event.playerCount,
                })}
              </p>
              <div className="button-row">
                <SiteButton
                  className="btn ghost"
                  onClick={() => setSelected(event.id)}
                >
                  {t("View results")}
                </SiteButton>
                <SiteButton
                  disabled={busy}
                  className="text-link site-danger"
                  onClick={() => setPending(event)}
                >
                  {t("Delete")}
                </SiteButton>
              </div>
            </article>
          ))}
      </div>
      {!results.length && (
        <div className="empty">
          <h3>{t("No past events yet.")}</h3>
        </div>
      )}
      {(error || result.isError) && (
        <p role="alert">
          {t("Your request could not be completed. Please try again.")}
        </p>
      )}
      {selected && result.isPending && <p role="status">{t("Please wait…")}</p>}
      {selected && result.data && (
        <ResultDialog
          label={result.data.subject}
          onClose={() => setSelected("")}
        >
          <ResultModal result={result.data} onClose={() => setSelected("")} />
        </ResultDialog>
      )}
      {pending && (
        <SiteDialog
          title={t("Delete results?")}
          onClose={() => setPending(null)}
        >
          <p>{pending.subject}</p>
          {error && (
            <p role="alert">
              {t("Your request could not be completed. Please try again.")}
            </p>
          )}
          <SiteButton
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(false)

              try {
                await siteRequest(
                  `/api/results/${encodeURIComponent(pending.id)}`,
                  { method: "DELETE" },
                )
                setPending(null)
                setSelected("")
                await refresh()
              } catch {
                setError(true)
              } finally {
                setBusy(false)
              }
            }}
          >
            {t("Confirm delete")}
          </SiteButton>
        </SiteDialog>
      )}
    </>
  )
}

export function Prepare({
  games,
  requestedId,
}: {
  games: QuizMeta[]
  requestedId: string
}) {
  const t = useSiteText()
  const [selection, setSelection] = useState(requestedId)
  const selected = games.some((game) => game.id === selection) ? selection : ""
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const pending = useRef<AbortController | null>(null)
  const opened = useRef<{ quizId: string; gameId: string } | null>(null)
  const launchRequest = useRef<{
    quizId: string
    requestId: string
  } | null>(null)
  const automaticAttempted = useRef(false)
  const [openedQuizId, setOpenedQuizId] = useState("")
  const { updateManager } = useManagerStore()
  const requestedGame = games.find((game) => game.id === requestedId)
  const direct = Boolean(requestedGame && selected === requestedId)

  useEffect(() => {
    const cancelPending = () => {
      const controller = pending.current
      pending.current = null
      controller?.abort()
    }
    const onPageHide = () => cancelPending()
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // History restores the React tree, including its pre-navigation busy
        // state. Restore the controls; never POST another room automatically.
        cancelPending()
        setBusy(false)
        setError(automaticAttempted.current && !opened.current)
      }
    }
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("pageshow", onPageShow)

    return () => {
      cancelPending()
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [])

  const start = useCallback(async () => {
    if (pending.current || !selected) {
      return
    }

    // A bfcache return or rapid second click reopens the acknowledged room.
    // Creating another room is never an implicit side effect of restoration.
    if (opened.current?.quizId === selected) {
      window.location.replace(
        `/party/manager/${encodeURIComponent(opened.current.gameId)}`,
      )

      return
    }

    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError(false)
    const deadline = window.setTimeout(() => controller.abort(), 20_000)

    try {
      // Retain the same request on retry when the server may have opened a room
      // but its response was lost. Choosing another game starts a new request.
      if (launchRequest.current?.quizId !== selected) {
        launchRequest.current = {
          quizId: selected,
          requestId: crypto.randomUUID(),
        }
      }

      const { gameId, inviteCode } = await siteRequest<{
        gameId: string
        inviteCode: string
      }>("/api/games", {
        method: "POST",
        body: JSON.stringify({
          quizzId: selected,
          requestId: launchRequest.current.requestId,
        }),
        signal: controller.signal,
      })

      if (pending.current !== controller || controller.signal.aborted) {
        return
      }

      if (!gameId || !inviteCode) {
        throw new Error("Missing room response")
      }

      opened.current = { quizId: selected, gameId }
      setOpenedQuizId(selected)
      updateManager({
        gameId,
        inviteCode,
        status: createStatus(STATUS.SHOW_ROOM, {
          text: "game:waitingForPlayers",
          inviteCode,
        }),
      })
      // The intermediate launch page should never become a Back-button stop
      // that silently creates another room for the same selection.
      window.location.replace(`/party/manager/${encodeURIComponent(gameId)}`)
    } catch {
      if (pending.current === controller) {
        setError(true)
      }
    } finally {
      window.clearTimeout(deadline)

      if (pending.current === controller) {
        pending.current = null
        setBusy(false)
      }
    }
  }, [selected, updateManager])

  useEffect(() => {
    if (!direct || automaticAttempted.current) {
      return
    }

    // Defer one task so StrictMode's setup/cleanup cycle cannot send a POST
    // from an abandoned effect. A failed request stays available for retry.
    const timer = window.setTimeout(() => {
      automaticAttempted.current = true
      void start()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [direct, start])

  let openLabel = t("Open show room")

  if (busy) {
    openLabel = t("Please wait…")
  } else if (selected && openedQuizId === selected) {
    openLabel = t("Open host")
  }

  return (
    <>
      <h1>{t("Prepare show")}</h1>
      <section className="editor-panel">
        <h2>{direct ? requestedGame?.subject : t("Choose your game")}</h2>
        <p>
          {t(
            "Open a real room, then configure participants, audio and presentation in the existing host.",
          )}
        </p>
        <div className="site-prepare-fields" aria-busy={busy}>
          {!direct && (
            <Select
              label={t("My Games")}
              value={selected}
              onChange={(event) => {
                setSelection(event.target.value)
                setError(false)
              }}
              disabled={busy}
            >
              <option value="">{t("Choose a game")}</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.subject}
                </option>
              ))}
            </Select>
          )}
          {direct && !error && <p role="status">{t("Opening your show…")}</p>}
          {(!direct || error || openedQuizId === selected) && (
            <SiteButton
              disabled={!selected || busy}
              className="btn primary"
              onClick={() => void start()}
            >
              {openLabel}
            </SiteButton>
          )}
          {direct && (
            <SiteLink className="btn ghost" href="/studio/games">
              {t("Back to My Games")}
            </SiteLink>
          )}
          {error && (
            <p role="alert">
              {t(
                "Unable to start. Check your session and capacity, then try again.",
              )}
            </p>
          )}
          {!games.length && (
            <SiteLink className="btn ghost" href="/manager/quizz">
              {t("Create game")}
            </SiteLink>
          )}
        </div>
      </section>
    </>
  )
}
