import { useState } from "react"
import { createRoot } from "react-dom/client"
import { createDefaultQuizExtras } from "../core"
import { Button } from "../platform-ui/button"
import { AudioCuePlayer, type AudioControlState } from "./audio-cue-player"

const { audio } = createDefaultQuizExtras("manual-scope", [], "a".repeat(64))
audio.soundtrack = {
  recap: {
    mode: "media",
    url: "/tadazz-show/music/cutie-patootie.mp3",
    volume: 0.3,
    loop: true,
    fadeMs: 0,
    startOffsetSeconds: 0,
  },
  results: {
    mode: "media",
    url: "/tadazz-show/music/epic-main-menu.mp3",
    volume: 0.3,
    loop: true,
    fadeMs: 0,
    startOffsetSeconds: 0,
  },
}

function Controls(state: AudioControlState) {
  return (
    <select
      aria-label="Fixture music"
      data-testid="scope-music"
      value={state.track}
      onChange={(event) => state.setTrack(event.target.value)}
    >
      <option value="">Automatic</option>
      {state.tracks.map((track) => (
        <option key={track.value} value={track.value}>
          {track.label}
        </option>
      ))}
    </select>
  )
}

function Fixture() {
  const [screenKey, setScreenKey] = useState("authored-scene-a")
  const [redraw, setRedraw] = useState(0)

  return (
    <section
      data-testid="manual-scope-fixture"
      data-screen-key={screenKey}
      data-redraw={redraw}
    >
      <Button
        type="button"
        variant="unstyled"
        onClick={() => setScreenKey("authored-scene-a")}
      >
        First scene
      </Button>
      <Button
        type="button"
        variant="unstyled"
        onClick={() => setScreenKey("authored-scene-b")}
      >
        Second scene
      </Button>
      <Button
        type="button"
        variant="unstyled"
        onClick={() => setRedraw((value) => value + 1)}
      >
        Same screen
      </Button>
      <AudioCuePlayer
        gameId="synthetic-scope-game"
        activeCardKey="same-question"
        epoch={7}
        phase="scene"
        screenKey={screenKey}
        soundtrackSlot="recap"
        continuityKey="round-story"
        audioExtras={audio}
        autoPlay={false}
        showControls
        renderControls={Controls}
      />
    </section>
  )
}

export function mountAudioScopeFixture() {
  const element = document.createElement("div")
  element.style.cssText =
    "position:fixed;inset:0;z-index:999999;background:white;color:black;padding:24px"
  document.body.appendChild(element)
  const root = createRoot(element)
  root.render(<Fixture />)

  return () => {
    root.unmount()
    element.remove()
  }
}
