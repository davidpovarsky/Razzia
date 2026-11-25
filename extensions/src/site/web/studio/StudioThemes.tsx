import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Palette, Plus } from "lucide-react"
import { SiteLink } from "../shared/SiteLink"
import { SiteButton } from "../shared/SiteButton"
import { siteRequest } from "../../adapters/client"
import type { QuizMeta } from "./MyGames"

/** Theme selection belongs to a game draft, never to a detached builder document. */
export function StudioThemes({
  accountId,
  games,
  pending,
  failed,
  search,
  retry,
}: {
  accountId: string
  games: QuizMeta[]
  pending: boolean
  failed: boolean
  search: string
  retry: () => unknown
}) {
  const { t } = useTranslation()
  const [canAuthor, setCanAuthor] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setCanAuthor(false)
    void siteRequest<{ workspaces: Record<string, string[]> }>(
      "/api/themes/workspaces",
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10_000),
        ]),
      },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setCanAuthor(
            Object.values(result.workspaces).some((roles) =>
              roles.includes("author"),
            ),
          )
        }
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [accountId])
  const filtered = games.filter((game) =>
    game.subject
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase().trim()),
  )

  return (
    <section data-testid="studio-themes" className="studio-theme-library">
      <style>{`
        .studio-theme-library {display:grid;gap:24px;min-width:0}
        .studio-theme-library h1,.studio-theme-library p {margin:0}
        .studio-theme-library > header {display:grid;gap:12px}
        .studio-theme-library .theme-game-list {display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))}
        .studio-theme-library .theme-game {display:flex;flex-direction:column;align-items:flex-start;gap:20px;padding:24px;min-width:0;background:var(--tds-surface);border:1px solid var(--tds-border);border-radius:var(--tds-radius-card,20px)}
        .studio-theme-library .theme-game h2 {font-size:1.2rem;margin:0;overflow-wrap:anywhere}
        .studio-theme-library .theme-game .btn {margin-top:auto;max-width:100%;white-space:normal}
        .studio-theme-library .theme-library-actions {display:flex;flex-wrap:wrap;align-items:center;gap:16px}
      `}</style>
      <header>
        <h1>{t("extensions:themes.libraryTitle", "Game themes")}</h1>
        <p>
          {t(
            "extensions:themes.libraryDescription",
            "Choose a game to change or import its theme in the editor. Your questions and players stay with the game.",
          )}
        </p>
      </header>
      {pending && <p role="status">{t("common:loading")}</p>}
      {!pending && failed && (
        <div className="empty" role="alert">
          <p>{t("extensions:errors.loadQuizFailed")}</p>
          <SiteButton className="btn ghost" onClick={() => void retry()}>
            {t("extensions:conflict.reload")}
          </SiteButton>
        </div>
      )}
      {!pending && !failed && (
        <div className="theme-game-list">
          {filtered.map((game) => (
            <article className="theme-game" key={game.id}>
              <Palette aria-hidden="true" size={24} />
              <h2>{game.subject}</h2>
              <SiteLink
                className="btn primary"
                href={`/manager/quizz/${encodeURIComponent(game.id)}#themes`}
              >
                {t("extensions:themes.openEditor", "Choose theme in editor")}
              </SiteLink>
            </article>
          ))}
          {!filtered.length && (
            <p>
              {t(
                "extensions:themes.noGames",
                "No games to display. Create a game to choose its theme.",
              )}
            </p>
          )}
        </div>
      )}
      <div className="theme-library-actions">
        <SiteLink className="btn ghost" href="/manager/quizz#themes">
          <Plus size={18} />
          {t("extensions:themes.newGame", "Create a game")}
        </SiteLink>
        {canAuthor && (
          <SiteLink className="btn ghost" href="/studio/theme-builder">
            {t("extensions:themes.advancedBuilder", "Advanced theme authoring")}
          </SiteLink>
        )}
      </div>
    </section>
  )
}
