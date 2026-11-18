import {
  resolveShowTheme,
  resolveTadazzStageBackground,
} from "@razzia/extensions/core"
import { showViewportStyle } from "@razzia/extensions/presentation"
import { STATUS } from "@razzia/common/types/game/status"
import defaultBackground from "@razzia/web/assets/background.png"
import { getBranding } from "@razzia/web/branding"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useInstalledThemeCatalog } from "./installed-theme-catalog"
import { useStudioEditor } from "./studio-editor-context"

/** Editor chrome stays Razzia; the surrounding stage follows current game/card. */
export function EditorGameBackdrop() {
  const { extras, currentQuestionId } = useQuizzEditor()
  const { defaults, selectedTimelineItem, scenes } = useStudioEditor()
  const registry = useInstalledThemeCatalog()
  const card =
    selectedTimelineItem?.kind === "question"
      ? extras?.perQuestion[currentQuestionId]
      : selectedTimelineItem
        ? scenes[selectedTimelineItem.sceneId]
        : undefined
  const theme = resolveShowTheme({
    selection: defaults.showTheme,
    scope: card?.themeOverrides,
    role: "manager",
    registry,
  })
  const backdrop = resolveTadazzStageBackground({
    settings: defaults.tadazzBackground,
    cardBackground: card?.background,
    originalUrl: getBranding()?.background ?? defaultBackground,
    tadazzImageUrl: theme.definition.assets.find(
      (asset) => asset.id === theme.definition.adapterAssets.showBackdrop,
    )?.url,
    reducedMotion: true,
  })
  const themeStyle = showViewportStyle(theme, null, STATUS.SHOW_QUESTION)
  const useExplicit = backdrop.source !== "original" || !themeStyle
  return (
    <div
      className="editor-game-backdrop"
      data-testid="editor-game-backdrop"
      data-editor-theme={theme.definition.id}
      data-background-source={useExplicit ? backdrop.source : "theme"}
      style={
        useExplicit
          ? {
              backgroundImage: backdrop.url
                ? `url(${JSON.stringify(backdrop.url)})`
                : undefined,
              backgroundSize: backdrop.fit,
              backgroundPosition: backdrop.position,
              backgroundColor: theme.definition.tokens.background,
            }
          : themeStyle
      }
      aria-hidden="true"
    >
      {useExplicit && backdrop.overlayOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "black",
            opacity: backdrop.overlayOpacity,
          }}
        />
      )}
    </div>
  )
}
