import { ChoiceResultsView } from "../tadazz-show/choice-results-view"
import { useResponseReveal } from "../tadazz-show/use-response-reveal"
import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import type { ExtensionStateEnvelope } from "@razzia/extensions/core"
import { useExtensionState } from "@razzia/web/features/game/contexts/extension-state-context"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
  extensionState?: ExtensionStateEnvelope | null
}

const Responses = ({ data, extensionState: propExtensionState }: Props) => {
  const { question, type } = data
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

  // Specialized questions (e.g. estimation) retain their dedicated result renderer
  if (ResponsesComponent) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-8 pb-4">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {question}
        </h2>
        <ResponsesComponent data={data} />
      </div>
    )
  }

  return (
    <ChoiceResultsView
      data={data}
      extensionState={extensionState}
      reveal={reveal}
    />
  )
}

export default Responses
