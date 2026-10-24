import {
  answerVisualSchema,
  isSafeMediaUrl,
  type AnswerVisual,
} from "@razzia/extensions/core"
import { Check, X } from "lucide-react"
import type { ButtonHTMLAttributes } from "react"

export interface RichAnswerCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  text: string
  visual?: AnswerVisual
  colorClass?: string
  selected?: boolean
  correct?: boolean
  large?: boolean
}

const clsx = (...classes: unknown[]): string =>
  classes
    .flatMap((c) => {
      if (!c) {
        return []
      }

      if (typeof c === "string") {
        return [c]
      }

      if (Array.isArray(c)) {
        return [clsx(...(c as unknown[]))]
      }

      if (typeof c === "object") {
        return Object.entries(c)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
      }

      return []
    })
    .join(" ")

/**
 * Validates whether an AnswerVisual is safe and compliant with schema rules:
 * - Alt text is required and non-empty for image/both
 * - URL is required and safe (root-relative /media/ or HTTPS)
 */
export const isValidAnswerVisual = (
  visual: unknown,
): visual is AnswerVisual => {
  const result = answerVisualSchema.safeParse(visual)

  return result.success
}

/**
 * RichAnswerCard renders question answer choices supporting text, image, or both.
 * Maintains upstream answer label (A-D), upstream 4 colours, and preserves underlying
 * accessible answer text in the accessibility tree (aria-label and hidden text)
 * even when display is 'image' only.
 */
export const RichAnswerCard = ({
  label,
  text,
  visual,
  colorClass = "bg-primary",
  selected,
  correct,
  large = false,
  className,
  disabled,
  onClick,
  ...buttonProps
}: RichAnswerCardProps) => {
  const CorrectIcon = correct ? Check : X

  // Validate visual schema if provided
  const hasValidVisual = visual && isValidAnswerVisual(visual)
  const isImageValid = hasValidVisual && isSafeMediaUrl(visual.url)

  const displayMode = visual?.display ?? "text"
  const showImage =
    isImageValid && (displayMode === "image" || displayMode === "both")
  const showVisibleText = !showImage || displayMode === "both"

  // Accessible label combining choice letter, visible/hidden answer text, and image alt text
  const accessibleLabel = showImage
    ? `${label}: ${text} (${visual.alt})`
    : `${label}: ${text}`

  return (
    <button
      type="button"
      className={clsx(
        "relative flex rounded-2xl p-4 text-left transition-transform active:scale-[0.99] sm:py-6",
        colorClass,
        disabled && "cursor-not-allowed opacity-80",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label={accessibleLabel}
      {...buttonProps}
    >
      <div className="grid w-full grid-cols-[auto_1fr_auto] content-start items-center gap-x-3 gap-y-2 sm:content-center">
        {/* Answer Label (A, B, C, D) */}
        <span
          aria-hidden="true"
          className={clsx(
            "col-start-1 row-start-1 flex shrink-0 items-center justify-center rounded bg-black/20 font-bold text-white",
            large
              ? "size-7 text-base md:size-9 md:text-lg"
              : "size-5 text-sm sm:size-7 sm:rounded-md md:size-8 md:text-base",
          )}
        >
          {label}
        </span>

        {/* Content area: image, text, or both */}
        <div className="col-span-3 row-start-2 flex flex-col items-start gap-2 wrap-break-word drop-shadow-md sm:col-span-1 sm:col-start-2 sm:row-start-1">
          {showImage && (
            <div className="relative max-h-36 w-auto overflow-hidden rounded-lg bg-black/10">
              <img
                src={visual.url}
                alt={visual.alt}
                data-testid="rich-answer-image"
                className="max-h-36 w-auto rounded-lg object-contain"
                loading="lazy"
              />
            </div>
          )}

          {showVisibleText ? (
            <p
              className={clsx(
                "font-semibold text-white",
                large ? "text-lg md:text-2xl" : "text-sm md:text-lg",
              )}
            >
              {text}
            </p>
          ) : (
            // Accessible underlying text preserved for screen readers even in image-only display
            <span className="sr-only" data-testid="accessible-answer-text">
              {text}
            </span>
          )}
        </div>

        {/* Correct/Incorrect indicator icon */}
        {correct !== undefined && (
          <CorrectIcon
            aria-hidden="true"
            className="col-start-3 row-start-1 size-4 stroke-6 text-white md:size-6"
          />
        )}

        {/* Player selected indicator */}
        {selected !== undefined && correct === undefined && (
          <span
            aria-hidden="true"
            className={clsx(
              "col-start-3 row-start-1 flex shrink-0 items-center justify-center rounded-md",
              large ? "size-6 md:size-8" : "size-5 md:size-6",
              selected ? "bg-white text-black" : "bg-white/20 text-transparent",
            )}
          >
            {selected && (
              <Check
                className={clsx(
                  "stroke-5",
                  large ? "size-4 md:size-5" : "size-3 md:size-4",
                )}
              />
            )}
          </span>
        )}
      </div>
    </button>
  )
}
