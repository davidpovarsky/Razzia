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
        className="max-h-36 sm:max-h-56 md:max-h-72 w-auto max-w-full rounded-md object-contain"
      />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return (
      <video
        className="m-1 sm:m-2 aspect-video max-h-36 sm:max-h-56 md:max-h-72 w-auto max-w-full rounded-md px-2 object-contain"
        src={media.url}
        autoPlay={autoPlay}
        controls
      />
    )
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return (
      <audio
        className="m-1 sm:m-2 w-full max-w-md rounded-md"
        src={media.url}
        autoPlay={autoPlay}
        controls
      />
    )
  }

  return null
}

export default QuestionMedia
