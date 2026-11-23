import { Button, DialogPortal } from "@razzia/extensions/platform-ui"
import { Keyboard, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export default function HostShortcutsDialog({
  compact = false,
}: {
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const shortcuts = [
    ["← ×2", "previousShortcut"],
    ["→ ×2", "nextShortcut"],
    [`${t("extensions:host.spaceKey")} ×2`, "pauseShortcut"],
    ["Enter ×2", "endTimerShortcut"],
    ["R ×2", "restartShortcut"],
    ["Esc", "escapeShortcut"],
  ]

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          type="button"
          aria-label={t("extensions:host.keyboardShortcuts")}
          title={t("extensions:host.keyboardShortcuts")}
          className="shrink-0 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-white shadow-md hover:bg-black/60"
          data-testid="host-shortcuts-btn"
        >
          <Keyboard className="size-4" />
          {!compact && t("extensions:host.keyboardShortcuts")}
        </Button>
      </Dialog.Trigger>
      <DialogPortal legacy>
        <Dialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="bg-background data-[state=open]:animate-fade fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-6 shadow-xl"
          data-testid="host-shortcuts-dialog"
        >
          <Dialog.Close
            aria-label={t("common:close")}
            className="hover:bg-muted text-muted-foreground hover:text-foreground absolute top-5 right-5 rounded-md p-1"
          >
            <X className="size-5" />
          </Dialog.Close>
          <Dialog.Title className="text-foreground pr-8 text-lg font-semibold">
            {t("extensions:host.keyboardShortcuts")}
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-2 text-sm">
            {t("extensions:host.doublePressHelp")}
          </Dialog.Description>
          <dl className="mt-4 space-y-3">
            {shortcuts.map(([keys, label]) => (
              <div key={label} className="flex items-start gap-4">
                <dt className="w-24 shrink-0">
                  <kbd className="bg-muted border-accent text-foreground font-display inline-block rounded-md border px-2 py-1 text-sm font-medium">
                    {keys}
                  </kbd>
                </dt>
                <dd className="text-foreground pt-1 text-sm">
                  {t(`extensions:host.${label}`)}
                </dd>
              </div>
            ))}
          </dl>
        </Dialog.Content>
      </DialogPortal>
    </Dialog.Root>
  )
}
