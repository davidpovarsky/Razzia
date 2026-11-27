import marketing from "../../../../site-assets/marketing.css?inline"
import { SiteLink } from "../shared/SiteLink"
import { asset, catalogue, Cover, GameCard, type Game } from "./Catalogue"
import { corrections } from "../../themes/corrections"
import { sitePlatformStyle } from "../../themes/platform"
import { ContactForm } from "./ContactForm"
import { Pricing } from "./Pricing"
import { LegalPolicyLinks, LegalPolicyPage } from "./LegalPolicies"
import { resolveLegalPolicy } from "./legal-policies"
import { publishedLegalPolicies } from "./legal-policies.public"
import { GreatGuessOffDemo } from "./GreatGuessOffDemo"
import { CatalogueGameDemo } from "./CatalogueGameDemo"
import catalogueStyles from "./catalogue.css?inline"
import marketingLayoutStyles from "./marketing-layout.css?inline"
import {
  hasManagerSession,
  siteRequest,
  SiteApiError,
} from "../../adapters/client"
import guessOffStyles from "./great-guessoff.css?inline"
import { SiteButton } from "../shared/SiteButton"
import { useEffect, useState, useMemo, useRef } from "react"
import { createPublicPreviewProvider } from "../../components/game-preview/public-provider"
import { GamePreviewSurface } from "../../components/game-preview/game-preview-surface"
import { previewText } from "../../../presentation/show-library-preview/ui-strings"
import { previewLocale } from "../../components/game-preview/i18n"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { siteText as t, siteLanguages } from "../../locales"
import { useTranslation } from "react-i18next"
import { matchesCatalogueSearch } from "./catalogue-search"
import { InlineGamePreviewBoundary } from "../../components/game-preview/boundary"
import { SESSION_ROLES } from "@razzia/common/constants"
import { getRole } from "@razzia/web/lib/session"
import { ReferenceCanvas } from "../shared/ReferenceCanvas"
import { BorderBeam } from "../../components/MagicBorderBeam"
import {
  ArrowRight,
  Play,
  Plus,
  Pencil,
  Clapperboard,
  Menu,
  Search,
} from "lucide-react"

function selectedCatalogueGame(search: string): Game {
  const params = new URLSearchParams(search)

  return (
    catalogue.find(
      (game) =>
        game.id ===
        (params.get("game") === "guessoff"
          ? "great-guessoff"
          : params.get("game")),
    ) ?? catalogue[0]
  )
}

