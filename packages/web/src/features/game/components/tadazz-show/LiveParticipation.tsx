import { Users } from "lucide-react"
import { useTranslation } from "react-i18next"

/** Public numeric status. This component never receives private roster data. */
export function LiveParticipation({
  connected,
  answered,
  voting,
}: {
  connected: number
  answered: number
  voting: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="tadazz-live-participation"
      className="font-display pointer-events-none absolute bottom-3 left-3 z-40 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-black/40 px-3 py-1.5 text-sm font-semibold text-white"
    >
      <span
        className="flex items-center gap-2"
        data-testid="tadazz-live-connected"
        data-count={connected}
      >
        <Users aria-hidden="true" style={{ width: "1em", height: "1em" }} />
        {t("extensions:tadazzShow.participation.connected", {
          count: connected,
        })}
      </span>
      {voting && (
        <span data-testid="tadazz-live-answered" data-count={answered}>
          {t("extensions:tadazzShow.participation.answered", {
            answered,
            connected,
          })}
        </span>
      )}
    </div>
  )
}
