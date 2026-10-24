import type { Interlude } from "@razzia/extensions/core"
import { InterludePresenter } from "./interlude-presenter"

export interface InterludePreviewProps {
  interlude: Interlude
  className?: string
}

/**
 * InterludePreview renders an interactive mock presentation of an interlude for
 * use inside the editor and quiz settings panels.
 */
export const InterludePreview = ({
  interlude,
  className,
}: InterludePreviewProps) => (
  <div
    className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700"
    data-testid="interlude-preview-container"
  >
    <InterludePresenter
      interlude={interlude}
      serverStartedAt={Date.now()}
      isManager={false}
      className={className}
    />
  </div>
)
