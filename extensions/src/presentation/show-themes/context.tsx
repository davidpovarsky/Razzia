import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ComponentType,
  type CSSProperties,
  type PropsWithChildren,
} from "react"
import {
  resolveShowTheme,
  type ResolvedShowTheme,
  type ShowThemeRole,
  createShowThemeRegistry,
  showThemeRegistry,
} from "../../core/show-themes/index"

import { TADAZZ_PRODUCT_LOGO_URL } from "../../core/product-branding"

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

/** A room-scoped value, shared by cinematic and native Razzia surfaces. */
export function useResolvedShowTheme(
  envelope: ThemeEnvelope | null,
  role: ShowThemeRole,
) {
  const defaults = envelope?.extras.defaults as
    { showTheme?: unknown } | undefined
  const scene = envelope?.extras.currentScene as
    { themeOverrides?: unknown } | undefined
  const scope = scene?.themeOverrides ?? envelope?.extras.themeOverrides
  // A value-stable immutable manifest avoids reparsing/freezing on each clock snapshot.
  const installedDefinition = envelope?.extras.themeDefinitionJson
  const registry = useMemo(() => {
    try {
      return createShowThemeRegistry(
        typeof installedDefinition === "string"
          ? [JSON.parse(installedDefinition)]
          : [],
      )
    } catch {
      // Preserve the requested identity and display the existing manager warning.
      return showThemeRegistry
    }
  }, [installedDefinition])
  const theme = useMemo(
    () =>
      resolveShowTheme({
        selection: defaults?.showTheme,
        scope,
        role,
        registry,
      }),
    [defaults?.showTheme, scope, role, registry],
  )

  return theme
}

export function ShowThemeScope({
  theme,
  children,
}: PropsWithChildren<{ theme: ResolvedShowTheme }>) {
  return (
    <ShowThemeContext.Provider value={theme}>
      {children}
    </ShowThemeContext.Provider>
  )
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
  const theme = useResolvedShowTheme(envelope, role)
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
        ? '"Rubik Variable", sans-serif'
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
  if (key === "brandLogo") {
    return TADAZZ_PRODUCT_LOGO_URL
  }

  return theme?.definition.assets.find(
    (asset) => asset.id === theme.definition.adapterAssets[key],
  )?.url
}
