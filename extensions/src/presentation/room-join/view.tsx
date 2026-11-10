import type { ComponentProps } from "react"
import { QRCodeSVG } from "qrcode.react"
import { useTranslation } from "react-i18next"
import type { RoomJoin } from "./contract"
import { useOptionalShowTheme } from "../show-themes/context"

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
      {join.pending ? (
        <span role="status">{t("common:connecting")}</span>
      ) : join.locked ? (
        <span role="status">{t("errors:game.locked")}</span>
      ) : null}
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
