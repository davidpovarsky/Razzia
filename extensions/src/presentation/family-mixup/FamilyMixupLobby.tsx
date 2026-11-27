import { useTranslation } from "react-i18next"
import { AlertDialog } from "radix-ui"
import { PlatformButton } from "../platform-controls"
import type { RoomJoin } from "../room-join/contract"
import { RoomQrCode, RoomJoinMetadata, RoomQrPortal } from "../room-join/view"
import { FamilyFrame, FamilyEmblem } from "./FamilyMixupScene"

/** Presentation of the authoritative join contract; never invent pins or participant state. */
export function FamilyMixupLobby({
  join,
  players,
  isManager,
  onKick,
  text,
}: {
  join: RoomJoin
  players: ReadonlyArray<{ id: string; username: string; connected: boolean }>
  isManager: boolean
  onKick?: (id: string) => void
  text?: string
}) {
  const { t } = useTranslation()
  return (
    <FamilyFrame className="fm-lobby">
      <h1 className="fm-lobby-heading">Get the family together.</h1>
      <section
        className="fm-join-panel"
        data-testid="tadazz-screen-lobby"
        data-room-lock-state={join.lockState}
      >
        <div className="fm-join-details">
          <span className="fm-join-label">{t("game:joinInstruction")}</span>
          {join.showWeb && (
            <strong className="fm-join-host" dir="ltr">
              {join.host}
            </strong>
          )}
          {join.showPin && (
            <>
              <span className="fm-join-label">{t("game:gamePinLabel")}</span>
              <div
                className="fm-join-pin"
                data-testid="tadazz-lobby-pin"
                dir="ltr"
              >
                {join.displayPin}
              </div>
            </>
          )}
          {join.showPhone && (
            <div className="fm-join-phone" dir="ltr">
              {join.dialNumber ||
                t(
                  "extensions:tadazzShow.seating.noPhone",
                  "NUMBER NOT CONFIGURED",
                )}
            </div>
          )}
          <RoomJoinMetadata join={join} includePhone={false} />
        </div>
        {join.showQr && join.qrUrl && (
          <div className="fm-qr">
            <RoomQrCode value={join.qrUrl} size={240} level="M" />
          </div>
        )}
      </section>
      <p className="fm-lobby-note">
        {text || "Choose a name. Find your team. Get ready to play."}
      </p>
      <div className="fm-roster" data-testid="tadazz-lobby-players">
        <span className="fm-roster-label">
          {players.filter((player) => player.connected).length} connected
        </span>
        {players.map((player) => (
          <span
            className="fm-player"
            key={player.id}
            data-connected={player.connected}
          >
            <i aria-hidden="true" />
            <span dir="auto">{player.username}</span>
            {isManager && onKick && (
              <AlertDialog.Root>
                <AlertDialog.Trigger asChild>
                  <button
                    type="button"
                    aria-label={`Remove ${player.username}`}
                  >
                    ×
                  </button>
                </AlertDialog.Trigger>
                <RoomQrPortal>
                  <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
                  <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 text-slate-900">
                    <AlertDialog.Title className="text-xl font-bold">
                      Remove player?
                    </AlertDialog.Title>
                    <AlertDialog.Description className="my-4">
                      {player.username} will leave this game.
                    </AlertDialog.Description>
                    <div className="flex justify-end gap-3">
                      <AlertDialog.Cancel asChild>
                        <PlatformButton type="button">Cancel</PlatformButton>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action asChild>
                        <PlatformButton
                          type="button"
                          onClick={() => onKick(player.id)}
                        >
                          Remove
                        </PlatformButton>
                      </AlertDialog.Action>
                    </div>
                  </AlertDialog.Content>
                </RoomQrPortal>
              </AlertDialog.Root>
            )}
          </span>
        ))}
      </div>
      <FamilyEmblem hero />
    </FamilyFrame>
  )
}
