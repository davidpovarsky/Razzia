import type { GameSettings } from "@razzia/common/types/game"
import Switch from "@razzia/web/components/Switch"
import SettingRow from "./SettingRow"
import { Users } from "lucide-react"
import { Controller, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"

export function EndOnAllAnsweredSetting() {
  const { control } = useFormContext<GameSettings>()
  const { t } = useTranslation()

  return (
    <Controller
      control={control}
      name="endOnAllAnswered"
      render={({ field }) => (
        <SettingRow
          label="extensions:host.endOnAllAnswered"
          hint="extensions:host.endOnAllAnsweredDesc"
        >
          <Switch
            aria-label={t("extensions:host.endOnAllAnswered")}
            data-testid="settings-end-on-all-answered"
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        </SettingRow>
      )}
    />
  )
}

export function RosterGameSettings({
  onOpenRoster,
  onClose,
}: {
  onOpenRoster?: () => void
  onClose: () => void
}) {
  const { control } = useFormContext<GameSettings>()
  const { t } = useTranslation()

  return (
    <>
      {" "}
      <Controller
        control={control}
        name="phoneInviteOnly"
        render={({ field }) => (
          <SettingRow
            label="extensions:roster.phoneInviteOnly"
            hint="extensions:roster.phoneInviteOnlyDesc"
          >
            <Switch
              aria-label={t(
                "extensions:roster.phoneInviteOnly",
                "Phone Invite Only",
              )}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
          </SettingRow>
        )}
      />
      {onOpenRoster && (
        <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => {
              onClose()
              onOpenRoster()
            }}
            className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-bold"
            data-testid="settings-open-roster-btn"
          >
            <Users className="size-4" />
            {t("extensions:roster.title", "Participants & Phone Roster")}
          </button>
        </div>
      )}
    </>
  )
}
