import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { SESSION_ROLES } from "@razzia/common/constants"
import { quizzListQuery } from "@razzia/web/features/manager/queries"
import { clearToken, getRole, getToken } from "@razzia/web/lib/session"
import { ReferenceCanvas } from "./ReferenceCanvas"
import { HoverDevTiltCard } from "./components/HoverDevTiltCard"
import { BorderBeam } from "./components/MagicBorderBeam"
import {
  ArrowRight,
  Play,
  Plus,
  Pencil,
  Clapperboard,
  Menu,
  Search,
  HelpCircle,
  House,
  List,
  Store,
  CalendarDays,
  Settings2,
} from "lucide-react"

// Local TADAZZ React implementation of the supplied frozen prototypes.
const asset = (name: string) =>
  `/tadazz-design-reference/marketing-${name}.webp`
// Preview runs on a separate hostname: editing is intentionally kept in the
// existing production editor, without proxying write APIs through preview.
const liveEditor = (path: string) =>
  `${window.location.hostname === "tadazz.com" ? "" : "https://tadazz.com"}${path}`

const catalogue = [
  {
    id: "crowd",
    title: "The Crowd Decides",
    category: "Survey",
    time: "25–40 min",
    desc: "Five possibilities. One room full of opinions. Discover what everyone really thinks.",
    visual: "orb",
    gradient:
      "radial-gradient(circle at 70% 20%,#b737ef,#542197 48%,#13103b 100%)",
  },
  {
    id: "quiz",
    title: "The Big Quiz",
    category: "Trivia",
    time: "30–60 min",
    desc: "A polished, high-stakes quiz night with dramatic reveals and a grand leaderboard.",
    visual: "z",
    gradient: "linear-gradient(135deg,#0d295a,#3427a0 45%,#901dae)",
  },
  {
    id: "story",
    title: "Story Sparks",
    category: "Story",
    time: "25–40 min",
    desc: "Every choice shapes a new story. A room full of ideas becomes a show.",
    visual: "rings",
    gradient: "linear-gradient(135deg,#361351,#83246b 53%,#19113d)",
  },
  {
    id: "picture",
    title: "Picture Perfect",
    category: "Trivia",
    time: "20–40 min",
    desc: "A picture-led game filled with quick choices and delightful surprises.",
    visual: "cards",
    gradient: "linear-gradient(135deg,#0a3c72,#2d2f85 49%,#b72faa)",
  },
  {
    id: "truth",
    title: "Fact or Fiction",
    category: "Trivia",
    time: "20–40 min",
    desc: "Unexpected facts, bold guesses and the reveal everyone is waiting for.",
    visual: "glyph",
    gradient: "linear-gradient(135deg,#632496,#ce4c86 53%,#3c114f)",
  },
  {
    id: "finale",
    title: "The Grand Finale",
    category: "Survey",
    time: "15–30 min",
    desc: "A dramatic team showdown made for one unforgettable final moment.",
    visual: "z",
    gradient: "linear-gradient(125deg,#092358,#29248d 40%,#bb35d9)",
  },
]
type Game = (typeof catalogue)[number]
function Cover({ game }: { game: Game }) {
  const v = game.visual
  const cls =
    (
      { rings: "story", cards: "picture", glyph: "truth" } as Record<
        string,
        string
      >
    )[v] ?? v

  return (
    <div className={`game-cover cover-modern cover-${cls}`}>
      <div
        className="cover-bg"
        style={{
          backgroundImage: `url('${asset(v === "orb" || v === "z" ? "stage" : "questions")}')`,
          opacity: v === "z" ? 0.72 : 0.62,
        }}
      />
      <div className="cover-design">
        {v === "z" && (
          <>
            <img className="cover-z z-blue" src={asset("zb")} alt="" />
            <img className="cover-z z-lime" src={asset("zl")} alt="" />
          </>
        )}
        {(v === "rings" || v === "orb") && (
          <>
            <div className="cover-rings" />
            <div className="cover-orb" />
          </>
        )}
        {v === "cards" && (
          <div className="cover-glowcards">
            {[20, -2, 13, -9, 19].map((y, i) => (
              <div
                key={i}
                style={{
                  transform: `translateY(${y}px) rotate(${[-10, 5, -2, 9, -8][i]}deg)`,
                }}
              />
            ))}
          </div>
        )}
        {v === "glyph" && (
          <>
            <div className="big-glyph">?</div>
            <div className="cover-streak" />
          </>
        )}
      </div>
      {v === "z" && (
        <img className="cover-brand-small" src={asset("logo")} alt="" />
      )}
      <span className="cover-kicker">{game.category}</span>
      <div className="cover-title">{game.title}</div>
    </div>
  )
}
function GameCard({
  game,
  open,
  preview,
}: {
  game: Game
  open: () => void
  preview: () => void
}) {
  return (
    <HoverDevTiltCard>
      <button
        onClick={open}
        style={{
          padding: 0,
          border: 0,
          width: "100%",
          textAlign: "left",
          color: "inherit",
        }}
        aria-label={`View ${game.title}`}
      >
        <Cover game={game} />
      </button>
      <div className="game-card-body">
        <h3>{game.title}</h3>
        <p>{game.desc}</p>
        <div className="game-meta">
          {game.category} · {game.time}
        </div>
        <div className="game-actions">
          <button className="link muted" onClick={preview}>
            <Play size={15} /> Preview
          </button>
          <button className="link" onClick={open}>
            View game <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </HoverDevTiltCard>
  )
}
const corrections = ` .magic-source-beam{position:absolute;inset:0;pointer-events:none;z-index:8;border:1px solid transparent;border-radius:inherit;mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000);mask-clip:padding-box,border-box;mask-composite:intersect}.magic-source-beam-inner{position:absolute;aspect-ratio:1;background:linear-gradient(to left,var(--color-from),var(--color-to),transparent);opacity:.65}:host{display:block;background:var(--bg);color:var(--white,var(--text));font:15px/1.5 var(--font)} svg{vertical-align:middle;flex-shrink:0}button{font-family:inherit}button,a{touch-action:manipulation} .preview-notice{padding:12px 20px;border:1px solid var(--stroke,var(--line));border-radius:12px;color:var(--muted)} @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`

