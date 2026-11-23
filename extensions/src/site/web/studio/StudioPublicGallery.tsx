import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { presentationControlText } from "../../../platform-ui"
import { ArrowRight, Play, Pencil } from "lucide-react"
import { publicDemoCatalogue } from "../../../core/show-library/public-demo-catalogue"
import { createPublicPreviewProvider } from "../../components/game-preview/public-provider"
import { InlineGamePreviewBoundary } from "../../components/game-preview/boundary"
import { GamePreviewSurface } from "../../components/game-preview/game-preview-surface"
import { Cover } from "../marketing/Catalogue"
import catalogueStyles from "../marketing/catalogue.css?inline"
import { SiteLink } from "../shared/SiteLink"
import { SiteButton } from "../shared/SiteButton"
import { siteRequest } from "../../adapters/client"
import { useSiteText } from "../../locales"

export function StudioPublicGallery({ search }: { search: string }) {
  const t = useSiteText()
  const { i18n } = useTranslation()
  const provider = useMemo(createPublicPreviewProvider, [])
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState("")
  const games = publicDemoCatalogue.filter((game) =>
    [t(game.title), t(game.themeName), ...game.audience.map((item) => t(item))]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  )
  const customise = async (id: string) => {
    if (installing) {
      return
    }

    setInstalling(id)
    setError("")

    try {
      const result = await siteRequest<{ quizzId: string }>(
        `/api/extensions/catalogue/${encodeURIComponent(id)}/install`,
        { method: "POST", body: "{}", signal: AbortSignal.timeout(30_000) },
      )

      if (!/^[A-Za-z0-9_-]+$/u.test(result.quizzId)) {
        throw new Error("Invalid quiz")
      }

      window.location.assign(
        `/manager/quizz/${encodeURIComponent(result.quizzId)}`,
      )
    } catch {
      setError(t("We could not add this game. Please try again."))
    } finally {
      setInstalling(null)
    }
  }

  return (
    <InlineGamePreviewBoundary
      routeKey="studio-public-gallery"
      provider={provider}
    >
      <style>{catalogueStyles}</style>
      <div className="pagehead">
        <h1>{t("Explore Games")}</h1>
      </div>
      <p className="muted">
        {t(
          "Complete games, ready to play. Every theme is also available in your editor.",
        )}
      </p>
      {error && (
        <p role="alert" className="catalogue-player-error">
          {error}
        </p>
      )}
      <div className="studio-public-gallery">
        {games.map((game) => (
          <article key={game.id} data-catalogue-card={game.id}>
            <GamePreviewSurface
              selection={{ kind: "published-demo", catalogueId: game.id }}
              label={t("View {{name}}", { name: t(game.title) })}
              onOpen={() =>
                window.location.assign(
                  `/?view=product&game=${encodeURIComponent(game.id)}`,
                )
              }
            >
              <Cover game={game} />
            </GamePreviewSurface>
            <div className="site-game-body">
              <h3>{t(game.title)}</h3>
              <div className="catalogue-studio-actions">
                <SiteLink
                  className="btn primary"
                  href={`/?view=demo&game=${encodeURIComponent(game.id)}`}
                >
                  <Play size={15} />
                  {t("Play this game")}
                </SiteLink>
                <SiteButton
                  className="btn ghost"
                  disabled={installing !== null}
                  onClick={() => void customise(game.id)}
                  data-catalogue-customise={game.id}
                >
                  <Pencil size={15} />
                  {t(
                    installing === game.id
                      ? "Adding your game…"
                      : "Customise a copy",
                  )}
                </SiteButton>
              </div>
              <details className="catalogue-studio-details">
                <summary>
                  {presentationControlText(
                    i18n.resolvedLanguage ?? i18n.language,
                    "details",
                  )}
                </summary>
                <p>{t(game.desc)}</p>
                <div className="catalogue-audiences">
                  {game.audience.map((item) => (
                    <span key={item}>{t(item)}</span>
                  ))}
                  <span>
                    {t("{{count}} rounds", { count: game.questionCount })}
                  </span>
                </div>
                <SiteLink
                  className="btn ghost"
                  href={`/?view=product&game=${encodeURIComponent(game.id)}`}
                >
                  {t("View game")}
                  <ArrowRight size={15} />
                </SiteLink>
              </details>
            </div>
          </article>
        ))}
        {games.length === 0 && <p>{t("No games found")}</p>}
      </div>
    </InlineGamePreviewBoundary>
  )
}