export function MarketingSite() {
  const previewProvider = useMemo(createPublicPreviewProvider, [])
  const { i18n } = useTranslation("tadazzSite")
  const resolvedLanguage = i18n.resolvedLanguage?.split("-")[0] ?? "en"
  const language =
    siteLanguages.find((item) => item === resolvedLanguage) ?? "en"
  const router = useRouter()
  const searchString = useRouterState({
    select: (state) => state.location.searchStr,
  })
  const [view, setView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("view")

    return requested &&
      ([
        "store",
        "how",
        "pricing",
        "custom",
        "demo",
        "preview",
        "product",
      ].includes(requested) ||
        resolveLegalPolicy(requested, publishedLegalPolicies))
      ? requested
      : "home"
  })
  const [selected, setSelected] = useState(() =>
    selectedCatalogueGame(window.location.search),
  )
  const [filter, setFilter] = useState("All")
  const [audience, setAudience] = useState("All")
  const [installing, setInstalling] = useState<"play" | "edit" | null>(null)
  const [installError, setInstallError] = useState("")
  const [search, setSearch] = useState("")
  const [menu, setMenu] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const currentNavView = ["product", "preview", "demo"].includes(view)
    ? "store"
    : view
  const visibleGames = catalogue.filter(
    (game) =>
      (filter === "All" || game.category === filter) &&
      (audience === "All" || game.audience.includes(audience)) &&
      matchesCatalogueSearch(
        [
          t(game.title),
          t(game.themeName),
          ...game.audience.map((item) => t(item)),
        ].join(" "),
        search,
        language,
      ),
  )
  useEffect(() => {
    const onBack = () => {
      const requested = new URLSearchParams(searchString).get("view")
      setView(
        requested &&
          ([
            "store",
            "how",
            "pricing",
            "custom",
            "demo",
            "preview",
            "product",
          ].includes(requested) ||
            resolveLegalPolicy(requested, publishedLegalPolicies))
          ? requested
          : "home",
      )
      setSelected(selectedCatalogueGame(searchString))
    }
    onBack()
  }, [searchString])

  const go = (page: string, gameId?: string) => {
    setView(page)
    setMenu(false)
    void router.navigate({
      to: "/",
      search:
        page === "home"
          ? {}
          : { view: page, ...(gameId ? { game: gameId } : {}) },
    })
    window.scrollTo(0, 0)
  }
  const open = (game: Game) => {
    setSelected(game)
    setInstallError("")
    go("product", game.id)
  }
  const openDemo = (game: Game = catalogue[0]) => {
    setSelected(game)
    go("demo", game.id)
  }
  const openPreview = (game: Game) => {
    setSelected(game)
    go("preview", game.id)
  }
  const useGame = async (game: Game, intent: "play" | "edit") => {
    if (installing) {
      return
    }

    const returnTo = `/?view=product&game=${encodeURIComponent(game.id)}`

    if (!hasManagerSession()) {
      window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`)

      return
    }

    setInstalling(intent)
    setInstallError("")

    try {
      const result = await siteRequest<{
        quizzId: string
        editorUrl: string
        launchUrl: string
      }>(`/api/extensions/catalogue/${encodeURIComponent(game.id)}/install`, {
        method: "POST",
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30_000),
      })

      // Only the verified local quiz identity is used for navigation.
      if (!/^[A-Za-z0-9_-]+$/u.test(result.quizzId)) {
        throw new Error("Invalid installed game")
      }

      window.location.assign(
        intent === "play"
          ? `/studio/prepare?quiz=${encodeURIComponent(result.quizzId)}`
          : `/manager/quizz/${encodeURIComponent(result.quizzId)}`,
      )
    } catch (error) {
      if (error instanceof SiteApiError && error.status === 401) {
        window.location.assign(
          `/login?returnTo=${encodeURIComponent(returnTo)}`,
        )
      } else {
        setInstallError(t("We could not add this game. Please try again."))
      }
    } finally {
      setInstalling(null)
    }
  }
  const legalView = resolveLegalPolicy(view, publishedLegalPolicies)
  const demonstration = previewText(previewLocale(i18n))
  const useGameLabel = installing ? "Adding your game…" : "Use this game"
  const nav = (
    <>
      {[
        ["store", "Games"],
        ["how", "How it works"],
        ["pricing", "Pricing"],
        ["custom", "Custom shows"],
      ].map(([id, label]) => (
        <SiteButton
          className="text-btn"
          key={id}
          onClick={() => go(id)}
          aria-current={currentNavView === id ? "page" : undefined}
        >
          {t(label)}
        </SiteButton>
      ))}
    </>
  )
  const cards = (games: Game[]) =>
    games.map((game) => (
      <GameCard
        key={game.id}
        game={game}
        open={() => open(game)}
        preview={() => openPreview(game)}
      />
    ))

  return (
    <InlineGamePreviewBoundary
      enabled
      routeKey={view}
      provider={previewProvider}
    >
      <ReferenceCanvas variant="marketing" styles={marketing}>
        <style>{corrections}</style>
        <style>{sitePlatformStyle}</style>
        <style>{guessOffStyles}</style>
        <style>{catalogueStyles}</style>
        <style>{marketingLayoutStyles}</style>
        <header
          className="site-header"
          onKeyDown={(event) => {
            if (menu && event.key === "Escape") {
              event.preventDefault()
              setMenu(false)
              menuTriggerRef.current?.focus()
            }
          }}
        >
          <div className="wide header-inner">
            <SiteLink className="brand" href="/">
              <img src={asset("logo")} alt="Tadazz" />
            </SiteLink>
            <nav className="header-links" aria-label={t("Main navigation")}>
              {nav}
            </nav>
            <div className="header-actions">
              <SiteButton
                className="text-btn header-demo"
                onClick={() => openDemo()}
              >
                <Play size={14} />
                {t("Try a round")}
              </SiteButton>
              {getRole() === SESSION_ROLES.MANAGER ? (
                <SiteLink className="text-btn" href="/studio">
                  {t("My Studio")}
                </SiteLink>
              ) : (
                <>
                  <SiteLink className="text-btn" href="/login">
                    {t("Log in")}
                  </SiteLink>
                  <SiteLink className="btn btn-outline" href="/signup">
                    {t("Sign up")}
                    <ArrowRight
                      className="site-directional-icon"
                      aria-hidden="true"
                      size={14}
                    />
                  </SiteLink>
                </>
              )}
              <SiteButton
                ref={menuTriggerRef}
                className="mobile-menu text-btn"
                aria-controls="marketing-mobile-nav"
                aria-label={t("Toggle navigation")}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <Menu />
              </SiteButton>
            </div>
          </div>
          {menu && (
            <nav
              id="marketing-mobile-nav"
              className="wrap mobile-nav"
              aria-label={t("Mobile navigation")}
            >
              {nav}
              <SiteButton className="text-btn" onClick={() => openDemo()}>
                {t("Try a round")}
              </SiteButton>
              {getRole() === SESSION_ROLES.MANAGER ? (
                <SiteLink className="text-btn" href="/studio">
                  {t("My Studio")}
                </SiteLink>
              ) : (
                <>
                  <SiteLink className="text-btn" href="/login">
                    {t("Log in")}
                  </SiteLink>
                  <SiteLink className="btn btn-primary" href="/signup">
                    {t("Create an account")}
                  </SiteLink>
                </>
              )}
            </nav>
          )}
        </header>
        <main id="view">
          {legalView && publishedLegalPolicies && (
            <LegalPolicyPage
              policies={publishedLegalPolicies}
              kind={legalView}
            />
          )}
          {view === "home" && (
            <>
              <div className="cinema-home">
                <div className="wide cinema-hero">
                  <div className="cinema-copy">
                    <h1 className="cinema-title">
                      {t("Make it a")}
                      <br />
                      <span>{t("show.")}</span>
                    </h1>
                    <p className="subhead">
                      {t(
                        "Your event, transformed into a gameshow. Choose a ready-made experience or make one your own.",
                      )}
                    </p>
                    <div className="button-row cinema-buttons">
                      <SiteButton
                        className="btn btn-primary btn-lg"
                        onClick={() => openDemo()}
                      >
                        <Play size={15} />
                        {t("Try a round")}
                      </SiteButton>
                      <SiteButton
                        className="btn btn-outline btn-lg"
                        onClick={() => go("store")}
                      >
                        {t("Explore games")}
                        <ArrowRight
                          className="site-directional-icon"
                          aria-hidden="true"
                          size={15}
                        />
                      </SiteButton>
                    </div>
                  </div>
                  <div
                    className="cinema-stage"
                    role="img"
                    aria-label={t(
                      "The TADAZZ theatrical stage and interlocking blue and lime Zs",
                    )}
                  >
                    <img
                      className="cinema-stage-bg"
                      src={asset("stage")}
                      alt=""
                    />
                    <div className="hero-z-set" aria-hidden="true">
                      <img src={asset("zb")} alt="" />
                      <img src={asset("zl")} alt="" />
                    </div>
                    <div className="stage-sweep" />
                    <div className="stage-line" />
                    <span className="stage-label">
                      {t("It's your")} <em>{t("moment.")}</em>
                    </span>
                    <BorderBeam
                      size={95}
                      duration={15}
                      colorFrom="#e5ff37"
                      colorTo="#a85cff"
                      borderWidth={1}
                    />
                  </div>
                  <div className="hero-light-line" />
                </div>
              </div>
              <section className="section section-quiet">
                <div className="wrap">
                  <div className="section-top">
                    <h2 className="section-title">{t("How will you play?")}</h2>
                  </div>
                  <div className="routes-grid">
                    {[
                      [
                        "Ready to play",
                        "Choose a complete gameshow.",
                        Clapperboard,
                      ],
                      [
                        "Make it yours",
                        "Start with a show and personalise it.",
                        Pencil,
                      ],
                      [
                        "Start fresh",
                        "Build a show that's all your own.",
                        Plus,
                      ],
                    ].map(([title, description, Icon], i) => (
                      <SiteButton
                        className="route-card"
                        key={t(String(title))}
                        onClick={() =>
                          i === 2
                            ? window.location.assign(
                                getRole() === SESSION_ROLES.MANAGER
                                  ? "/manager/quizz"
                                  : "/signup?returnTo=%2Fmanager%2Fquizz",
                              )
                            : go("store")
                        }
                      >
                        <img
                          className="route-watermark"
                          src={asset(i === 1 ? "zl" : "zb")}
                          alt=""
                        />
                        <span className="route-icon">
                          {typeof Icon !== "string" && <Icon size={32} />}
                        </span>
                        <h3 className="route-name">{t(String(title))}</h3>
                        <p>{t(String(description))}</p>
                        <span className="route-arrow">
                          <ArrowRight
                            className="site-directional-icon"
                            aria-hidden="true"
                          />
                        </span>
                      </SiteButton>
                    ))}
                  </div>
                </div>
              </section>
              <section className="section">
                <div className="wrap">
                  <div className="section-top">
                    <h2 className="section-title">{t("Find your show.")}</h2>
                    <SiteButton className="link" onClick={() => go("store")}>
                      {t("All games")}
                      <ArrowRight
                        className="site-directional-icon"
                        aria-hidden="true"
                        size={15}
                      />
                    </SiteButton>
                  </div>
                  <p className="note">
                    {t(
                      "Complete games, ready to play. Every theme is also available in your editor.",
                    )}
                  </p>
                  <div className="featured-grid">
                    {cards([catalogue[1], catalogue[3], catalogue[8]])}
                  </div>
                </div>
              </section>
              <section className="section section-quiet">
                <div className="wrap">
                  <div className="full-cta">
                    <h3>
                      {t("Something one of a kind?")}
                      <br />
                      {t("We'll make it a show.")}
                    </h3>
                    <SiteButton
                      className="btn btn-primary"
                      onClick={() => go("custom")}
                    >
                      {t("Explore custom shows")}
                      <ArrowRight
                        className="site-directional-icon"
                        aria-hidden="true"
                        size={15}
                      />
                    </SiteButton>
                  </div>
                </div>
              </section>
            </>
          )}
          {view === "store" && (
            <div className="wrap">
              <section className="page-intro">
                <h1 className="h1">
                  {t("Find your")} <span className="accent">{t("show.")}</span>
                </h1>
                <p className="prose">
                  {t(
                    "Explore the collection. Preview anything. Make a show your own.",
                  )}
                </p>
              </section>
              <p className="preview-notice">
                {t(
                  "Complete games, ready to play. Every theme is also available in your editor.",
                )}
              </p>
              <div className="store-tools">
                <div className="filter-row" aria-label={t("Filter games")}>
                  {["All", "Survey", "Trivia", "Story"].map((f) => (
                    <SiteButton
                      key={t(f)}
                      className={`filter-btn ${filter === f ? "active" : ""}`}
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                    >
                      {t(f === "All" ? "All games" : f)}
                    </SiteButton>
                  ))}
                </div>
                <label className="searchbox">
                  <Search />
                  <input
                    type="search"
                    aria-label={t("Search games")}
                    placeholder={t("Search games")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div
                className="catalogue-audience-filter"
                aria-label={t("Filter by audience")}
              >
                {[
                  "All",
                  "Adults",
                  "Children",
                  "Organisations",
                  "Schools",
                  "Families",
                ].map((value) => (
                  <SiteButton
                    key={value}
                    className={`filter-btn ${audience === value ? "active" : ""}`}
                    aria-pressed={audience === value}
                    onClick={() => setAudience(value)}
                  >
                    {t(value === "All" ? "Every audience" : value)}
                  </SiteButton>
                ))}
                <span className="catalogue-count">
                  {t("{{count}} games", { count: visibleGames.length })}
                </span>
              </div>
              <div className="store-grid">
                {cards(visibleGames)}
                {visibleGames.length === 0 && (
                  <p className="empty-results">{t("No games found")}</p>
                )}
              </div>
            </div>
          )}
          {view === "product" && (
            <div className="wrap catalogue-product-page">
              <div className="breadcrumb">
                <SiteButton onClick={() => go("store")}>
                  {t("Games")}
                </SiteButton>
                <ArrowRight
                  className="site-directional-icon"
                  aria-hidden="true"
                  size={15}
                />
                <strong>{t(selected.title)}</strong>
              </div>
              <div className="product-grid">
                <div className="product-preview">
                  <GamePreviewSurface
                    selection={{
                      kind: "published-demo",
                      catalogueId: selected.id,
                    }}
                    label={t("View {{name}}", { name: t(selected.title) })}
                    onOpen={() => openDemo(selected)}
                  >
                    <Cover game={selected} />
                  </GamePreviewSurface>
                </div>
                <div className="product-side">
                  <h1>{t(selected.title)}</h1>
                  <p className="description">{t(selected.desc)}</p>
                  <div className="product-facts">
                    <span>
                      {t("{{range}} min", {
                        range: selected.time.replace(" min", ""),
                      })}
                    </span>
                    <span>{t(selected.category)}</span>
                    <span>
                      {t("{{count}} rounds", { count: selected.questionCount })}
                    </span>
                    <span>{t(selected.themeName)}</span>
                  </div>
                  <p className="product-fineprint">
                    {t("English questions · editable in any language")}
                  </p>
                  <div className="catalogue-product-audience">
                    {selected.audience.map((item) => (
                      <span key={item}>{t(item)}</span>
                    ))}
                  </div>
                  <div className="product-actions">
                    <SiteButton
                      className="btn btn-primary"
                      onClick={() => openDemo(selected)}
                      data-testid="catalogue-play-sample"
                    >
                      <Play />
                      {t("Play this game")}
                    </SiteButton>
                    <SiteButton
                      className="btn btn-outline"
                      disabled={installing !== null}
                      onClick={() => void useGame(selected, "play")}
                      data-testid="catalogue-use-game"
                    >
                      {t(
                        installing === "play"
                          ? "Adding your game…"
                          : "Use this game",
                      )}
                      <ArrowRight
                        className="site-directional-icon"
                        aria-hidden="true"
                      />
                    </SiteButton>
                    <SiteButton
                      className="btn btn-outline"
                      disabled={installing !== null}
                      onClick={() => void useGame(selected, "edit")}
                      data-testid="catalogue-customise"
                    >
                      <Pencil />
                      {t(
                        installing === "edit"
                          ? "Adding your game…"
                          : "Customise a copy",
                      )}
                    </SiteButton>
                    <SiteButton
                      className="btn btn-quiet"
                      onClick={() => openPreview(selected)}
                    >
                      <Play />
                      {t("Preview full show")}
                    </SiteButton>
                  </div>
                  {installError && (
                    <p role="alert" className="catalogue-player-error">
                      {installError}
                    </p>
                  )}
                  <p className="product-fineprint">
                    {t(
                      "Play a free solo sample, or add an editable copy to your Studio and host it with your audience.",
                    )}
                  </p>
                </div>
              </div>
              <div className="product-details">
                <div className="detail-box">
                  <h3>{t("The experience")}</h3>
                  <p>
                    {t(
                      "The host controls the pacing and the big-screen reveal.",
                    )}
                  </p>
                </div>
                <div className="detail-box">
                  <h3>{t("Make it yours")}</h3>
                  <p>
                    {t(
                      "Create your own questions, answers and pictures in the existing editor.",
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
          {(view === "demo" || view === "preview") && (
            <section className="catalogue-viewer-page">
              <div
                className={`catalogue-demo-shell ${view === "preview" ? "catalogue-full-preview" : ""}`}
                data-testid="marketing-native-demo"
              >
                {view === "preview" && (
                  <GamePreviewSurface
                    key={selected.id}
                    selection={{
                      kind: "published-demo",
                      catalogueId: selected.id,
                    }}
                    label={t(selected.title)}
                    initiallyOpen
                    dismissOnOutside={false}
                  >
                    <Cover game={selected} />
                  </GamePreviewSurface>
                )}
                {view === "demo" && selected.id === "great-guessoff" && (
                  <GreatGuessOffDemo onClose={() => open(selected)} />
                )}
                {view === "demo" && selected.id !== "great-guessoff" && (
                  <CatalogueGameDemo
                    key={selected.id}
                    catalogueId={selected.id}
                    onClose={() => open(selected)}
                  />
                )}
              </div>
              <details className="catalogue-viewer-details">
                <summary>{t("The experience")}</summary>
                <p className="prose">
                  {view === "preview"
                    ? demonstration("demo")
                    : t(
                        "Play the rounds, choose your answers and discover the theme in action.",
                      )}
                </p>
                <div className="button-row" style={{ marginTop: 24 }}>
                  <SiteButton
                    className="btn btn-outline"
                    onClick={() => open(selected)}
                  >
                    <ArrowRight
                      className="site-directional-icon"
                      aria-hidden="true"
                      size={16}
                    />
                    {t("View game")}
                  </SiteButton>
                  <SiteButton
                    className="btn btn-primary"
                    onClick={() =>
                      view === "preview"
                        ? openDemo(selected)
                        : void useGame(selected, "play")
                    }
                    disabled={installing !== null}
                  >
                    {t(view === "preview" ? "Play this game" : useGameLabel)}
                    <Play size={16} />
                  </SiteButton>
                  <SiteButton
                    className="btn btn-quiet"
                    onClick={() => go("store")}
                  >
                    {t("Explore games")}
                    <ArrowRight
                      className="site-directional-icon"
                      aria-hidden="true"
                      size={16}
                    />
                  </SiteButton>
                </div>
              </details>
              {installError && (
                <p role="alert" className="catalogue-player-error">
                  {installError}
                </p>
              )}
            </section>
          )}
          {view === "how" && (
            <div className="wrap">
              <section className="page-intro">
                <h1 className="h1">
                  {t("From an idea to")}{" "}
                  <span className="accent">{t("showtime.")}</span>
                </h1>
                <p className="prose">
                  {t("Three simple steps. One unforgettable room.")}
                </p>
              </section>
              <div className="explainer-grid">
                {[
                  [
                    "Pick your game",
                    "Browse ready-made experiences, preview a sample and choose what suits your event.",
                  ],
                  [
                    "Make it yours",
                    "Keep the original, change questions and pictures, or build a new format from scratch.",
                  ],
                  [
                    "Bring it to life",
                    "Set your voting capacity, prepare the projector and launch your live event.",
                  ],
                ].map(([title, copy], i) => (
                  <article className="explain-card" key={t(title)}>
                    <div className="explain-num">0{i + 1}</div>
                    <h3>{t(title)}</h3>
                    <p>{t(copy)}</p>
                  </article>
                ))}
              </div>
              <div className="full-cta">
                <h3>{t("One round tells the whole story.")}</h3>
                <SiteButton
                  className="btn btn-primary"
                  onClick={() => openDemo()}
                >
                  {t("Try the free round")}
                </SiteButton>
              </div>
            </div>
          )}
          {view === "pricing" && <Pricing custom={() => go("custom")} />}
          {view === "custom" && (
            <section className="section wrap">
              <h1 className="h1">
                {t("Something one of a kind?")}
                <br />
                {t("We'll make it a show.")}
              </h1>
              <p className="prose">{t("Tell us your idea.")}</p>
              <ContactForm />
            </section>
          )}
        </main>
        <footer className="site-footer">
          <div className="wrap footer-inner">
            <div className="footer-brand">
              <img src={asset("logo")} alt="Tadazz" />
              <p>{t("The gameshow is yours.")}</p>
            </div>
            <div className="footer-links">{nav}</div>
            <div className="footer-links">
              <SiteButton className="text-btn" onClick={() => openDemo()}>
                {t("Try a round")}
              </SiteButton>
              <SiteLink href="/studio">{t("My Studio")}</SiteLink>
              <LegalPolicyLinks policies={publishedLegalPolicies} />
            </div>
          </div>
          <div className="wrap footer-bottom">
            <span>{t("© 2026 TADAZZ!")}</span>
          </div>
        </footer>
      </ReferenceCanvas>
    </InlineGamePreviewBoundary>
  )
}
