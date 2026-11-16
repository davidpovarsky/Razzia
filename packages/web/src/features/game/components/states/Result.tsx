import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { useEffect } from "react"
import { NativeRazziaPlayerResult } from "@razzia/extensions/presentation"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_RESULT"]
}

const Result = ({
  data: { correct, message, points, myPoints, rank, aheadOfMe },
}: Props) => {
  const { updatePlayer } = usePlayerStore()

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
  })

  useEffect(() => {
    updatePlayer(({ player }) => ({ player: { ...player, points: myPoints } }))

    sfxResults()
    // oxlint-disable-next-line
  }, [sfxResults])

  return (
    <NativeRazziaPlayerResult
      data={{ correct, message, points, myPoints, rank, aheadOfMe }}
    />
  )
}

export default Result
