import { useTranslation } from "react-i18next"
import { SiteButton } from "../shared/SiteButton"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
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
        <a className="btn primary" href="/studio/prepare">
          {t("Prepare show")}
        </a>
      </div>
      {gameId && (
        <section className="editor-panel">
          <h2>{t("Last opened session")}</h2>
          <p>
            {t(
              "Sessions live in memory. The host verifies availability when you reopen one.",
            )}
          </p>
          <a
            className="btn ghost"
            href={`/party/manager/${encodeURIComponent(gameId)}`}
          >
            {t("Open host")}
          </a>
          <a
            className="btn ghost"
            href={`/display/${encodeURIComponent(gameId)}`}
          >
            {t("Open presenter")}
          </a>
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

export function Prepare({ games }: { games: QuizMeta[] }) {
  const t = useSiteText()
  const requested =
    new URLSearchParams(window.location.search).get("quiz") ?? ""
  const [selected, setSelected] = useState(
    games.some((game) => game.id === requested) ? requested : "",
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const navigate = useNavigate()
  const { updateManager } = useManagerStore()
  const start = async () => {
    if (busy || !selected) {
      return
    }

    setBusy(true)
    setError(false)

    try {
      const { gameId, inviteCode } = await siteRequest<{
        gameId: string
        inviteCode: string
      }>("/api/games", {
        method: "POST",
        body: JSON.stringify({ quizzId: selected }),
      })
      updateManager({
        gameId,
        inviteCode,
        status: createStatus(STATUS.SHOW_ROOM, {
          text: "game:waitingForPlayers",
          inviteCode,
        }),
      })
      await navigate({ to: "/party/manager/$gameId", params: { gameId } })
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <>
      <h1>{t("Prepare show")}</h1>
      <section className="editor-panel">
        <h2>{t("Choose your game")}</h2>
        <p>
          {t(
            "Open a real room, then configure participants, audio and presentation in the existing host.",
          )}
        </p>
        <label>
          {t("My Games")}
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={busy}
          >
            <option value="">{t("Choose a game")}</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.subject}
              </option>
            ))}
          </select>
        </label>
        <SiteButton
          disabled={!selected || busy}
          className="btn primary"
          onClick={() => void start()}
        >
          {t(busy ? "Please wait…" : "Open show room")}
        </SiteButton>
        {error && (
          <p role="alert">
            {t(
              "Unable to start. Check your session and capacity, then try again.",
            )}
          </p>
        )}
        {!games.length && (
          <a className="btn ghost" href="/manager/quizz">
            {t("Create game")}
          </a>
        )}
      </section>
    </>
  )
}
