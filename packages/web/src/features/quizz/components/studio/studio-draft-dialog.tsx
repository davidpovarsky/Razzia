import Button from "@razzia/web/components/Button"
import { Dialog } from "radix-ui"
import { useTranslation } from "react-i18next"
import { useStudioEditor } from "./studio-editor-context"

export function StudioDraftDialog() {
  const { pendingDraft, pendingDraftStale, restoreDraft, discardDraft } =
    useStudioEditor()
  const { t, i18n } = useTranslation()

  return (
    <Dialog.Root open={Boolean(pendingDraft)}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="bg-background border-border fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          data-testid="studio-draft-recovery"
        >
          <Dialog.Title className="text-foreground text-lg font-semibold">
            {t("extensions:editor.draftRecoveryTitle")}
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-2">
            {t("extensions:editor.draftRecoveryDescription", {
              time: pendingDraft
                ? new Date(pendingDraft.savedAt).toLocaleString(i18n.language)
                : "",
            })}
          </Dialog.Description>
          {pendingDraftStale && (
            <p
              className="mt-3 text-sm text-amber-700 dark:text-amber-300"
              data-testid="studio-draft-stale"
            >
              {t("extensions:editor.draftServerChanged")}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              className="bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold"
              onClick={discardDraft}
              data-testid="studio-draft-discard"
            >
              {t("extensions:editor.discardDraft")}
            </Button>
            <Button
              type="button"
              className="bg-primary px-4 py-2 text-sm font-semibold"
              onClick={restoreDraft}
              data-testid="studio-draft-restore"
            >
              {t("extensions:editor.restoreDraft")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
