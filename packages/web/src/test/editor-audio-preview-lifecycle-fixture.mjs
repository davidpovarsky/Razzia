import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { AudioCuesSection } from "../../../../extensions/src/editor/components/AudioCuesSection.tsx"
import { createDefaultQuizExtras } from "../../../../extensions/src/core/index.ts"
import { PlatformControlsProvider } from "../../../../extensions/src/presentation/platform-controls.tsx"
import Button from "../components/Button.tsx"
const audios = []

class ControlledAudio {
  constructor(url) {
    this.src = url
    this.volume = 1
    this.loop = false
    this.currentTime = 10
    this.paused = true
    this.pauseCalls = 0
    this.playCalls = 0
    this.onended = null
    this.onerror = null
    audios.push(this)
  }
  play() {
    this.playCalls++
    this.paused = false

    return new Promise((resolve, reject) => {
      this.resolvePlay = resolve
      this.rejectPlay = reject
    })
  }
  pause() {
    this.pauseCalls++
    this.paused = true
  }
}

window.Audio = ControlledAudio
const extras = createDefaultQuizExtras(
  "audio-preview-lifecycle",
  ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  "b".repeat(64),
)
const root = createRoot(document.getElementById("root"))
function mount() {
  root.render(
    createElement(
      PlatformControlsProvider,
      { Button },
      createElement(AudioCuesSection, {
        extras,
        onChange: () => {
          /* This preview fixture renders audio controls without persisting edits. */
        },
        tr: (_, fallback) => fallback,
      }),
    ),
  )
}
window.__audioHarness = { audios, mount, close: () => root.render(null) }
mount()
