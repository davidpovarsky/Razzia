import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ComponentType,
  type CSSProperties,
} from "react"
import {
  resolveShowTheme,
  type ResolvedShowTheme,
  type ShowThemeRole,
} from "../../core/show-themes/index"

const ShowThemeContext = createContext<ResolvedShowTheme | null>(null)

export const useOptionalShowTheme = () => useContext(ShowThemeContext)

export function useShowTheme(
  role: ShowThemeRole = "manager",
): ResolvedShowTheme {
  const active = useOptionalShowTheme()

  return useMemo(() => active ?? resolveShowTheme({ role }), [active, role])
}

interface ThemeEnvelope {
  extras: Record<string, unknown>
}

/** A renderer seam, not a game controller. It adds no DOM or transports. */
export function ShowThemeRenderer<Props extends object>({
  envelope,
  role,
  renderers,
  viewProps,
}: {
  envelope: ThemeEnvelope | null
  role: ShowThemeRole
  renderers: Readonly<
    Record<ResolvedShowTheme["definition"]["rendererId"], ComponentType<Props>>
  >
  viewProps: Props
}) {
  const defaults = envelope?.extras.defaults as
    { showTheme?: unknown } | undefined
  const scene = envelope?.extras.currentScene as
    { themeOverrides?: unknown } | undefined
  const scope = scene?.themeOverrides ?? envelope?.extras.themeOverrides
  const theme = useMemo(
    () => resolveShowTheme({ selection: defaults?.showTheme, scope, role }),
    [defaults?.showTheme, scope, role],
  )
  const Renderer = renderers[theme.definition.rendererId]

  return (
    <ShowThemeContext.Provider value={theme}>
      {createElement(Renderer, viewProps)}
    </ShowThemeContext.Provider>
  )
}

export function showThemeStyle(theme: ResolvedShowTheme): CSSProperties {
  return {
    background: theme.definition.tokens.background,
    "--show-theme-background": theme.definition.tokens.background,
    "--show-theme-foreground": theme.definition.tokens.foreground,
    "--show-theme-accent": theme.definition.tokens.accent,
    "--show-theme-font":
      theme.definition.tokens.fontId === "rubik"
        ? "Rubik, sans-serif"
        : 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
    ...Object.fromEntries(
      Object.entries(theme.definition.tokens.palette).map(([key, value]) => [
        `--show-theme-${key}`,
        value,
      ]),
    ),
  } as CSSProperties
}

export function themeAdapterAsset(
  theme: ResolvedShowTheme | null,
  key: "questionBackdrop" | "showBackdrop" | "brandLogo",
): string | undefined {
  return theme?.definition.assets.find(
    (asset) => asset.id === theme.definition.adapterAssets[key],
  )?.url
}
