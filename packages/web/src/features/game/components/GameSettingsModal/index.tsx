import { zodResolver } from "@hookform/resolvers/zod"
import type { GameSettings } from "@razzia/common/types/game"
import { gameSettingsSchema } from "@razzia/common/validators/game"
import Button from "@razzia/web/components/Button"
import Tooltip from "@razzia/web/components/Tooltip"
import Switch from "@razzia/web/components/Switch"
import AutoAdvance from "@razzia/web/features/game/components/GameSettingsModal/AutoAdvance"
import GeneratedUsernames from "@razzia/web/features/game/components/GameSettingsModal/GeneratedUsernames"
import AnswersOnly from "@razzia/web/features/game/components/GameSettingsModal/AnswersOnly"
import SettingRow from "@razzia/web/features/game/components/GameSettingsModal/SettingRow"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { updateGameSettings } from "@razzia/web/features/manager/queries"
import { ApiError } from "@razzia/web/lib/api"
import { useMutation } from "@tanstack/react-query"
import { Settings, Users, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { useState } from "react"
import { Controller, FormProvider, useForm } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  onOpenRoster?: () => void
}

const GameSettingsModal = ({ onOpenRoster }: Props) => {
  const { gameId, settings, updateManager } = useManagerStore()
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  const form = useForm<GameSettings>({
    resolver: zodResolver(gameSettingsSchema),
    defaultValues: settings,
  })

  const { mutate: save, isPending } = useMutation({
    mutationFn: updateGameSettings,
    onSuccess: ({ settings: saved }) => {
      updateManager({ settings: saved })
      form.reset(saved)
      setOpen(false)
    },
    onError: (error) =>
      toast.error(
        t(error instanceof ApiError ? error.key : "errors:route.description"),
      ),
  })

  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset(settings)
    }

    setOpen(next)
  }

  const onSubmit = (values: GameSettings) => {
    if (!gameId) {
      return
    }

    save({ gameId, json: values })
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Tooltip content={t("game:settings.title")}>
        <Dialog.Trigger
          aria-label={t("game:settings.title")}
          className="flex items-center justify-center rounded-lg bg-black/40 px-2.5 text-white drop-shadow-md hover:bg-black/60"
        >
          <Settings className="size-5" />
        </Dialog.Trigger>
      </Tooltip>

      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/40" />

        <Dialog.Content
          aria-describedby={undefined}
          className="bg-background data-[state=open]:animate-fade fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl p-6 shadow-xl"
        >
          <Dialog.Close className="hover:bg-muted text-muted-foreground hover:text-foreground absolute top-5 right-5 rounded-md p-1">
            <X className="size-5" />
          </Dialog.Close>

          <Dialog.Title className="text-foreground shrink-0 pr-8 text-lg font-semibold">
            {t("game:settings.title")}
          </Dialog.Title>

          <FormProvider {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                <GeneratedUsernames />
                <AnswersOnly />
                <AutoAdvance />
                <Controller
                  control={form.control}
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
                        setOpen(false)
                        onOpenRoster()
                      }}
                      className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-bold"
                      data-testid="settings-open-roster-btn"
                    >
                      <Users className="size-4" />
                      {t(
                        "extensions:roster.title",
                        "Participants & Phone Roster",
                      )}
                    </button>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="mt-6 shrink-0"
                disabled={isPending}
              >
                {t("common:save")}
              </Button>
            </form>
          </FormProvider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default GameSettingsModal
