import marketing from "../../../../site-assets/marketing.css?inline"
import { SiteLink } from "../shared/SiteLink"
import { asset, catalogue, Cover, GameCard, type Game } from "./Catalogue"
import { corrections } from "../../themes/corrections"
import { Pricing } from "./Pricing"
import { SiteButton } from "../shared/SiteButton"
import { useEffect, useState } from "react"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { siteText as t, useSiteText } from "../../locales"
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

export function MarketingSite() {
  useSiteText()
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
  const [selected, setSelected] = useState(
    () =>
      catalogue.find(
        (game) =>
          game.id === new URLSearchParams(window.location.search).get("game"),
      ) ?? catalogue[0],
  )
  const [filter, setFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [menu, setMenu] = useState(false)
  const [choice, setChoice] = useState<string | null>(null)
  const [showSampleResults, setShowSampleResults] = useState(false)
  const [notice, setNotice] = useState("")
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
      setSelected(
        catalogue.find(
          (game) => game.id === new URLSearchParams(searchString).get("game"),
        ) ?? catalogue[0],
      )
      window.scrollTo(0, 0)
    }
    onBack()
  }, [searchString])

  const go = (page: string, gameId?: string) => {
    setView(page)
    setMenu(false)
    setNotice("")
    setChoice(null)
    setShowSampleResults(false)
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
        preview={() => {
          setSelected(game)
          go("demo")
        }}
      />
    ))

  return (
    <ReferenceCanvas variant="marketing" styles={marketing}>
      <style>{corrections}</style>
      <header className="site-header">
        <div className="wide header-inner">
          <SiteLink className="brand" href="/">
            <img src={asset("logo")} alt="TADAZZ!" />
          </SiteLink>
          <nav className="header-links" aria-label={t("Main navigation")}>
            {nav}
          </nav>
          <div className="header-actions">
            <SiteButton
              className="text-btn header-demo"
              onClick={() => go("demo")}
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
          <nav className="wrap mobile-nav" aria-label={t("Mobile navigation")}>
            {nav}
            <SiteButton className="text-btn" onClick={() => go("demo")}>
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
                      onClick={() => go("demo")}
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
                    ["Start fresh", "Build a show that's all your own.", Plus],
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
                      <h3 className="route-name">{String(title)}</h3>
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
              {cards(
                catalogue.filter(
                  (g) =>
                    (filter === "All" || g.category === filter) &&
                    t(g.title)
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()),
                ),
              )}
              {!catalogue.some(
                (g) =>
                  (filter === "All" || g.category === filter) &&
                  g.title.toLowerCase().includes(search.toLowerCase()),
              ) && <p className="empty-results">{t("No games found")}</p>}
            </div>
          </div>
        )}
        {view === "product" && (
          <div className="wrap">
            <div className="breadcrumb">
              <SiteButton onClick={() => go("store")}>{t("Games")}</SiteButton>
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
                    onClick={() => go("demo")}
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
                  {t("The host controls the pacing and the big-screen reveal.")}
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
            <h1 className="h1">{t("Which twist would change everything?")}</h1>
            <p className="prose">
              {t(
                "Choose an answer and reveal the results. This is a design demo, not a live audience vote.",
              )}
            </p>
            <div className="demo-stage">
              <img src={asset("logo")} alt="TADAZZ!" style={{ width: 180 }} />
              {!showSampleResults ? (
                <div
                  className="button-row"
                  role="group"
                  aria-label={t("Choose an answer")}
                >
                  {[
                    "A secret",
                    "An unexpected guest",
                    "A wrong turn",
                    "A lost letter",
                    "A ticking clock",
                  ].map((answer) => (
                    <SiteButton
                      className={`btn ${choice === answer ? "btn-primary" : "btn-outline"}`}
                      key={t(answer)}
                      onClick={() => setChoice(answer)}
                      aria-pressed={choice === answer}
                    >
                      {t(answer)}
                    </SiteButton>
                  ))}
                </div>
              ) : (
                <section
                  className="sample-results"
                  aria-label={t("Illustrative voting results")}
                >
                  <h2 style={{ fontSize: 26, margin: "24px 0 4px" }}>
                    {t("The big reveal!")}
                  </h2>
                  <p style={{ color: "#c5b0dc", margin: "0 0 20px" }}>
                    {t(
                      "Illustrative results only — these percentages are not real votes.",
                    )}
                  </p>
                  {[
                    ["A secret", 42],
                    ["An unexpected guest", 24],
                    ["A wrong turn", 18],
                    ["A lost letter", 11],
                    ["A ticking clock", 5],
                  ].map(([label, share]) => (
                    <div key={t(String(label))}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          fontWeight: 650,
                        }}
                      >
                        <span>{t(String(label))}</span>
                        <span>{share}%</span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          background: "#332047",
                          borderRadius: 20,
                          overflow: "hidden",
                          margin: "7px 0 14px",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${share}%`,
                            background:
                              String(label) === choice ? "#e7ff37" : "#9567d4",
                            borderRadius: 20,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <p style={{ color: "#e7ff37", fontWeight: 800 }}>
                    {choice === "A secret"
                      ? t("You picked the crowd's favourite!")
                      : t("You chose {{choice}}. Try a different answer!", {
                          choice: t(choice ?? ""),
                        })}
                  </p>
                </section>
              )}
              {!showSampleResults && (
                <p role="status">
                  {choice
                    ? t(
                        "Your choice is in! {{choice}}. Reveal the example results.",
                        { choice: t(choice) },
                      )
                    : t("Pick one to continue")}
                </p>
              )}
              {choice && !showSampleResults && (
                <SiteButton
                  className="btn btn-primary"
                  onClick={() => setShowSampleResults(true)}
                >
                  {t("Reveal sample results")}
                  <ArrowRight size={17} />
                </SiteButton>
              )}
            </div>
            <div className="button-row" style={{ marginTop: 24 }}>
              <SiteButton
                className="btn btn-outline"
                onClick={() => {
                  setChoice(null)
                  setShowSampleResults(false)
                }}
              >
                {t("Try again")}
              </SiteButton>
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
                onClick={() => go("demo")}
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
              style={{ display: "grid", gap: 16, maxWidth: 600 }}
            >
              <label>
                {t("Event type")}
                <input
                  required
                  placeholder={t("What are you celebrating or hosting?")}
                  style={{ display: "block", width: "100%" }}
                />
              </label>
              <label>
                {t("Email address")}
                <input
                  required
                  type="email"
                  style={{ display: "block", width: "100%" }}
                />
              </label>
              <label>
                {t("About your event")}
                <textarea
                  rows={4}
                  style={{ display: "block", width: "100%" }}
                />
              </label>
              <SiteButton disabled className="btn btn-primary">
                {t("Contact service unavailable")}
              </SiteButton>
              <p className="note">{t("This form does not send a message.")}</p>
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
            <img src={asset("logo")} alt="TADAZZ!" />
            <p>{t("The gameshow is yours.")}</p>
          </div>
          <div className="footer-links">{nav}</div>
          <div className="footer-links">
            <SiteButton className="text-btn" onClick={() => go("demo")}>
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
  )
}
