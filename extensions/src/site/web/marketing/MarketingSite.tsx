import marketing from "../../../../site-assets/marketing.css?inline"
import { SiteLink } from "../shared/SiteLink"
import { asset, catalogue, Cover, GameCard, type Game } from "./Catalogue"
import { corrections } from "../../themes/corrections"
import { sitePlatformStyle } from "../../themes/platform"
import { Input, Textarea } from "@razzia/extensions/platform-ui"
import { Pricing } from "./Pricing"
import { GreatGuessOffDemo } from "./GreatGuessOffDemo"
import guessOffStyles from "./great-guessoff.css?inline"
import { SiteButton } from "../shared/SiteButton"
import { useEffect, useState, useMemo } from "react"
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
  House,
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
      ["store", "how", "pricing", "custom", "demo", "product"].includes(
        requested,
      )
      ? requested
      : "home"
  })
  const [selected, setSelected] = useState(() =>
    selectedCatalogueGame(window.location.search),
  )
  const [filter, setFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [menu, setMenu] = useState(false)
  const [notice, setNotice] = useState("")
  const visibleGames = catalogue.filter(
    (game) =>
      (filter === "All" || game.category === filter) &&
      matchesCatalogueSearch(t(game.title), search, language),
  )
  useEffect(() => {
    const onBack = () => {
      const requested = new URLSearchParams(searchString).get("view")
      setView(
        requested &&
          ["store", "how", "pricing", "custom", "demo", "product"].includes(
            requested,
          )
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
    setNotice("")
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
    go("product", game.id)
  }
  const openDemo = (game: Game = catalogue[0]) => {
    setSelected(game)
    go("demo", game.id)
  }
  const demonstration = previewText(previewLocale(i18n))
  const nav = (
    <>
      {[
        ["store", "Games"],
        ["how", "How it works"],
        ["pricing", "Pricing"],
        ["custom", "Custom shows"],
      ].map(([id, label]) => (
        <SiteButton className="text-btn" key={id} onClick={() => go(id)}>
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
        preview={() => openDemo(game)}
      />
    ))

  return (
    <InlineGamePreviewBoundary routeKey={view} provider={previewProvider}>
      <ReferenceCanvas variant="marketing" styles={marketing}>
        <style>{corrections}</style>
        <style>{sitePlatformStyle}</style>
        <style>{guessOffStyles}</style>
        <header className="site-header">
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
                    <ArrowRight size={14} />
                  </SiteLink>
                </>
              )}
              <SiteButton
                className="mobile-menu text-btn"
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
                        <ArrowRight size={15} />
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
                          <ArrowRight />
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
                      <ArrowRight size={15} />
                    </SiteButton>
                  </div>
                  <p className="note">
                    {t(
                      "Illustrative catalogue. Template installation is unavailable.",
                    )}
                  </p>
                  <div className="featured-grid">
                    {cards(catalogue.slice(0, 3))}
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
                      <ArrowRight size={15} />
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
                  "Illustrative catalogue. Template installation is unavailable.",
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
              <div className="store-grid">
                {cards(visibleGames)}
                {visibleGames.length === 0 && (
                  <p className="empty-results">{t("No games found")}</p>
                )}
              </div>
            </div>
          )}
          {view === "product" && (
            <div className="wrap">
              <div className="breadcrumb">
                <SiteButton onClick={() => go("store")}>
                  {t("Games")}
                </SiteButton>
                <ArrowRight size={15} />
                <strong>{t(selected.title)}</strong>
              </div>
              <div className="product-grid">
                <div className="product-preview">
                  <Cover game={selected} />
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
                    <span>{t("Flexible capacity")}</span>
                  </div>
                  <div className="product-actions">
                    <SiteButton className="btn btn-primary" disabled>
                      {t("Use this game")}
                      <ArrowRight />
                    </SiteButton>
                    <SiteButton className="btn btn-outline" disabled>
                      {t("Customise a copy")}
                    </SiteButton>
                    <SiteButton
                      className="btn btn-quiet"
                      onClick={() => openDemo(selected)}
                    >
                      <Play />
                      {t("Preview")}
                    </SiteButton>
                  </div>
                  <p className="product-fineprint">
                    {t(
                      "Illustrative catalogue. Template installation is unavailable.",
                    )}
                  </p>
                </div>
              </div>
              <div className="product-details">
                <div className="detail-box">
                  <h3>{t("The experience")}</h3>
                  <p>
                    {t(selected.desc)}{" "}
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
          {view === "demo" && (
            <section className="section wrap">
              <div className="eyebrow">
                {t("TRY A ROUND · INTERACTIVE SAMPLE")}
              </div>
              <h1 className="h1">{t(selected.title)}</h1>
              <p className="prose">
                {selected.id === "great-guessoff"
                  ? "Play the five-round interactive sample. Voting percentages and other players are illustrative demo data."
                  : demonstration("demo")}
              </p>
              <div
                className="demo-stage marketing-native-demo"
                data-testid="marketing-native-demo"
                style={{ padding: 0, overflow: "hidden", position: "relative" }}
              >
                <style>
                  {
                    ".marketing-native-demo{aspect-ratio:16/9}.marketing-native-demo>.game-preview-surface,.marketing-native-demo .game-preview-poster,.marketing-native-demo .game-cover{width:100%;height:100%}@media(max-width:640px){.marketing-native-demo{aspect-ratio:3/4}}"
                  }
                </style>
                {selected.id === "great-guessoff" ? (
                  <GreatGuessOffDemo />
                ) : (
                  <GamePreviewSurface
                    selection={{
                      kind: "published-demo",
                      catalogueId: selected.id,
                    }}
                    label={t("Preview")}
                    initiallyOpen
                  >
                    <Cover game={selected} />
                  </GamePreviewSurface>
                )}
              </div>
              <div className="button-row" style={{ marginTop: 24 }}>
                <SiteButton
                  className="btn btn-outline"
                  onClick={() => go("home")}
                >
                  <House size={16} />
                  {t("Back to home")}
                </SiteButton>
                <SiteButton
                  className="btn btn-primary"
                  onClick={() => go("store")}
                >
                  {t("Explore games")}
                  <ArrowRight size={16} />
                </SiteButton>
              </div>
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
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setNotice(
                    "Enquiry not sent. Contact service is not connected in this preview.",
                  )
                }}
                className="site-contact-form"
              >
                <Input
                  label={t("Event type")}
                  name="eventType"
                  required
                  maxLength={160}
                  placeholder={t("What are you celebrating or hosting?")}
                />
                <Input
                  label={t("Email address")}
                  name="email"
                  required
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                />
                <Textarea
                  label={t("About your event")}
                  name="message"
                  rows={5}
                  maxLength={4000}
                />
                <SiteButton disabled variant="primary">
                  {t("Contact service unavailable")}
                </SiteButton>
                <p className="note">
                  {t("This form does not send a message.")}
                </p>
              </form>
            </section>
          )}
          {notice && (
            <p className="wrap preview-notice" role="status">
              {t(notice)}
            </p>
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
            </div>
          </div>
          <div className="wrap footer-bottom">
            <span>{t("© 2026 TADAZZ!")}</span>
            <span>{t("Catalogue examples · Purchases unavailable.")}</span>
          </div>
        </footer>
      </ReferenceCanvas>
    </InlineGamePreviewBoundary>
  )
}
