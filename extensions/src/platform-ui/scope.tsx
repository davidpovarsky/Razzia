import {
  createContext,
  useContext,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react"
import {
  platformTokenCss,
  platformOverrideStyle,
  PLATFORM_TOKEN_VERSION,
  type PlatformContext,
  type PlatformAppearance,
  type TokenOverrides,
} from "./tokens"

const ThemeContext = createContext<{
  context: PlatformContext
  appearance: PlatformAppearance
}>({ context: "platform.host", appearance: "dark" })
export const usePlatformTheme = () => useContext(ThemeContext)
export const usePlatformContext = () => usePlatformTheme().context

/** Context only: it never applies platform typography/styles to a show stage. */
export function PlatformThemeProvider({
  context,
  appearance = "dark",
  children,
}: PropsWithChildren<{
  context: PlatformContext
  appearance?: PlatformAppearance
}>) {
  return (
    <ThemeContext.Provider value={{ context, appearance }}>
      {children}
    </ThemeContext.Provider>
  )
}

export interface PlatformScopeProps extends HTMLAttributes<HTMLDivElement> {
  context: PlatformContext
  appearance?: PlatformAppearance
  tokenOverrides?: TokenOverrides
}

/** Only platform-owned controls/surfaces belong inside this DOM scope. */
export function PlatformScope({
  context,
  appearance = "dark",
  tokenOverrides,
  className = "",
  style,
  children,
  ...props
}: PlatformScopeProps) {
  return (
    <PlatformThemeProvider context={context} appearance={appearance}>
      <div
        {...props}
        className={`tds-scope ${className}`}
        data-platform-scope={context}
        data-platform-appearance={appearance}
        data-token-version={PLATFORM_TOKEN_VERSION}
        style={{ ...platformOverrideStyle(tokenOverrides), ...style }}
      >
        <style>{platformTokenCss}</style>
        {children}
      </div>
    </PlatformThemeProvider>
  )
}
