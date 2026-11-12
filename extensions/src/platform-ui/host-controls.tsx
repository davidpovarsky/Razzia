import { Check, Copy, Maximize, Monitor } from "lucide-react"
import { createElement, type ComponentType } from "react"
import { useTranslation } from "react-i18next"
import { Button, IconButton } from "./button"
import { Tooltip } from "./menus"
import { PlatformScope, type PlatformScopeProps } from "./scope"
import { ToolbarGroup } from "./surfaces"
const iconStyle = {
  width: "var(--tds-icon-small)",
  height: "var(--tds-icon-small)",
  flexShrink: 0,
}

/** Presentation only. The caller retains window, clipboard and fullscreen handlers. */
export function HostDisplayControls({
  gameId,
  onOpen,
  onCopy,
  onPresent,
  copied = false,
}: {
  gameId?: string
  onOpen: () => void
  onCopy: () => void | Promise<void>
  onPresent?: () => void
  copied?: boolean
}) {
  const { t } = useTranslation()

  if (!gameId && !onPresent) {
    return null
  }

  return (
    <ToolbarGroup
      label={`${t("extensions:host.openDisplay")} · ${t("extensions:host.presentFromHost")}`}
      data-testid="host-display-controls"
    >
      {gameId && (
        <>
          <Tooltip content={t("extensions:host.openDisplay")}>
            <Button
              size="sm"
              aria-label={t("extensions:host.openDisplay")}
              onClick={onOpen}
              data-testid="host-open-display-btn"
            >
              <Monitor style={iconStyle} aria-hidden="true" />
              <span className="tds-host-display-label">
                {t("extensions:host.openDisplay")}
              </span>
            </Button>
          </Tooltip>
          <Tooltip
            content={t(
              copied
                ? "extensions:host.displayUrlCopied"
                : "extensions:host.copyDisplayUrl",
            )}
          >
            <IconButton
              size="sm"
              label={t("extensions:host.copyDisplayUrl")}
              onClick={onCopy}
              data-testid="host-copy-display-btn"
            >
              {copied ? (
                <Check style={iconStyle} />
              ) : (
                <Copy style={iconStyle} />
              )}
            </IconButton>
          </Tooltip>
        </>
      )}
      {onPresent && (
        <Tooltip content={t("extensions:host.presentFromHost")}>
          <Button
            size="sm"
            onClick={onPresent}
            aria-label={t("extensions:host.presentFromHost")}
            data-testid="host-present-from-host-btn"
          >
            <Maximize style={iconStyle} aria-hidden="true" />
            <span className="tds-host-display-label">
              {t("extensions:host.presentFromHost")}
            </span>
          </Button>
        </Tooltip>
      )}
      {copied && (
        <span role="status" className="sr-only">
          {t("extensions:host.displayUrlCopied")}
        </span>
      )}
    </ToolbarGroup>
  )
}

/** Explicit scope for existing host footer primitives; never wrap the show stage. */
export function HostControlBar({
  className = "",
  ...props
}: Omit<PlatformScopeProps, "context">) {
  const { t } = useTranslation()

  return (
    <PlatformScope
      context="platform.host"
      role="group"
      aria-label={`${t("extensions:roster.playersButton")} · ${t("game:settings.title")} · ${t("common:fullscreen")}`}
      data-testid="host-control-footer"
      {...props}
      className={`tds-host-control-bar ${className}`}
    />
  )
}

/** Skin only the original host controls. The original audio player stays single-owned. */
export function HostAudioControls<Props extends object>({
  component,
  ...props
}: Props & {
  component: ComponentType<Props>
  manager?: boolean
  isHostPresenting: boolean
}) {
  const children = createElement(component, props as Props)

  return props.manager && !props.isHostPresenting ? (
    <PlatformScope
      context="platform.host"
      className="tds-host-audio-controls"
      data-testid="host-audio-scope"
    >
      {children}
    </PlatformScope>
  ) : (
    children
  )
}
