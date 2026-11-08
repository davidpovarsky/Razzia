// JSX geometry ported from the supplied HTML. Live cards and copy are React props.
import type { ReactNode } from "react"
import type { StoryLabels } from "./story-labels"
export function RevealMarkup({
  cards,
  flyers,
  labels,
}: {
  cards: ReactNode
  flyers: ReactNode
  labels: StoryLabels
}) {
  return (
    <section
      className="theater"
      id="theater"
      aria-label="TADAZZ story reveal show and two-minute storytelling timer"
    >
      <img
        className="stage-art"
        src="/tadazz-show/story/fef87578b7d57eae.webp"
        draggable={false}
        alt=""
      />
      <div className="back-wall" aria-hidden="true">
        <div className="laser left"></div>
        <div className="laser right"></div>
      </div>
      <div className="reference-round">{labels.round}</div>
      <div className="floor-mask" aria-hidden="true"></div>
      <div className="old-caption-cover" aria-hidden="true" />
      <div className="stage-aura" aria-hidden="true"></div>
      <div className="spotlight spot-a" aria-hidden="true"></div>
      <div className="spotlight spot-b" aria-hidden="true"></div>
      <div className="spotlight spot-c" aria-hidden="true"></div>
      <div className="stage-ellipse" aria-hidden="true"></div>
      <canvas
        id="effects"
        className="effects"
        width="1600"
        height="900"
        aria-hidden="true"
      ></canvas>
      <div
        id="gallery"
        className="gallery"
        aria-label="The five pictures chosen for the story"
      >
        {cards}
      </div>
      <div id="flyingPictures" className="flying-pictures" aria-hidden="true">
        {flyers}
      </div>
      <div id="headline" className="headline" aria-hidden="true">
        <span className="headline-small">{labels.andNow}</span>
        <span className="headline-big">
          {labels.story}
          <span className="lime-exclamation">!</span>
        </span>
        <span className="headline-rule" />
      </div>
      <div id="bookSystem" className="book-system" aria-hidden="true">
        <div id="closedBook" className="closed-book">
          <div className="book-spine"></div>
          <div className="book-fore-edge"></div>
          <div className="closed-book-face">
            <div className="cover-ornament corner-tl">{"✦"}</div>
            <div className="cover-ornament corner-tr">{"✦"}</div>
            <div className="cover-label">{"TADAZZ"}</div>
            <div className="cover-logo" aria-hidden="true">
              <img src="/tadazz-show/story/7ff12046cb1aac7b.png" alt="" />
            </div>
            <div className="cover-title">{labels.story}</div>
            <div className="cover-ornament corner-bl">{"✦"}</div>
            <div className="cover-ornament corner-br">{"✦"}</div>
          </div>
        </div>
        <div id="openBook" className="open-book">
          <div className="book-glow"></div>
          <svg
            viewBox="0 0 750 340"
            role="presentation"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="coverLeft" x1="0" x2="1" y1="0" y2="1">
                <stop stopColor="#521795" />
                <stop offset=".5" stopColor="#250b49" />
                <stop offset="1" stopColor="#a541c8" />
              </linearGradient>
              <linearGradient id="coverRight" x1="0" x2="1" y1="0" y2="1">
                <stop stopColor="#431374" />
                <stop offset=".65" stopColor="#290a53" />
                <stop offset="1" stopColor="#8e25b8" />
              </linearGradient>
              <linearGradient id="paperL" x1=".14" x2=".9" y1="0" y2="1">
                <stop stopColor="#fffdf0" />
                <stop offset=".55" stopColor="#f1e3b8" />
                <stop offset="1" stopColor="#bd9b5b" />
              </linearGradient>
              <linearGradient id="paperR" x1="0" x2="1" y1="0" y2="1">
                <stop stopColor="#e4cd90" />
                <stop offset=".5" stopColor="#fff5d5" />
                <stop offset="1" stopColor="#ddc493" />
              </linearGradient>
              <linearGradient id="pageSide" x1="0" x2="0" y1="0" y2="1">
                <stop stopColor="#fff9d0" />
                <stop offset="1" stopColor="#ba792c" />
              </linearGradient>
              <filter id="bookShadow">
                <feGaussianBlur stdDeviation="11"></feGaussianBlur>
              </filter>
            </defs>
            <ellipse
              cx="375"
              cy="316"
              rx="327"
              ry="19"
              fill="#080119"
              opacity=".72"
              filter="url(#bookShadow)"
            />
            <path
              d="M377 78 Q210 13 22 74 L14 270 Q173 243 376 320Z"
              fill="url(#coverLeft)"
              stroke="#fecf62"
              strokeWidth="8"
            />
            <path
              d="M375 78 Q550 13 730 74 L741 270 Q578 243 375 320Z"
              fill="url(#coverRight)"
              stroke="#fecf62"
              strokeWidth="8"
            />
            <path
              d="M375 87 Q222 29 40 84 L33 261 Q202 240 375 305Z"
              fill="url(#pageSide)"
              stroke="#c39148"
              strokeWidth="2"
            />
            <path
              d="M375 87 Q536 29 708 84 L716 261 Q542 240 375 305Z"
              fill="url(#pageSide)"
              stroke="#c39148"
              strokeWidth="2"
            />
            <path
              d="M375 80 Q205 14 50 78 L43 244 Q204 229 375 286Z"
              fill="url(#paperL)"
              stroke="#f8e3aa"
              strokeWidth="3"
            />
            <path
              d="M375 80 Q547 14 700 78 L710 244 Q544 229 375 286Z"
              fill="url(#paperR)"
              stroke="#f8e3aa"
              strokeWidth="3"
            />
            <path
              d="M375 82 Q370 206 375 288"
              fill="none"
              stroke="#9d6c3f"
              strokeWidth="5"
            />
            <path
              d="M362 84 Q358 196 364 284 M389 84 Q391 194 387 285"
              fill="none"
              stroke="#f9e6b7"
              strokeWidth="2"
              opacity=".8"
            />
            <path
              d="M72 105 Q210 64 345 107 M72 124 Q210 84 345 128 M72 144 Q210 103 345 149 M72 164 Q210 124 345 167 M72 184 Q210 145 345 188 M72 204 Q210 167 345 207"
              stroke="#bd9361"
              strokeWidth="3"
              opacity=".38"
              fill="none"
            />
            <path
              d="M402 107 Q535 64 680 105 M402 128 Q535 84 680 124 M402 149 Q535 103 680 144 M402 167 Q535 124 680 164 M402 188 Q535 145 680 184 M402 207 Q535 167 680 204"
              stroke="#bd9361"
              strokeWidth="3"
              opacity=".38"
              fill="none"
            />
            <path
              d="M55 237 Q221 220 366 285 M395 285 Q548 220 696 237"
              fill="none"
              stroke="#a36d34"
              strokeWidth="3"
              opacity=".65"
            />
            <path
              d="M375 63 L381 42 L389 63 L407 70 L389 77 L381 97 L374 77 L357 70Z"
              fill="#eeff3b"
              opacity=".96"
            />
            <path
              d="M166 73 l5 -12 5 12 14 5 -14 5 -5 13 -5 -13 -13 -5Z M586 73 l4 -9 4 9 10 4 -10 4 -4 10 -4 -10 -10 -4Z"
              fill="#fdc962"
              opacity=".9"
            />
          </svg>
          <div className="turn-page turn-page-1"></div>
          <div className="turn-page turn-page-2"></div>
        </div>
        <div className="book-floor-shadow"></div>
      </div>
      <div id="introWords" className="intro-words">
        <span className="intro-and">{labels.andNow}</span>
      </div>
      <div id="centralBurstTitle" className="central-burst-title">
        <div className="burst-mini">{"AND NOW..."}</div>
        <div>
          {"THE STORY"}
          <span>{"!"}</span>
        </div>
      </div>
      <div id="curtainLeft" className="curtain curtain-left" aria-hidden="true">
        <div className="curtain-fringe"></div>
      </div>
      <div
        id="curtainRight"
        className="curtain curtain-right"
        aria-hidden="true"
      >
        <div className="curtain-fringe"></div>
      </div>
      <div id="curtainCenter" className="curtain-center" aria-hidden="true">
        <span className="curtain-seal">
          <img src="/tadazz-show/story/7ff12046cb1aac7b.png" alt="" />
        </span>
      </div>
      <div id="storyZRise" className="story-z-rise" aria-hidden="true">
        <img src="/tadazz-show/story/7ff12046cb1aac7b.png" alt="" />
      </div>
      <div
        id="stageWhiteout"
        className="stage-whiteout"
        aria-hidden="true"
      ></div>
      <div id="storyFooter" className="story-footer">
        <div className="footer-top-glint"></div>
        <div className="timer-label" id="timerLabel">
          {labels.time}
        </div>
        <div
          id="timerDigits"
          className="timer-digits"
          role="timer"
          aria-live="off"
        >
          {"2:00"}
        </div>
        <div className="timer-secondary" id="timerSecondary">
          {labels.unfolds}
        </div>
        <div className="timer-track">
          <div className="timer-progress" id="timerProgress"></div>
          <span id="timerDot" className="timer-dot"></span>
        </div>
      </div>
    </section>
  )
}
