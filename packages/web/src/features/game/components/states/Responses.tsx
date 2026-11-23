import { ChoiceResultsView } from "../tadazz-show/choice-results-view"
import { useResponseReveal } from "../tadazz-show/use-response-reveal"
import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import type { ExtensionStateEnvelope } from "@razzia/extensions/core"
import { useExtensionState } from "@razzia/web/features/game/contexts/extension-state-context"
import { SFX } from "@razzia/web/features/game/utils/constants"
import AnswerNote from "@razzia/web/features/game/components/AnswerNote"
import { useViewRole } from "@razzia/web/features/game/contexts/view-role-context"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
  extensionState?: ExtensionStateEnvelope | null
  hideHeading?: boolean
}

const Responses = ({
  data,
  extensionState: propExtensionState,
  hideHeading = false,
}: Props) => {
  const { question, type } = data
  const viewRole = useViewRole()
  const { ResponsesComponent } = QUESTION_REGISTRY[type]
  const contextExtensionState = useExtensionState()

  // Single authoritative extension state source: explicit prop (e.g. testing) or context/store
  const extensionState =
    propExtensionState !== undefined
      ? propExtensionState
      : contextExtensionState

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
  })

  const reveal = useResponseReveal(data, extensionState, sfxResults)

  // One manager-only explanation follows either existing result renderer.
  return (
    <>
      {ResponsesComponent ? (
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-8 pb-4">
          {!hideHeading && (
            <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
              {question}
            </h2>
          )}
          <ResponsesComponent data={data} />
        </div>
      ) : (
        <ChoiceResultsView
          data={data}
          extensionState={extensionState}
          reveal={reveal}
          hideHeading={hideHeading}
        />
      )}
      <AnswerNote note={data.note} isManager={viewRole === "manager"} />
    </>
  )
}

export default Responses
