import {
  AlertDialog,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  PLATFORM_MOTION,
  SubMenu,
} from "@razzia/extensions/platform-ui"
import { Ellipsis } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { useSiteText } from "../../locales"
import { SiteLink } from "../shared/SiteLink"
import type { QuizMeta } from "./MyGames"

export interface GameCardProps {
  game: QuizMeta
  busy: boolean
  showActions: boolean
  onDuplicate: () => void
  onDelete: () => Promise<void>
  exports: {
    legacy: () => void
    enhanced: () => void
    xlsx: () => void
    authored: () => void
  }
}

/** Presentation only: original composite/import/export handlers stay in MyGames. */
export function GameCard({
  game,
  busy,
  showActions,
  onDuplicate,
  onDelete,
  exports,
}: GameCardProps) {
  const t = useSiteText()
  const reduceMotion = useReducedMotion()
  const [removal, setRemoval] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  return (
    <motion.article
      layout={reduceMotion ? false : "position"}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      transition={
        reduceMotion
          ? PLATFORM_MOTION.reduced
          : {
              duration: PLATFORM_MOTION.duration.normal,
              ease: PLATFORM_MOTION.ease.standard,
              layout: PLATFORM_MOTION.spring,
            }
      }
      className="game-card"
      data-game-id={game.id}
      data-platform-motion="layout"
    >
      <div className="site-game-media">
        <img
          className="site-game-cover"
          data-cover-source="fallback"
          src="/tadazz-design-reference/marketing-stage.webp"
          alt=""
        />
        <span className="site-cover-label">{t("Default cover")}</span>
      </div>
      <div className="site-game-body">
        <div className="site-game-heading">
          <h3 className="game-title">{game.subject}</h3>
          {showActions && (
            <Menu
              trigger={
                <IconButton
                  ref={trigger}
                  variant="ghost"
                  disabled={busy}
                  label={t("More actions for {{name}}", { name: game.subject })}
                >
                  <Ellipsis aria-hidden="true" />
                </IconButton>
              }
            >
              <MenuItem disabled={busy} onSelect={onDuplicate}>
                {t("Duplicate")}
              </MenuItem>
              <SubMenu label={t("Export")}>
                <MenuItem disabled={busy} onSelect={exports.legacy}>
                  {t("Legacy JSON")}
                </MenuItem>
                <MenuItem disabled={busy} onSelect={exports.enhanced}>
                  {t("Enhanced bundle")}
                </MenuItem>
                <MenuItem disabled={busy} onSelect={exports.xlsx}>
                  {t("Excel workbook")}
                </MenuItem>
                <MenuItem disabled={busy} onSelect={exports.authored}>
                  {t("TADAZZ JSON")}
                </MenuItem>
              </SubMenu>
              <MenuSeparator />
              <MenuItem
                disabled={busy}
                tone="danger"
                onSelect={() => setRemoval(true)}
              >
                {t("Delete")}
              </MenuItem>
            </Menu>
          )}
        </div>
        <p className="muted">{t("Account-owned game")}</p>
        <div className="button-row">
          <SiteLink
            className="btn primary"
            href={`/manager/quizz/${encodeURIComponent(game.id)}`}
          >
            {t("Edit game")}
          </SiteLink>
          <SiteLink
            className="btn ghost"
            href={`/studio/prepare?quiz=${encodeURIComponent(game.id)}`}
          >
            {t("Prepare show")}
          </SiteLink>
        </div>
      </div>
      <AlertDialog
        open={removal}
        onOpenChange={setRemoval}
        returnFocusRef={trigger}
        title={t("Delete game?")}
        description={`${game.subject} — ${t("This permanently removes the game and its enhancements.")}`}
        confirmLabel={t("Confirm delete")}
        errorLabel={t("Your request could not be completed. Please try again.")}
        onConfirm={onDelete}
      />
    </motion.article>
  )
}
