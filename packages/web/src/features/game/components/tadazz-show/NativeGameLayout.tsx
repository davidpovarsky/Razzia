import { useEffect, type PropsWithChildren, type RefCallback } from "react"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  RAZZIA_THEME_ID,
  TADAZZ_PRODUCT_LOGO_URL,
  type ExtensionStateEnvelope,
  type ResolvedShowTheme,
} from "@razzia/extensions/core"
import {
  ShowThemeScope,
  themeAdapterAsset,
} from "@razzia/extensions/presentation"
import type { ViewRole } from "../../contexts/view-role-context"

/** Native Razzia shell metadata and styling; no socket, scoring or game controller. */
export function NativeGameFrame({
  children,
  theme,
  extensionState,
  statusName,
  role,
  isHostPresenting,
  onRoot,
}: PropsWithChildren<{
  theme: ResolvedShowTheme
  extensionState: ExtensionStateEnvelope | null
  statusName: Status | undefined
  role: ViewRole
  isHostPresenting: boolean
  onRoot: RefCallback<HTMLElement>
}>) {
  useEffect(() => {
    const previous = document.body.style.touchAction
    document.body.style.touchAction = "pan-y"

    return () => {
      document.body.style.touchAction = previous
    }
  }, [])

  return (
    <ShowThemeScope theme={theme}>
      <section
        ref={onRoot}
        data-host-presenting={isHostPresenting ? "true" : "false"}
        className="font-display relative isolate flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden"
        data-testid="tadazz-show"
        data-native-layout="true"
        data-show-theme={theme.definition.id}
        data-show-theme-version={theme.definition.version}
        data-theme-fallback={
          theme.diagnostics.some((item) => item.code === "unknown-theme")
            ? "true"
            : "false"
        }
        data-role={role}
        data-game-paused={extensionState?.pause?.paused ? "true" : "false"}
        data-voting-open={
          statusName === STATUS.SELECT_ANSWER && !extensionState?.pause?.paused
            ? "true"
            : "false"
        }
        data-show-scene={(() => {
          if (statusName === STATUS.SELECT_ANSWER) {
            return "voting"
          }

          if (
            statusName === STATUS.SHOW_RESPONSES ||
            statusName === STATUS.SHOW_RESULT
          ) {
            return "results"
          }

          return extensionState?.phase ?? "lobby"
        })()}
      >
        {children}
      </section>
    </ShowThemeScope>
  )
}

/** Only the game content receives a skin. Controls retain the platform's styles. */
export function NativeGameSurface({
  theme,
  children,
}: PropsWithChildren<{ theme: ResolvedShowTheme }>) {
  return (
    <div
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      data-testid="native-game-surface"
      style={
        theme.definition.id === RAZZIA_THEME_ID
          ? undefined
          : {
              backgroundImage: `url("${themeAdapterAsset(theme, "questionBackdrop")}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
      }
    >
      <div className="relative z-10 flex shrink-0 justify-center px-3 py-2">
        <img
          src={TADAZZ_PRODUCT_LOGO_URL}
          alt="TADAZZ!"
          data-testid="product-logo"
          className="h-8 w-auto max-w-40 object-contain sm:h-10"
        />
      </div>
      {children}
    </div>
  )
}
