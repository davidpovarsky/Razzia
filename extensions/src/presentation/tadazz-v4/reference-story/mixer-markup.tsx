// JSX geometry ported from the supplied HTML. Live cards and copy are React props.
import type { ReactNode } from "react"
import type { StoryLabels } from "./story-labels"

export function MixerMarkup({
  cards,
  flyers,
  labels,
}: {
  cards: ReactNode
  flyers: ReactNode
  labels: StoryLabels
}) {
  return (
    <section className="theater" id="theater" aria-label={labels.begin}>
      <img
        className="stage-art"
        src="/tadazz-show/story/fef87578b7d57eae.webp"
        alt=""
        draggable={false}
      />
      <div className="back-wall" aria-hidden="true">
        <div className="laser-left"></div>
        <div className="laser-right"></div>
      </div>
      <div className="reference-round">{labels.round}</div>
      <div className="stage-haze" aria-hidden="true"></div>
      <div className="light-spot spot-1" aria-hidden="true"></div>
      <div className="light-spot spot-2" aria-hidden="true"></div>
      <div className="light-spot spot-3" aria-hidden="true"></div>
      <div className="pulse-field" id="pulseField" aria-hidden="true"></div>
      <div className="card-row" id="cardRow" aria-label={labels.story}>
        {cards}
      </div>
      <canvas
        className="magic-layer"
        id="magicLayer"
        aria-hidden="true"
        width={1600}
        height={900}
      ></canvas>
      <div className="flight-layer" id="flightLayer" aria-hidden="true">
        {flyers}
      </div>
      <div className="countdown-big" id="countdownBig" aria-hidden="true"></div>
      <div className="bottom-marquee" aria-label={labels.begin}>
        <div className="marquee-shine" aria-hidden="true"></div>
        <div className="hero-title" id="heroTitle">
          {labels.begin}
          <span className="hero-punct">!</span>
        </div>
        <div className="timer-line">
          <div className="eyebrow" aria-hidden="true"></div>
          <div
            className="timer-digits"
            id="timerDigits"
            role="timer"
            aria-live="off"
          >
            {"1:00"}
          </div>
          <div className="eyebrow right-note" aria-hidden="true"></div>
        </div>
        <div className="timer-track">
          <div className="timer-track-fill" id="timerTrackFill"></div>
          <div className="timer-knob" id="timerKnob"></div>
        </div>
      </div>
      <div className="finish-message" id="finishMessage" aria-hidden="true">
        {labels.storytime}
      </div>
      <div className="final-whiteout" id="whiteout" aria-hidden="true"></div>
      <div className="live-sr" id="liveSr" aria-live="polite"></div>
    </section>
  )
}
