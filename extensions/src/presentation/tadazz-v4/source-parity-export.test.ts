import { describe, expect, it } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { join } from "node:path"
import fs from "node:fs"
import {
  CompanyOpening,
  GrandOpening,
  Directory,
  PhoneInstructions,
  Readiness,
  RoundLaunch,
  StoryCards,
  Tie,
  Finale,
  FullShowSceneView,
  BrandLogo,
} from "./FullShowScenes"
import { AnswerSlotV4, FivePictureAnswersV4, QuestionFrameV4 } from "./components"
import type { TadazzV4Answer, TadazzV4Data } from "./types"
import type { FullShowInput } from "./FullShowScenes"

const EVIDENCE_DIR = join(
  __dirname,
  "../../../../docs/extensions/qa-evidence/tadazz-next-source-parity-20261106",
)

const sampleAnswers: TadazzV4Answer[] = [
  {
    title: "The Brave Adventurer Exploring Ancient Crypts",
    imageUrl: "/tadazz-show/second-library/cards/pirate.svg",
    alt: "Choice 01",
  },
  {
    title: "Cybernetic Hacker Breaking Digital Fortresses",
    imageUrl: "/tadazz-show/second-library/cards/shadchan.svg",
    alt: "Choice 02",
  },
  {
    title: "Galactic Navigator Charting Unknown Stars",
    imageUrl: "/tadazz-show/second-library/cards/dog.svg",
    alt: "Choice 03",
  },
  {
    title: "Cunning Merchant Trading Across Dangerous Lands",
    imageUrl: "/tadazz-show/second-library/cards/therapist.svg",
    alt: "Choice 04",
  },
  {
    title: "Shadow Assassin Striking Silently In Night",
    imageUrl: "/tadazz-show/second-library/cards/lamplighter.svg",
    alt: "Choice 05",
  },
]

const baseInput: FullShowInput = {
  title: "Creating Worlds",
  subtitle: "Interactive Live Audience Experience",
  round: 1,
  completed: 2,
  dialNumber: "079-999-9999",
  connectedTables: [1, 2, 3, 5, 8, 12, 14],
  representatives: [
    { table: 1, name: "Sarah" },
    { table: 2, name: "David" },
    { table: 3, name: "Elena" },
    { table: 5, name: "Michael" },
  ],
  winners: sampleAnswers,
  contestants: [sampleAnswers[0], sampleAnswers[1]],
  voteCount: 42,
  resolvedIndex: null,
  groupPage: 0,
  storyRoles: [
    "THE HERO",
    "THE ALLY",
    "THE CRISIS",
    "THE CLIMAX",
    "THE RESOLUTION",
  ],
}

