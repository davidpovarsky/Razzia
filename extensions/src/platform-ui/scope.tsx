import {
  createContext,
  useContext,
  useMemo,
  useState,
  type HTMLAttributes,
  type PropsWithChildren,
  type Ref,
} from "react"
import { Direction } from "radix-ui"
import { platformComponentCss } from "./styles"
import {
  platformTokenCss,
  platformOverrideStyle,
  PLATFORM_TOKEN_VERSION,
  type PlatformContext,
  type PlatformAppearance,
  type TokenOverrides,
} from "./tokens"

const EMPTY_OVERRIDES: TokenOverrides = Object.freeze({})
const ThemeContext = createContext<{
  context: PlatformContext
  appearance: PlatformAppearance
  dir: "ltr" | "rtl"
  tokenOverrides: TokenOverrides
}>({
  context: "platform.host",
  appearance: "dark",
  dir: "ltr",
  tokenOverrides: EMPTY_OVERRIDES,
})
const PortalTargetContext = createContext<HTMLElement | null>(null)
export const useScopePortalTarget = () => useContext(PortalTargetContext)
export function PortalContainerProvider({
  container,
  children,
}: PropsWithChildren<{ container: HTMLElement | null }>) {
  const parent = useScopePortalTarget()
  return (
    <PortalTargetContext.Provider value={container ?? parent}>
      {children}
    </PortalTargetContext.Provider>
  )
}
export const usePlatformTheme = () => useContext(ThemeContext)
export const usePlatformContext = () => usePlatformTheme().context

/** Context only: it never applies platform typography/styles to a show stage. */
export function PlatformThemeProvider({
  context,
  appearance = "dark",
  dir = "ltr",
  tokenOverrides = EMPTY_OVERRIDES,
  children,
}: PropsWithChildren<{
  context: PlatformContext
  appearance?: PlatformAppearance
  dir?: "ltr" | "rtl"
  tokenOverrides?: TokenOverrides
}>) {
  const value = useMemo(
    () => ({ context, appearance, dir, tokenOverrides }),
    [context, appearance, dir, tokenOverrides],
  )
  return (
    <ThemeContext.Provider value={value}>
      <Direction.Provider dir={dir}>{children}</Direction.Provider>
    </ThemeContext.Provider>
  )
}

export interface PlatformScopeProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>
  context: PlatformContext
  appearance?: PlatformAppearance
  tokenOverrides?: TokenOverrides
  dir?: "ltr" | "rtl"
}

/** Only platform-owned controls/surfaces belong inside this DOM scope. */
export function PlatformScope({
  context,
  appearance = "dark",
  dir = "ltr",
  tokenOverrides,
  className = "",
  style,
  children,
  ...props
}: PlatformScopeProps) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  return (
    <PlatformThemeProvider
      context={context}
      appearance={appearance}
      dir={dir}
      tokenOverrides={tokenOverrides}
    >
      <PortalTargetContext.Provider value={target}>
        <div
          {...props}
          className={`tds-scope ${className}`}
          data-platform-scope={context}
          data-platform-appearance={appearance}
          dir={dir}
          data-token-version={PLATFORM_TOKEN_VERSION}
          style={{ ...platformOverrideStyle(tokenOverrides), ...style }}
        >
          <style>{platformTokenCss}</style>
          <style>{platformComponentCss}</style>
          {children}
          <div
            ref={setTarget}
            data-platform-portals=""
            style={{ display: "contents" }}
          />
        </div>
      </PortalTargetContext.Provider>
    </PlatformThemeProvider>
  )
}
