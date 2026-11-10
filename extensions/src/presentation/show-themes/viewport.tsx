import {
  createContext,
  createElement,
  useContext,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ComponentType,
  type Ref,
} from "react"
import { createPortal } from "react-dom"
import { STATUS } from "@razzia/common/types/game/status"
import {
  RAZZIA_THEME_ID,
  type ExtensionStateEnvelope,
  type ResolvedShowTheme,
  type ShowThemeSlotId,
} from "../../core"
import { themeAdapterAsset } from "./context"

const Layers = createContext<{ target: HTMLElement | null; enabled: boolean }>({
  target: null,
  enabled: false,
})
export function viewportSlot(
  envelope: ExtensionStateEnvelope | null,
  status?: string,
): ShowThemeSlotId {
  if (envelope?.phase === "scene") return "interlude"
  if (status === STATUS.SHOW_ROOM || envelope?.phase === "lobby") return "lobby"
  if (status === STATUS.SELECT_ANSWER) return "voting"
  if (status === STATUS.SHOW_RESPONSES || status === STATUS.SHOW_RESULT)
    return "resultsReveal"
  if (status === STATUS.SHOW_LEADERBOARD) return "leaderboard"
  if (status === STATUS.FINISHED || status === STATUS.SUMMARY) return "closing"
  return status ? "question" : "firstPaint"
}
/** Uses selected show tokens, never platform/editor variables or a video clone. */
export function showViewportStyle(
  theme: ResolvedShowTheme,
  envelope: ExtensionStateEnvelope | null,
  status?: string,
): CSSProperties | undefined {
  if (theme.definition.id === RAZZIA_THEME_ID) return undefined
  const slotName = viewportSlot(envelope, status),
    slot = theme.slots[slotName]
  const asset = theme.definition.assets.find(
    (asset) => asset.id === slot.backgroundAssetId,
  )?.url
  const url =
    (theme.definition.slots[slotName].customMedia === "background"
      ? slot.mediaUrl
      : undefined) ??
    asset ??
    themeAdapterAsset(theme, "showBackdrop") ??
    themeAdapterAsset(theme, "questionBackdrop")
  return {
    backgroundColor: theme.definition.tokens.background,
    backgroundImage: url ? `url(${JSON.stringify(url)})` : "none",
    backgroundSize: slot.fit ?? "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  }
}
export function ShowViewportFrame({
  theme,
  envelope,
  statusName,
  children,
  style,
  ref,
  ...props
}: HTMLAttributes<HTMLElement> & {
  theme: ResolvedShowTheme
  envelope: ExtensionStateEnvelope | null
  statusName?: string
  ref?: Ref<HTMLElement>
}) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  return (
    <section
      {...props}
      ref={ref}
      style={{ ...showViewportStyle(theme, envelope, statusName), ...style }}
      data-theme-viewport={theme.definition.id}
    >
      <Layers.Provider
        value={{ target, enabled: theme.definition.id !== RAZZIA_THEME_ID }}
      >
        {children}
      </Layers.Provider>
      <div
        ref={setTarget}
        data-testid="show-viewport-layers"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      />
    </section>
  )
}
/** Portal only decorative legacy backdrop children; original theme stays in place. */
export function ViewportBackdropLayer<Props extends object>({
  component,
  ...props
}: Props & { component: ComponentType<Props> }) {
  const { target, enabled } = useContext(Layers)
  const children = createElement(component, props as Props)
  return enabled ? (target ? createPortal(children, target) : null) : children
}
