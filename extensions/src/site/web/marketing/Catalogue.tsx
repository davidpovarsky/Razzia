import { SiteButton } from "../shared/SiteButton"
import { siteText as t } from "../../locales"
import { HoverDevTiltCard } from "../../components/HoverDevTiltCard"
import { ArrowRight, Play } from "lucide-react"

// Local TADAZZ React implementation of the supplied frozen prototypes.
export const asset = (name: string) =>
  `/tadazz-design-reference/marketing-${name}.webp`

export const catalogue = [
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

export type Game = (typeof catalogue)[number]

export function Cover({ game }: { game: Game }) {
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
      <span className="cover-kicker">{t(game.category)}</span>
      <div className="cover-title">{t(game.title)}</div>
    </div>
  )
}

export function GameCard({
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
      <SiteButton
        onClick={open}
        style={{
          padding: 0,
          border: 0,
          width: "100%",
          textAlign: "left",
          color: "inherit",
        }}
        aria-label={t("View {{name}}", { name: t(game.title) })}
      >
        <Cover game={game} />
      </SiteButton>
      <div className="game-card-body">
        <h3>{t(game.title)}</h3>
        <p>{t(game.desc)}</p>
        <div className="game-meta">
          {t(game.category)} ·{" "}
          {t("{{range}} min", { range: game.time.replace(" min", "") })}
        </div>
        <div className="game-actions">
          <SiteButton className="link muted" onClick={preview}>
            <Play size={15} />
            {t("Preview")}
          </SiteButton>
          <SiteButton className="link" onClick={open}>
            {t("View game")}
            <ArrowRight size={15} />
          </SiteButton>
        </div>
      </div>
    </HoverDevTiltCard>
  )
}
