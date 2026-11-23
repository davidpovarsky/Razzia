import { resolveShowTheme } from "../../core/show-themes/resolve.ts"
import { applyThemeAudioDefaults } from "../../core/show-themes/audio.ts"
import type { FullShowFrameV3 } from "../contracts/full-show-frame.ts"

/** Show the exact effective value used by the existing native audio owner. */
export function fullShowVotingVolume(frame: FullShowFrameV3): number {
  const theme = resolveShowTheme({
    role: frame.inventory.context.role,
    selection: {
      id: frame.theme.id,
      version: frame.theme.version,
      overrides: { slots: frame.theme.slots, audio: frame.theme.audio },
    },
  })

  if (theme.diagnostics.length) {
    throw new Error("full-show:theme-resolution")
  }

  return applyThemeAudioDefaults(theme).cues.answersMusic.volume
}
