import Button from "@razzia/web/components/Button"
import { Redo2, Undo2 } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useStudioEditor } from "./studio-editor-context"

export function StudioHistoryControls({ disabled }: { disabled: boolean }) {
  const { canUndo, canRedo, undo, redo } = useStudioEditor()
  const { t } = useTranslation()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        disabled ||
        event.defaultPrevented ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey)
      ) {
        return
      }

      const { target } = event

      if (
        target instanceof HTMLElement &&
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
        )
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const wantsUndo = key === "z" && !event.shiftKey
      const wantsRedo = (key === "z" && event.shiftKey) || key === "y"

      if (wantsUndo && canUndo) {
        event.preventDefault()
        undo()
      } else if (wantsRedo && canRedo) {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [disabled, canUndo, canRedo, undo, redo])

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        size="sm"
        disabled={disabled || !canUndo}
        className="bg-accent text-accent-foreground p-2"
        aria-label={t("extensions:editor.undo")}
        title={t("extensions:editor.undo")}
        onClick={undo}
        data-testid="studio-undo"
      >
        <Undo2 className="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={disabled || !canRedo}
        className="bg-accent text-accent-foreground p-2"
        aria-label={t("extensions:editor.redo")}
        title={t("extensions:editor.redo")}
        onClick={redo}
        data-testid="studio-redo"
      >
        <Redo2 className="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </Button>
    </div>
  )
}