describe("Native React Show Source Parity & Visual Evidence Capture", () => {
  it("renders all scenes into a standalone HTML harness and captures 1920x1080 evidence", async () => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
    for (const answer of sampleAnswers) {
      expect(fs.existsSync(join(__dirname, '../../../../packages/web/public', answer.imageUrl!))).toBe(true)
    }

    const tzv4Css = fs.readFileSync(join(__dirname, "tadazz-v4.css"), "utf-8")
    const fullShowCss = fs.readFileSync(join(__dirname, "full-show.css"), "utf-8")
    const motionKitCss = fs.readFileSync(
      join(__dirname, "../tadazz-show/tadazz-motion-kit.css"),
      "utf-8",
    )

    // Render components for each scene
    const scenes: Record<string, string> = {
      "01_company_opening": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "company-opening" },
          React.createElement(CompanyOpening, { data: baseInput }),
        ),
      ),
      "02_grand_opening": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "grand-opening" },
          React.createElement(GrandOpening, { data: baseInput }),
        ),
      ),
      "03_representative_directory": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "representative-directory" },
          React.createElement(Directory, { data: baseInput }),
        ),
      ),
      "04_phone_instructions": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "phone-instructions" },
          React.createElement(PhoneInstructions, { data: baseInput }),
        ),
      ),
      "05_connection_readiness": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "connection-readiness" },
          React.createElement(Readiness, { data: baseInput }),
        ),
      ),
      "06_round_one": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "round-one" },
          React.createElement(RoundLaunch, { scene: "round-one", data: baseInput }),
        ),
      ),
      "07_picture_answers_cards": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage", "data-scene": "picture-answers" },
          React.createElement(
            "div",
            { className: "q-frame" },
            React.createElement("div", { className: "eyebrow" }, "ROUND 01 · QUESTION 01"),
            React.createElement("div", { className: "q-text" }, "Who is our main protagonist?"),
          ),
          React.createElement(FivePictureAnswersV4, {
            data: {
              ...baseInput,
              answers: sampleAnswers,
            },
            results: false,
          }),
        ),
      ),
      "08_voting_open": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage", "data-scene": "voting-open" },
          React.createElement(
            "div",
            { className: "q-frame" },
            React.createElement("div", { className: "eyebrow" }, "VOTING OPEN · CAST YOUR CHOICE"),
            React.createElement("div", { className: "q-text" }, "Who is our main protagonist?"),
          ),
          React.createElement(FivePictureAnswersV4, {
            data: {
              ...baseInput,
              answers: sampleAnswers,
            },
            results: false,
          }),
        ),
      ),
      "09_chosen_highlight": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage", "data-scene": "chosen" },
          React.createElement(
            "div",
            { className: "q-frame" },
            React.createElement("div", { className: "eyebrow" }, "CHOICE SELECTED · 75% AUDIENCE FAVOURITE"),
            React.createElement("div", { className: "q-text" }, "Who is our main protagonist?"),
          ),
          React.createElement(FivePictureAnswersV4, {
            data: {
              ...baseInput,
              answers: sampleAnswers,
              percentages: [25, 0, 0, 75, 0],
              counts: [5, 0, 0, 15, 0],
              selectedIndex: 3,
              selectedIndices: [3],
            },
            results: true,
          }),
        ),
      ),
      "10_survey_results_tracks": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage", "data-scene": "survey-results" },
          React.createElement(
            "div",
            { className: "q-frame" },
            React.createElement("div", { className: "eyebrow" }, "AUDIENCE RESULTS"),
            React.createElement("div", { className: "q-text" }, "Who is our main protagonist?"),
          ),
          React.createElement(FivePictureAnswersV4, {
            data: {
              ...baseInput,
              answers: sampleAnswers,
              percentages: [25, 0, 0, 75, 0],
              counts: [5, 0, 0, 15, 0],
            },
            results: true,
          }),
        ),
      ),
      "11_story_progress": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "story-progress" },
          React.createElement(FullShowSceneView, { scene: "story-progress", data: baseInput }),
        ),
      ),
      "12_tie_break": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "tie-break" },
          React.createElement(Tie, { data: baseInput }),
        ),
      ),
      "13_story_assembly": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "story-assembly" },
          React.createElement(FullShowSceneView, { scene: "story-assembly", data: baseInput }),
        ),
      ),
      "14_story_live": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "story-live" },
          React.createElement(FullShowSceneView, { scene: "story-live", data: baseInput }),
        ),
      ),
      "15_round_two": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "round-two" },
          React.createElement(RoundLaunch, { scene: "round-two", data: baseInput }),
        ),
      ),
      "16_grand_finale_curtains": renderToString(
        React.createElement(
          "div",
          { className: "tzv4-stage stage-show", "data-scene": "grand-finale" },
          React.createElement(Finale, { data: baseInput }),
        ),
      ),
    }

    // Build self-contained HTML harness
    const harnessHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Native React TADAZZ Show Parity Harness</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&display=swap');
    html, body { margin: 0; padding: 0; background: #08001d; overflow: hidden; width: 1920px; height: 1080px; font-family: 'Rubik', sans-serif; }
    ${tzv4Css}
    ${fullShowCss}
    ${motionKitCss}
    .scene-container { display: none; width: 1920px; height: 1080px; position: relative; }
    .scene-container.active { display: block; }
  </style>
</head>
<body>
  ${Object.entries(scenes)
    .map(
      ([key, html]) =>
        `<div id="scene-${key}" class="scene-container" data-scene-id="${key}">${html}</div>`,
    )
    .join("\n")}
  <script>
    window.showScene = function(key) {
      document.querySelectorAll('.scene-container').forEach(el => el.classList.remove('active'));
      const target = document.getElementById('scene-' + key);
      if (target) target.classList.add('active');
    };
  </script>
</body>
</html>`

    const harnessPath = join(EVIDENCE_DIR, "native_scenes_harness.html")
    fs.writeFileSync(harnessPath, harnessHtml, "utf-8")
    expect(fs.existsSync(harnessPath)).toBe(true)

    // Verify DOM structure in rendered strings:
    // 1. FivePictureAnswersV4 contains figure.answer-figure and figcaption.answer-title
    expect(scenes["07_picture_answers_cards"]).toContain("figure class=\"answer-figure\"")
    expect(scenes["07_picture_answers_cards"]).toContain("figcaption class=\"answer-title\"")
    expect(scenes["07_picture_answers_cards"]).not.toContain("corner answer-card-badge")
    expect(scenes["07_picture_answers_cards"]).toContain('class="answer-index">01</div>')

    // 2. Results scene contains percentage tracks and numbers
    expect(scenes["10_survey_results_tracks"]).toContain("result-percentage")
    expect(scenes["10_survey_results_tracks"]).toContain("75%")
    expect(scenes["10_survey_results_tracks"]).toContain("25%")

    // 3. Finale contains curtains and shock/bloom
    expect(scenes["16_grand_finale_curtains"]).toContain("full-curtain left")
    expect(scenes["16_grand_finale_curtains"]).toContain("full-curtain right")
    expect(scenes["16_grand_finale_curtains"]).toContain("full-curtain-seam")
  })
})
