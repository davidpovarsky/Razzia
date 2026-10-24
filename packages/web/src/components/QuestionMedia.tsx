import { MEDIA_TYPES } from "@razzia/common/constants"
import type { QuestionMedia as QuestionMediaType } from "@razzia/common/types/game"
import type { QuestionReveal } from "@razzia/extensions/core"
import { RevealMedia } from "@razzia/extensions/media"

interface Props {
  media?: QuestionMediaType
  alt?: string
  autoPlay?: boolean
  reveal?: QuestionReveal
  serverStartedAt?: number
  currentEpoch?: number
  isManager?: boolean
  isManuallyRevealed?: boolean
}

const QuestionMedia = ({
  media,
  alt = "",
  autoPlay = true,
  reveal,
  serverStartedAt,
  currentEpoch,
  isManager,
  isManuallyRevealed,
}: Props) => {
  if (media?.type === MEDIA_TYPES.IMAGE) {
    if (reveal && reveal.effect !== "none") {
      return (
        <RevealMedia
          src={media.url}
          alt={alt}
          reveal={reveal}
          serverStartedAt={serverStartedAt}
          currentEpoch={currentEpoch}
          isManager={isManager}
          isManuallyRevealed={isManuallyRevealed}
        />
      )
    }

    return (
      <img
        alt={alt}
        src={media.url}
        className="max-h-60 w-auto rounded-md sm:max-h-100"
      />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return (
      <video
        className="m-4 mb-2 aspect-video max-h-60 w-auto rounded-md px-4 sm:max-h-100"
        src={media.url}
        autoPlay={autoPlay}
        controls
      />
    )
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return (
      <audio
        className="m-4 mb-2 w-full max-w-md rounded-md"
        src={media.url}
        autoPlay={autoPlay}
        controls
      />
    )
  }

  return null
}

export default QuestionMedia
