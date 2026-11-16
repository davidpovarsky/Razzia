import NativeButton from "../../../../packages/web/src/components/Button"
import { SeatingPlan } from "../tadazz-v4/reference-story/SeatingPlan"
import { useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { AlertDialog } from "radix-ui"
import { Lock, Maximize2, X } from "lucide-react"
import type { RoomJoin } from "../room-join/contract"
import {
  RoomJoinMetadata,
  RoomQrPortal,
  RoomQrLabels,
  RoomQrCode as QRCodeSVG,
} from "../room-join/view"
import { useOnClickOutside } from "../../../../packages/web/src/hooks/useOnClickOutside"

/** Exact original room panel, with host authority supplied by the live wrapper. */
export function NativeRazziaRoomPanel({
  join,
  inviteCode,
  text,
  children,
}: {
  join: RoomJoin
  inviteCode?: string
  text: string
  children?: ReactNode
}) {
  const { locked, webUrl } = join
  const [qrOpen, setQrOpen] = useState(false)
  const qrContentRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  useOnClickOutside({ ref: qrContentRef, handler: () => setQrOpen(false) })
  const handleCloseQrCode = () => setQrOpen(false)

  return (
    <section className="tds-native-room relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-2">
      <div className="mb-10 flex flex-col-reverse items-center gap-3 md:flex-row md:items-stretch">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="flex flex-col items-center justify-center rounded-xl bg-white px-6 py-4 md:flex-row">
            <div>
              <p className="text-2xl font-bold">{t("game:joinInstruction")}</p>
              <p className="max-w-64 text-lg font-extrabold break-all">
                {webUrl}
              </p>
            </div>

            <div className="my-4 h-0.5 w-full bg-gray-300 md:mx-4 md:h-full md:w-0.5" />

            <div>
              <p className="text-2xl font-bold">{t("game:gamePinLabel")}</p>
              <p className="text-6xl font-extrabold tabular-nums">
                {locked
                  ? Array.from(inviteCode ?? "", (_, i) => (
                      <span
                        key={i}
                        className="inline-block w-[1ch] text-center"
                      >
                        #
                      </span>
                    ))
                  : inviteCode}
              </p>
            </div>
          </div>
        </div>

        {locked ? (
          <div className="flex size-40 shrink-0 items-center justify-center rounded-xl bg-white p-2">
            <Lock className="size-16" />
          </div>
        ) : (
          <AlertDialog.Root open={qrOpen} onOpenChange={setQrOpen}>
            <AlertDialog.Trigger
              aria-label={t("game:showQrCode")}
              className="group relative flex h-40 shrink-0 cursor-pointer rounded-xl bg-white p-2"
            >
              <QRCodeSVG
                className="h-auto w-auto"
                value={join.qrUrl ?? webUrl}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-xl opacity-0 transition-opacity group-hover:opacity-100">
                <div className="rounded-md bg-black/80 p-2">
                  <Maximize2 className="size-6 text-white" />
                </div>
              </div>
            </AlertDialog.Trigger>

            <RoomQrPortal>
              <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
              <AlertDialog.Content
                ref={qrContentRef}
                className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6"
              >
                <RoomQrLabels join={join} />
                <button
                  onClick={handleCloseQrCode}
                  aria-label={t("common:close")}
                  className="hover:bg-muted absolute -top-3 -right-3 rounded-full bg-white p-1.5 shadow-md"
                >
                  <X className="text-foreground size-6" />
                </button>
                <QRCodeSVG
                  className="size-56 md:size-70 lg:size-95"
                  value={join.qrUrl ?? webUrl}
                />
              </AlertDialog.Content>
            </RoomQrPortal>
          </AlertDialog.Root>
        )}
      </div>

      <RoomJoinMetadata join={join} />
      <h2 className="mb-6 text-4xl font-bold text-white drop-shadow-lg">
        {t(text)}
      </h2>

      {children}
    </section>
  )
}

/** Exact Classic lobby and Creating Worlds seating presentation. No live transport. */
export function NativeClassicLobbyPanel({
  join,
  isManager,
  fullShowData,
  text,
  players: list = [],
  onKick,
  tx,
}: {
  join: RoomJoin
  isManager: boolean
  text?: string
  fullShowData?: {
    dialNumber?: string
    representatives?: Array<{ table: number; name: string }>
    connectedTables?: number[]
  }
  players?: ReadonlyArray<{ id: string; username: string; connected: boolean }>
  onKick?: (id: string) => void
  tx: (key: string, fallback: string, vars?: Record<string, unknown>) => string
}) {
  const { t } = useTranslation()
  const [qrOpen, setQrOpen] = useState(false)
  const { pin: inviteCode, locked: isLocked, webUrl, host } = join
  const kick = (id: string) => onKick?.(id)
  // Creating Worlds is a hosted table show: show join code AND the full live
  // 40-representative roster in ONE public screen, without four follow-up pages.
  const representatives = fullShowData?.representatives

  if (representatives?.length) {
    const tables = [
      ...new Set(
        representatives
          .map((rep) => rep.table)
          .filter((table) => table >= 1 && table <= 31),
      ),
    ].sort((a, b) => a - b)
    const connected = (fullShowData?.connectedTables ?? []).filter((table) =>
      tables.includes(table),
    )

    return (
      <SeatingPlan
        representatives={representatives}
        connectedTables={connected}
        dialNumber={join.dialNumber}
        pin={(() => {
          if (inviteCode) {
            if (isLocked) {
              return inviteCode.replace(/./g, "#")
            }

            return inviteCode
          }

          return "—"
        })()}
        qr={
          inviteCode && !isLocked ? (
            <QRCodeSVG value={join.qrUrl ?? webUrl} />
          ) : (
            <Lock />
          )
        }
        labels={{
          call: tx("seating.call", "CALL TO JOIN"),
          pin: tx("seating.pin", "GAME PIN"),
          stage: tx("seating.stage", "STAGE"),
          production: tx("seating.production", "PRODUCTIONS TEAM"),
          entrance: tx("seating.entrance", "ENTRANCE"),
          table: tx("seating.table", "Table"),
          noPhone: tx("seating.noPhone", "NUMBER NOT CONFIGURED"),
          connected: tx(
            "seating.connected",
            "{{connected}} / {{total}} TABLES CONNECTED",
            { connected: new Set(connected).size, total: tables.length },
          ),
        }}
      />
    )
  }

  return (
    <div className="tz-x-fill" data-testid="tadazz-screen-lobby">
      <div className="tz-x-eyebrow">{tx("lobbyEyebrow", "JOIN THE SHOW")}</div>
      <div className="tz-x-title">
        TADA<span>ZZ!</span>
      </div>
      <div className="tz-x-underline" />
      <div className="tz-lobby-join tz-x-panel">
        <div>
          <div className="tz-lobby-label">{t("game:joinInstruction")}</div>
          <div className="tz-lobby-url" data-testid="tadazz-lobby-url">
            {host || webUrl}
          </div>
        </div>
        <div className="tz-lobby-divider" />
        <div>
          <div className="tz-lobby-label">{t("game:gamePinLabel")}</div>
          <div className="tz-lobby-pin" data-testid="tadazz-lobby-pin">
            {(() => {
              if (inviteCode) {
                if (isLocked) {
                  return inviteCode.replace(/./g, "#")
                }

                return inviteCode
              }

              return "—"
            })()}
          </div>
        </div>
        {isLocked || !inviteCode ? (
          <div
            className="tz-lobby-qr tz-lobby-lock"
            aria-hidden="true"
            style={{ background: "transparent", border: 0, boxShadow: "none" }}
          >
            {isLocked ? <Lock className="size-28" /> : null}
          </div>
        ) : (
          <AlertDialog.Root open={qrOpen} onOpenChange={setQrOpen}>
            <AlertDialog.Trigger
              aria-label={t("game:showQrCode")}
              className="tz-lobby-qr cursor-pointer"
              data-testid="tadazz-lobby-qr"
            >
              <QRCodeSVG value={join.qrUrl ?? webUrl} />
            </AlertDialog.Trigger>
            <RoomQrPortal>
              <AlertDialog.Overlay
                className="fixed inset-0 z-50 bg-black/70"
                onClick={() => setQrOpen(false)}
              />
              <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6">
                <RoomQrLabels join={join} />
                <NativeButton
                  size="sm"
                  type="button"
                  onClick={() => setQrOpen(false)}
                  aria-label={t("common:close")}
                  className="hover:bg-muted absolute -top-3 -right-3 rounded-full bg-white p-1.5 shadow-md"
                >
                  <X className="text-foreground size-6" />
                </NativeButton>
                <QRCodeSVG
                  className="size-56 md:size-70 lg:size-95"
                  value={join.qrUrl ?? webUrl}
                />
              </AlertDialog.Content>
            </RoomQrPortal>
          </AlertDialog.Root>
        )}
      </div>
      <RoomJoinMetadata join={join} />
      {isManager && (
        <>
          <div className="tz-lobby-count" data-testid="tadazz-lobby-count">
            <span>{t(text || "game:waitingForPlayers")}</span>{" "}
            <span>· {list.length}</span>
          </div>
          <div className="tz-lobby-players">
            {list.map((player) => (
              <NativeButton
                size="sm"
                type="button"
                key={player.id}
                className={[
                  "hover:bg-accent font-display bg-white text-black",
                  !player.connected && "is-lost",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={tx("kickPlayer", "Remove player")}
                onClick={() => kick(player.id)}
              >
                {player.username}
              </NativeButton>
            ))}
          </div>
        </>
      )}
      {!isManager && (
        <div className="tz-lobby-count">
          {t(text || "game:waitingForPlayers")}
        </div>
      )}
    </div>
  )
}
