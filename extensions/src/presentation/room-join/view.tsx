import {
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react"
import { QRCodeSVG } from "qrcode.react"
import { useTranslation } from "react-i18next"
import { AlertDialog } from "radix-ui"
import { AlertPortal } from "../../platform-ui/portal"
import type { RoomJoin } from "./contract"
import { useOptionalShowTheme } from "../show-themes/context"

export function RoomQrPortal({ children }: { children: ReactNode }) {
  return <AlertPortal legacy>{children}</AlertPortal>
}

export function RoomQrLabels({ join }: { join: RoomJoin }) {
  const { t } = useTranslation()
  const title = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    let mounted = true
    queueMicrotask(() => {
      if (mounted) {
        title.current
          ?.closest('[role="alertdialog"]')
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus()
      }
    })

    return () => {
      mounted = false
    }
  }, [])

  return (
    <>
      <AlertDialog.Title ref={title} className="sr-only">
        {t("game:showQrCode")}
      </AlertDialog.Title>
      <AlertDialog.Description className="sr-only">
        {t("game:joinInstruction")} {join.webUrl} · {t("game:gamePinLabel")}{" "}
        {join.displayPin}
      </AlertDialog.Description>
    </>
  )
}

/** Same installed encoder; four-module quiet zone remains inside the SVG box. */
export function RoomQrCode(props: ComponentProps<typeof QRCodeSVG>) {
  const { t } = useTranslation()

  return (
    <QRCodeSVG
      role="img"
      aria-label={t("game:showQrCode")}
      {...props}
      marginSize={4}
      data-qr-url={typeof props.value === "string" ? props.value : undefined}
    />
  )
}

export function RoomJoinMetadata({ join }: { join: RoomJoin }) {
  const { t } = useTranslation()
  const theme = useOptionalShowTheme()
  const status = join.pending ? t("common:connecting") : t("errors:game.locked")

  return (
    <div
      data-testid="room-join-metadata"
      data-room-lock-state={join.lockState}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.75rem",
        color: theme?.definition.tokens.foreground ?? "inherit",
      }}
    >
      {(join.pending || join.locked) && <span role="status">{status}</span>}
      {join.dialNumber && (
        <p>
          {t("extensions:roster.phoneLabel")}:{" "}
          <strong dir="ltr" data-testid="room-dial-number">
            {join.dialNumber}
          </strong>
        </p>
      )}
    </div>
  )
}