export function MarketingPreview() {
  const [view, setView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("view")

    return requested &&
      ["store", "how", "pricing", "custom", "demo"].includes(requested)
      ? requested
      : "home"
  })
  const [selected, setSelected] = useState(catalogue[0])
  const [filter, setFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [menu, setMenu] = useState(false)
  const [choice, setChoice] = useState<string | null>(null)
  const [showSampleResults, setShowSampleResults] = useState(false)
  const [notice, setNotice] = useState("")
  useEffect(() => {
    const onBack = () => {
      const requested = new URLSearchParams(window.location.search).get("view")
      setView(
        requested &&
          ["store", "how", "pricing", "custom", "demo"].includes(requested)
          ? requested
          : "home",
      )
      window.scrollTo(0, 0)
    }
    window.addEventListener("popstate", onBack)

    return () => window.removeEventListener("popstate", onBack)
  }, [])

  const go = (page: string) => {
    setView(page)
    setMenu(false)
    setNotice("")
    setChoice(null)
    setShowSampleResults(false)
    window.history.pushState(
      null,
      "",
      page === "home" ? "/site" : `/site?view=${encodeURIComponent(page)}`,
    )
    window.scrollTo(0, 0)
  }
  const open = (game: Game) => {
    setSelected(game)
    go("product")
  }
  const nav = (
    <>
      {[
        ["store", "Games"],
        ["how", "How it works"],
        ["pricing", "Pricing"],
        ["custom", "Custom shows"],
      ].map(([id, label]) => (
        <button className="text-btn" key={id} onClick={() => go(id)}>
          {label}
        </button>
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
    <ReferenceCanvas variant="marketing">
      <style>{corrections}</style>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="brand" href="/site">
            <img src={asset("logo")} alt="TADAZZ!" />
          </a>
          <nav className="header-links" aria-label="Main navigation">
            {nav}
          </nav>
          <div className="header-actions">
            <button className="text-btn header-demo" onClick={() => go("demo")}>
              <Play size={14} /> Try a round
            </button>
            {getRole() === SESSION_ROLES.MANAGER ? (
              <a className="text-btn" href="/site/studio">
                My Studio
              </a>
            ) : (
              <>
                <a className="text-btn" href="/site/login">
                  Log in
                </a>
                <a className="btn btn-outline" href="/site/signup">
                  Sign up <ArrowRight size={14} />
                </a>
              </>
            )}
            <button
              className="mobile-menu text-btn"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
          </div>
        </div>
        {menu && (
          <nav className="wrap mobile-nav" aria-label="Mobile navigation">
            {nav}
            <button className="text-btn" onClick={() => go("demo")}>
              Try a round
            </button>
            {getRole() === SESSION_ROLES.MANAGER ? (
              <a className="text-btn" href="/site/studio">
                My Studio
              </a>
            ) : (
              <>
                <a className="text-btn" href="/site/login">
                  Log in
                </a>
                <a className="btn btn-primary" href="/site/signup">
                  Create an account
                </a>
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
                    Make it a<br />
                    <span>show.</span>
                  </h1>
                  <p className="subhead">
                    Your event, transformed into a gameshow. Choose a ready-made
                    experience or make one your own.
                  </p>
                  <div className="button-row cinema-buttons">
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={() => go("demo")}
                    >
                      <Play size={15} /> Try a round
                    </button>
                    <button
                      className="btn btn-outline btn-lg"
                      onClick={() => go("store")}
                    >
                      Explore games <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
                <div
                  className="cinema-stage"
                  role="img"
                  aria-label="The TADAZZ theatrical stage and interlocking blue and lime Zs"
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
                    It's your <em>moment.</em>
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
                  <h2 className="section-title">How will you play?</h2>
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
                    <button
                      className="route-card"
                      key={String(title)}
                      onClick={() =>
                        i === 2
                          ? window.location.assign("/manager/quizz")
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
                      <p>{String(description)}</p>
                      <span className="route-arrow">
                        <ArrowRight />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <section className="section">
              <div className="wrap">
                <div className="section-top">
                  <h2 className="section-title">Find your show.</h2>
                  <button className="link" onClick={() => go("store")}>
                    All games <ArrowRight size={15} />
                  </button>
                </div>
                <div className="featured-grid">
                  {cards(catalogue.slice(0, 3))}
                </div>
              </div>
            </section>
            <section className="section section-quiet">
              <div className="wrap">
                <div className="full-cta">
                  <h3>
                    Something one of a kind?
                    <br />
                    We'll make it a show.
                  </h3>
                  <button
                    className="btn btn-primary"
                    onClick={() => go("custom")}
                  >
                    Explore custom shows <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
        {view === "store" && (
          <div className="wrap">
            <section className="page-intro">
              <h1 className="h1">
                Find your <span className="accent">show.</span>
              </h1>
              <p className="prose">
                Explore the collection. Preview anything. Make a show your own.
              </p>
            </section>
            <div className="store-tools">
              <div className="filter-row" aria-label="Filter games">
                {["All", "Survey", "Trivia", "Story"].map((f) => (
                  <button
                    key={f}
                    className={`filter-btn ${filter === f ? "active" : ""}`}
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {f === "All" ? "All games" : f}
                  </button>
                ))}
              </div>
              <label className="searchbox">
                <Search />
                <input
                  type="search"
                  aria-label="Search games"
                  placeholder="Search games"
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
                    g.title.toLowerCase().includes(search.toLowerCase()),
                ),
              )}
              {!catalogue.some(
                (g) =>
                  (filter === "All" || g.category === filter) &&
                  g.title.toLowerCase().includes(search.toLowerCase()),
              ) && <p className="empty-results">No games found</p>}
            </div>
          </div>
        )}
        {view === "product" && (
          <div className="wrap">
            <div className="breadcrumb">
              <button onClick={() => go("store")}>Games</button>
              <ArrowRight size={15} />
              <strong>{selected.title}</strong>
            </div>
            <div className="product-grid">
              <div className="product-preview">
                <Cover game={selected} />
              </div>
              <div className="product-side">
                <h1>{selected.title}</h1>
                <p className="description">{selected.desc}</p>
                <div className="product-facts">
                  <span>{selected.time}</span>
                  <span>{selected.category}</span>
                  <span>Flexible capacity</span>
                </div>
                <div className="product-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      setNotice(
                        "Template copying is not connected. Create your own game in My Studio.",
                      )
                    }
                  >
                    Use this game <ArrowRight />
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() =>
                      setNotice(
                        "Template copying is not connected. Create your own game in My Studio.",
                      )
                    }
                  >
                    Customise a copy
                  </button>
                  <button className="btn btn-quiet" onClick={() => go("demo")}>
                    <Play /> Preview
                  </button>
                </div>
                <p className="product-fineprint">
                  Preview free. A licence is needed to host a live event.
                </p>
              </div>
            </div>
            <div className="product-details">
              <div className="detail-box">
                <h3>The experience</h3>
                <p>
                  {selected.desc} The host controls the pacing and the
                  big-screen reveal.
                </p>
              </div>
              <div className="detail-box">
                <h3>Make it yours</h3>
                <p>
                  Change questions, answers and pictures. Pro adds brand
                  colours, music and custom stage styling.
                </p>
              </div>
            </div>
          </div>
        )}
        {view === "demo" && (
          <section className="section wrap">
            <div className="eyebrow">TRY A ROUND · INTERACTIVE SAMPLE</div>
            <h1 className="h1">Which twist would change everything?</h1>
            <p className="prose">
              Choose an answer and reveal the results. This is a design demo,
              not a live audience vote.
            </p>
            <div className="demo-stage">
              <img src={asset("logo")} alt="TADAZZ!" style={{ width: 180 }} />
              {!showSampleResults ? (
                <div
                  className="button-row"
                  role="group"
                  aria-label="Choose an answer"
                >
                  {[
                    "A secret",
                    "An unexpected guest",
                    "A wrong turn",
                    "A lost letter",
                    "A ticking clock",
                  ].map((answer) => (
                    <button
                      className={`btn ${choice === answer ? "btn-primary" : "btn-outline"}`}
                      key={answer}
                      onClick={() => setChoice(answer)}
                      aria-pressed={choice === answer}
                    >
                      {answer}
                    </button>
                  ))}
                </div>
              ) : (
                <section
                  className="sample-results"
                  aria-label="Illustrative voting results"
                >
                  <h2 style={{ fontSize: 26, margin: "24px 0 4px" }}>
                    The big reveal!
                  </h2>
                  <p style={{ color: "#c5b0dc", margin: "0 0 20px" }}>
                    Illustrative results only — these percentages are not real
                    votes.
                  </p>
                  {[
                    ["A secret", 42],
                    ["An unexpected guest", 24],
                    ["A wrong turn", 18],
                    ["A lost letter", 11],
                    ["A ticking clock", 5],
                  ].map(([label, share]) => (
                    <div key={label}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          fontWeight: 650,
                        }}
                      >
                        <span>{label}</span>
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
                              label === choice ? "#e7ff37" : "#9567d4",
                            borderRadius: 20,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <p style={{ color: "#e7ff37", fontWeight: 800 }}>
                    {choice === "A secret"
                      ? "You picked the crowd's favourite!"
                      : `You chose ${choice}. Try a different answer!`}
                  </p>
                </section>
              )}
              {!showSampleResults && (
                <p role="status">
                  {choice
                    ? `Your choice is in! ${choice}. Reveal the example results.`
                    : "Pick one to continue"}
                </p>
              )}
              {choice && !showSampleResults && (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowSampleResults(true)}
                >
                  Reveal sample results <ArrowRight size={17} />
                </button>
              )}
            </div>
            <div className="button-row" style={{ marginTop: 24 }}>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setChoice(null)
                  setShowSampleResults(false)
                }}
              >
                Try again
              </button>
              <button className="btn btn-outline" onClick={() => go("home")}>
                <House size={16} /> Back to home
              </button>
              <button className="btn btn-primary" onClick={() => go("store")}>
                Explore games <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}
        {view === "how" && (
          <div className="wrap">
            <section className="page-intro">
              <h1 className="h1">
                From an idea to <span className="accent">showtime.</span>
              </h1>
              <p className="prose">
                Three simple steps. One unforgettable room.
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
                <article className="explain-card" key={title}>
                  <div className="explain-num">0{i + 1}</div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
            <div className="full-cta">
              <h3>One round tells the whole story.</h3>
              <button className="btn btn-primary" onClick={() => go("demo")}>
                Try the free round
              </button>
            </div>
          </div>
        )}
        {view === "pricing" && (
          <section className="section wrap">
            <h1 className="h1">Your event. Your capacity.</h1>
            <p className="prose">
              Event licences and capacity pricing are not connected in this
              preview. No payment is taken.
            </p>
            <a className="btn btn-outline" href="/site/studio">
              Account & licences
            </a>
          </section>
        )}
        {view === "custom" && (
          <section className="section wrap">
            <h1 className="h1">
              Something one of a kind?
              <br />
              We'll make it a show.
            </h1>
            <p className="prose">Tell us your idea.</p>
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
                Event type
                <input
                  required
                  placeholder="What are you celebrating or hosting?"
                  style={{ display: "block", width: "100%" }}
                />
              </label>
              <label>
                Email address
                <input
                  required
                  type="email"
                  style={{ display: "block", width: "100%" }}
                />
              </label>
              <label>
                About your event
                <textarea
                  rows={4}
                  style={{ display: "block", width: "100%" }}
                />
              </label>
              <button className="btn btn-primary">
                Preview enquiry submission
              </button>
              <p className="note">This form does not send a message.</p>
            </form>
          </section>
        )}
        {notice && (
          <p className="wrap preview-notice" role="status">
            {notice}
          </p>
        )}
      </main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <div className="footer-brand">
            <img src={asset("logo")} alt="TADAZZ!" />
            <p>The gameshow is yours.</p>
          </div>
          <div className="footer-links">{nav}</div>
          <div className="footer-links">
            <button className="text-btn" onClick={() => go("demo")}>
              Try a round
            </button>
            <a href="/site/studio">My Studio</a>
          </div>
        </div>
        <div className="wrap footer-bottom">
          <span>© 2026 TADAZZ!</span>
          <span>
            Design preview · Catalogue examples · No purchases or live calls
            connected.
          </span>
        </div>
      </footer>
    </ReferenceCanvas>
  )
}

export function StudioPreview() {
  const [view, setView] = useState("dashboard")
  const [search, setSearch] = useState("")
  const [menu, setMenu] = useState(false)
  const manager = getRole() === SESSION_ROLES.MANAGER
  const [loggingOut, setLoggingOut] = useState(false)
  const query = useQuery({ ...quizzListQuery(), enabled: manager })

  const logout = async () => {
    if (loggingOut) {
      return
    }

    setLoggingOut(true)

    const token = getToken()

    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
      } catch {
        // Clearing the local credential is required even on network failure.
      }
    }

    clearToken()
    window.location.assign("/site")
  }
  const games = query.data?.quizz ?? []
  const filtered = games.filter((g) =>
    g.subject.toLowerCase().includes(search.toLowerCase()),
  )
  const navigation = [
    ["dashboard", "Dashboard"],
    ["games", "My Games"],
    ["store", "Explore Games"],
    ["events", "My Events"],
    ["account", "Account & licences"],
  ]

  const resumeLink = () => {
    if (!manager) {
      return "/site/login"
    }

    if (games.length > 0) {
      return liveEditor(`/manager/quizz/${encodeURIComponent(games[0].id)}`)
    }

    return liveEditor("/manager/quizz")
  }

  const newGame = (
    <a
      className="btn primary"
      href={manager ? liveEditor("/manager/quizz") : "/site/login"}
    >
      <Plus size={16} /> {manager ? "Create game" : "Sign in to create"}
    </a>
  )
  const gameList = (
    <>
      {!manager && (
        <div className="empty">
          <h3>Sign in to see your games</h3>
          <a className="btn primary" href="/site/login">
            Sign in
          </a>
          <a className="btn ghost" href="/site/signup">
            Create an account
          </a>
        </div>
      )}
      {manager && query.isPending && <p role="status">Loading your games…</p>}
      {manager && query.isError && (
        <div className="empty" role="alert">
          <h3>Could not load your games</h3>
          <button className="btn ghost" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      )}
      {manager && query.isSuccess && (
        <div className="games-grid">
          {(view === "dashboard" ? filtered.slice(0, 3) : filtered).map((g) => (
            <article className="game-card" key={g.id}>
              <img
                src={asset("stage")}
                alt=""
                style={{
                  width: "100%",
                  aspectRatio: "16/9",
                  objectFit: "cover",
                }}
              />
              <div className="game-card-body" style={{ padding: 20 }}>
                <h3 className="game-title">{g.subject}</h3>
                <a
                  className="btn ghost"
                  href={liveEditor(
                    `/manager/quizz/${encodeURIComponent(g.id)}`,
                  )}
                >
                  <Pencil size={16} /> Edit game
                </a>
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="empty">
              <h3>{search ? "No games found" : "Your shows start here."}</h3>
            </div>
          )}
          <a className="game-card new-card" href={liveEditor("/manager/quizz")}>
            <div className="newicon">
              <Plus size={29} />
            </div>
            <h3>Create a game</h3>
          </a>
        </div>
      )}
    </>
  )

  return (
    <ReferenceCanvas variant="studio">
      <style>{corrections}</style>
      <div className="workspace">
        <aside
          className={`sidebar ${menu ? "open" : ""}`}
          aria-label="Studio navigation"
        >
          <a className="side-brand" href="/site">
            <img src={asset("logo")} alt="TADAZZ!" />
          </a>
          <nav className="side-nav">
            {navigation.map(([id, title]) => (
              <button
                key={id}
                className={`nav-btn ${view === id ? "active" : ""}`}
                onClick={() => {
                  setView(id)
                  setMenu(false)
                  setSearch("")
                }}
              >
                {id === "dashboard" && <House size={18} />}
                {id === "games" && <List size={18} />}
                {id === "store" && <Store size={18} />}
                {id === "events" && <CalendarDays size={18} />}
                {id === "account" && <Settings2 size={18} />}
                {title}
              </button>
            ))}
          </nav>
          <div className="side-bottom">
            <button className="side-account" onClick={() => setView("account")}>
              <span className="avatar">YOU</span>
              <span className="who">My account</span>
            </button>
            {manager ? (
              <button
                className="side-account"
                onClick={() => void logout()}
                disabled={loggingOut}
              >
                <span className="who">
                  {loggingOut ? "Signing out..." : "Sign out"}
                </span>
              </button>
            ) : (
              <a className="side-account" href="/site/login">
                <span className="who">Log in / Create account</span>
              </a>
            )}
          </div>
        </aside>
        {menu && (
          <button
            className="sidebar-shade"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
        )}
        <div className="main">
          <header className="topbar">
            <div className="top-left">
              <button
                className="circle-btn mobile-menu"
                onClick={() => setMenu(!menu)}
                aria-label="Toggle navigation"
                aria-expanded={menu}
              >
                <Menu />
              </button>
              <strong>
                {navigation.find(([id]) => id === view)?.[1] ??
                  "Show Preparation"}
              </strong>
            </div>
            <div className="top-actions">
              <label className="search-mini">
                <Search size={16} />
                <input
                  placeholder="Search games"
                  aria-label="Search your games"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setView("games")
                  }}
                />
              </label>
              <button
                className="circle-btn help-btn"
                aria-label="Help"
                onClick={() => setView("help")}
              >
                <HelpCircle />
              </button>
              {newGame}
              <button
                className="top-avatar"
                aria-label="Your account"
                onClick={() => setView("account")}
              >
                <span className="avatar">YOU</span>
              </button>
            </div>
          </header>
          <main className="content page-enter">
            {view === "dashboard" && (
              <>
                <section className="welcome">
                  <span className="hero-orbit orbit-a" aria-hidden="true" />
                  <span className="hero-orbit orbit-b" aria-hidden="true" />
                  <div className="welcome-copy">
                    <h1>
                      Your <em>shows.</em>
                    </h1>
                    <button
                      className="hero-explore"
                      onClick={() => setView("store")}
                    >
                      Explore games <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="welcome-art" aria-hidden="true">
                    <div className="zz-floor" />
                    <img className="blue" src={asset("zb")} alt="" />
                    <img className="lime" src={asset("zl")} alt="" />
                  </div>
                </section>
                <section className="spotlight-grid">
                  <article className="spotlight editing">
                    <div className="thumb">
                      <img src={asset("stage")} alt="" />
                    </div>
                    <div className="spotlight-info">
                      <h3>{games[0]?.subject ?? "Your next game"}</h3>
                      <p>
                        {games.length
                          ? "Pick up where you left off"
                          : "Start your next creation"}
                      </p>
                      <a className="spotlight-action" href={resumeLink()}>
                        {games.length ? "Continue editing" : "Create game"}{" "}
                        <ArrowRight size={16} />
                      </a>
                    </div>
                  </article>
                </section>
                <section className="section games-section">
                  <div className="section-head">
                    <h2>My games</h2>
                    <button
                      className="text-link"
                      onClick={() => setView("games")}
                    >
                      View all <ArrowRight size={16} />
                    </button>
                  </div>
                  {gameList}
                </section>
              </>
            )}
            {view === "games" && (
              <>
                <div className="pagehead">
                  <h1>My games</h1>
                </div>
                <div className="list-toolbar">
                  <div className="tabset">
                    <button className="active">All games</button>
                  </div>
                  <label className="searchfield">
                    <Search size={16} />
                    <input
                      placeholder="Search my games"
                      aria-label="Search my games"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                {gameList}
              </>
            )}
            {view === "store" && (
              <>
                <div className="pagehead">
                  <h1>Explore games</h1>
                </div>
                <p className="muted">
                  Preview the collection on the new site. Template copying is
                  not connected.
                </p>
                <div className="games-grid">
                  {catalogue.map((game) => (
                    <article className="game-card" key={game.id}>
                      <img
                        src={asset(game.id === "story" ? "worlds" : "stage")}
                        alt=""
                        style={{
                          width: "100%",
                          aspectRatio: "16/9",
                          objectFit: "cover",
                        }}
                      />
                      <div style={{ padding: 20 }}>
                        <h3>{game.title}</h3>
                        <p>{game.desc}</p>
                        <a className="btn ghost" href="/site">
                          Explore collection <ArrowRight size={16} />
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            {view === "events" && (
              <>
                <div className="pagehead">
                  <h1>My events</h1>
                </div>
                <div className="empty">
                  <h3>Events are not connected</h3>
                  <p>
                    No event or licence records are available in this preview.
                  </p>
                  <button
                    className="btn primary"
                    onClick={() => setView("prep")}
                  >
                    Prepare show
                  </button>
                </div>
              </>
            )}
            {view === "account" && (
              <>
                <div className="pagehead">
                  <h1>Account & licences</h1>
                </div>
                <div className="editor-panel">
                  <h3>
                    {manager
                      ? "Manager session active"
                      : "Sign in to your account"}
                  </h3>
                  <p>
                    Your TADAZZ account signs in through the real account
                    service, and My Games loads your existing games read-only.
                    Licence purchases are not active in this preview.
                  </p>
                  <a
                    className="btn ghost"
                    href={
                      manager ? liveEditor("/manager/config") : "/site/login"
                    }
                  >
                    {manager ? "Open existing manager" : "Sign in"}
                  </a>
                  {manager && (
                    <button
                      className="btn ghost"
                      onClick={() => void logout()}
                      disabled={loggingOut}
                    >
                      {loggingOut ? "Signing out..." : "Sign out"}
                    </button>
                  )}
                </div>
              </>
            )}
            {view === "prep" && (
              <>
                <div className="pagehead">
                  <h1>Show preparation</h1>
                </div>
                <div className="editor-panel">
                  <h3>Before you begin</h3>
                  {[
                    ["Review questions", "Confirm the final game."],
                    ["Test projector", "Check the big screen."],
                    ["Check audio", "Test the music and speakers."],
                    [
                      "Confirm voting",
                      "Verify participation on your local setup.",
                    ],
                  ].map(([title, copy]) => (
                    <label className="check-row" key={title}>
                      <input type="checkbox" />
                      <span>
                        <strong>{title}</strong>
                        <small>{copy}</small>
                      </span>
                    </label>
                  ))}
                  <a
                    className="btn primary"
                    href={
                      manager ? liveEditor("/manager/config") : "/site/login"
                    }
                  >
                    {manager ? "Open existing manager" : "Sign in to manage"}{" "}
                    <ArrowRight size={16} />
                  </a>
                  <p className="inline-demo">
                    Checklist only. No live event or telephone service is
                    activated.
                  </p>
                </div>
              </>
            )}
            {view === "help" && (
              <div className="editor-panel">
                <h1>Your games, in one place.</h1>
                <p>
                  Browse My Games, explore shows and prepare your event. Create
                  and Edit open the existing game builder.
                </p>
                <button
                  className="btn primary"
                  onClick={() => setView("dashboard")}
                >
                  Got it
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </ReferenceCanvas>
  )
}
