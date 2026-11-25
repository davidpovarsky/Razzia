import type { Interlude } from "@razzia/extensions/core"
import { useState } from "react"
import {
  InterludePresenter,
  type InterludePresenterLabels,
} from "./interlude-presenter"

export interface InterludePreviewProps {
  interlude: Interlude
  className?: string
  labels?: InterludePresenterLabels
}

/**
 * InterludePreview renders an interactive mock presentation of an interlude for
 * use inside the editor and quiz settings panels.
 * Preserves a stable startedAt timestamp so re-renders do not reset countdowns.
 */
export const InterludePreview = ({
  interlude,
  className,
  labels,
}: InterludePreviewProps) => {
  const [startedAt] = useState(() => Date.now())

  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700"
      data-testid="interlude-preview-container"
    >
      <InterludePresenter
        interlude={interlude}
        serverStartedAt={startedAt}
        isManager={false}
        labels={labels}
        className={className}
      />
    </div>
  )
}
