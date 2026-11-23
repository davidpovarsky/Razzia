import { SiteButton } from "../shared/SiteButton"
import { siteText as t } from "../../locales"
import { HoverDevTiltCard } from "../../components/HoverDevTiltCard"
import {
  ArrowRight,
  Play,
  Users,
  Sparkles,
  Brain,
  BookOpen,
  Image,
  BadgeCheck,
  Trophy,
  Heart,
  GraduationCap,
  Briefcase,
  Crown,
  Gamepad2,
  Tv,
  Diamond,
  PartyPopper,
  Flag,
  Search,
  type LucideIcon,
} from "lucide-react"
import { useState, type CSSProperties } from "react"
import { GamePreviewSurface } from "../../components/game-preview/game-preview-surface"
import {
  publicDemoCatalogue,
  type PublicDemoMetadata,
} from "../../../core/show-library/public-demo-catalogue"

export const asset = (name: string) =>
  `/tadazz-design-reference/marketing-${name}.webp`

export const catalogue = publicDemoCatalogue

export type Game = PublicDemoMetadata

const coverIcons: Record<string, LucideIcon | undefined> = {
  "great-guessoff": Sparkles,
  crowd: Users,
  quiz: Brain,
  story: BookOpen,
  picture: Image,
  truth: BadgeCheck,
  finale: Trophy,
  family: Heart,
  classroom: GraduationCap,
  team: Briefcase,
  "royal-quiz": Crown,
  "neon-arcade": Gamepad2,
  "retro-tv": Tv,
  "magic-storybook": BookOpen,
  "crystal-future": Diamond,
  "carnival-pop": PartyPopper,
  "sports-arena": Flag,
  "mystery-noir": Search,
}

export function Cover({ game }: { game: Game }) {
  const Icon = coverIcons[game.id] ?? Sparkles

  return (
    <div
      className="game-cover catalogue-cover"
      data-catalogue-cover={game.id}
      style={
        {
          background: game.gradient,
          "--catalogue-accent": game.accent,
        } as CSSProperties
      }
    >
      <img
        className="catalogue-cover-art"
        src={game.coverUrl}
        alt=""
        loading="lazy"
      />
      <div className="catalogue-cover-shade" />
      <div className="catalogue-cover-orbit" aria-hidden="true" />
      <div className="catalogue-cover-emblem" aria-hidden="true">
        <Icon strokeWidth={1.4} />
      </div>
      <span className="cover-kicker">{t(game.themeName)}</span>
      <span className="catalogue-cover-brand" aria-hidden="true">
        TADAZZ!
      </span>
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
  const [active, setActive] = useState(false)

  return (
    <HoverDevTiltCard suspended={active}>
      <div data-catalogue-card={game.id}>
        <GamePreviewSurface
          selection={{ kind: "published-demo", catalogueId: game.id }}
          label={t("View {{name}}", { name: t(game.title) })}
          onOpen={open}
          onActiveChange={setActive}
        >
          <Cover game={game} />
        </GamePreviewSurface>
        <div className="game-card-body">
          <h3>
            <SiteButton className="catalogue-title-link" onClick={open}>
              {t(game.title)}
            </SiteButton>
          </h3>
          <p>{t(game.desc)}</p>
          <div className="game-meta">
            <span>{t(game.category)}</span>
            <span>{t("{{count}} rounds", { count: game.questionCount })}</span>
            <span>
              {t("{{range}} min", { range: game.time.replace(" min", "") })}
            </span>
          </div>
          <div className="catalogue-audiences">
            {game.audience.map((audience) => (
              <span key={audience}>{t(audience)}</span>
            ))}
          </div>
          <div className="game-actions">
            <SiteButton
              className="link muted"
              onClick={preview}
              data-catalogue-preview={game.id}
            >
              <Play size={15} />
              {t("Preview")}
            </SiteButton>
            <SiteButton
              className="link"
              onClick={open}
              data-catalogue-open={game.id}
            >
              {t("View game")}
              <ArrowRight size={15} />
            </SiteButton>
          </div>
        </div>
      </div>
    </HoverDevTiltCard>
  )
}
