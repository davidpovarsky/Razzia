import {
  StudioHeaderNavigation,
  StudioCardKindBar,
  StudioConversionDialog,
} from "./studio/header-controls"
import { useCompositeQuizzSave } from "./studio/use-composite-quizz-save"
import Button from "@razzia/web/components/Button"
import FieldError from "@razzia/web/components/forms/FieldError"
import Input from "@razzia/web/components/Input"
import { ConflictDialog } from "@razzia/web/features/quizz/components/ConflictDialog"
import clsx from "clsx"
import { Controller } from "react-hook-form"
import { useTranslation } from "react-i18next"

const QuizzEditorHeader = () => {
  const {
    control,
    conflict,
    setConflict,
    handleExit,
    handleSave,
    handleReloadConflict,
    handleForceOverwriteConflict,
  } = useCompositeQuizzSave()
  const { t } = useTranslation()

  return (
    <header className="bg-background border-border z-20 flex w-full max-w-full flex-col overflow-x-hidden border-b shadow-sm">
      {/* Row 1 / Top: Quiz Title + Studio Navigation Tabs + Exit / Save */}
      <div className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 px-3 py-1.5 sm:gap-4 sm:px-4">
        {/* Title input */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-4">
          <Controller
            control={control}
            name="subject"
            render={({ field, fieldState }) => (
              <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                <Input
                  {...field}
                  variant="sm"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? `${field.name}-error` : undefined
                  }
                  className={clsx(
                    "w-32 shrink-0 sm:w-48 md:w-56",
                    fieldState.invalid && "ring-2 ring-red-500",
                  )}
                  placeholder={t("quizz:titleQuizzPlaceholder")}
                />
                <FieldError
                  id={`${field.name}-error`}
                  errors={[fieldState.error]}
                />
              </div>
            )}
          />
        </div>

        {/* Center: Studio Screen Navigation Tabs */}
        <StudioHeaderNavigation />

        {/* Right: Exit and Save Buttons */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            className="bg-accent text-accent-foreground sm:text-md px-2.5 py-1.5 text-sm font-semibold sm:px-4 sm:py-2"
            onClick={handleExit}
            data-testid="editor-exit-btn"
          >
            {t("common:exit")}
          </Button>
          <Button
            type="button"
            className="bg-primary sm:text-md px-2.5 py-1.5 text-sm sm:px-4 sm:py-2"
            onClick={handleSave}
            data-testid="editor-save-btn"
          >
            {t("common:save")}
          </Button>
        </div>
      </div>

      {/* Row 2 / Directly below: contextual card-type ToggleGroup (Questions screen only) */}
      <StudioCardKindBar />

      <ConflictDialog
        open={Boolean(conflict)}
        serverRevision={conflict?.serverRevision}
        expectedRevision={conflict?.expectedRevision}
        onReload={handleReloadConflict}
        onOverwrite={handleForceOverwriteConflict}
        onCancel={() => setConflict(null)}
      />

      <StudioConversionDialog />
    </header>
  )
}

export default QuizzEditorHeader
