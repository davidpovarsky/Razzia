import fs from "node:fs/promises"
import path from "node:path"
import http from "node:http"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { createHash } from "node:crypto"

const source = "/source/extensions/bms-memory-files"
const evidence = "/evidence/visual"
const deps = "/cleanup"
const require = createRequire(`${deps}/extensions/package.json`)
const webRequire = createRequire(`${deps}/packages/web/package.json`)
const { build } = require("esbuild")
const { chromium } = createRequire(`${deps}/packages/e2e/package.json`)(
  "@playwright/test",
)
await fs.mkdir(evidence, { recursive: true })
const fixtures = JSON.parse(
  await fs.readFile("/evidence/fixtures.json", "utf8"),
)
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import Theme from ${JSON.stringify(`${source}/theme/src/entry.tsx`)};window.__cspViolations=[];window.addEventListener('securitypolicyviolation',event=>window.__cspViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));const root=createRoot(document.getElementById('root'));window.__submissions=[];window.__render=(s)=>flushSync(()=>root.render(<Theme snapshot={s} asset={()=>''} submitAnswer={(a)=>window.__submissions.push(a)} requestAudioCue={()=>{}}/>));`
await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: "/source" },
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  target: ["chrome120", "safari17"],
  loader: { ".woff2": "dataurl" },
  outfile: `${evidence}/preview.js`,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "actual-platform-deps",
      setup(b) {
        b.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, (args) => ({
          path: webRequire.resolve(args.path),
        }))
      },
    },
  ],
})
const compiledScript = await fs.readFile(`${evidence}/preview.js`, "utf8")
const compiledStyle = await fs.readFile(`${evidence}/preview.css`, "utf8")
const cspHash = (value) =>
  `sha256-${createHash("sha256").update(value).digest("base64")}`
const policy = `default-src 'none'; script-src '${cspHash(compiledScript)}'; style-src '${cspHash(compiledStyle)}'; style-src-attr 'unsafe-inline'; img-src data:; font-src data:; media-src 'none'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`
const server = http.createServer(async (request, response) => {
  if (request.url === "/preview.js" || request.url === "/preview.css") {
    response.writeHead(200, {
      "Content-Type": request.url.endsWith(".js")
        ? "text/javascript"
        : "text/css",
    })
    response.end(await fs.readFile(`${evidence}${request.url}`))
  } else {
    response.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Security-Policy": policy,
    })
    response.end(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${compiledStyle}</style><div id="root"></div><script>${compiledScript}</script>`,
    )
  }
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
const base = {
  roomId: "layout-fixture",
  questionId: "q1",
  epoch: 1,
  sequence: 1,
  role: "manager",
  phase: "interlude",
  locale: "he",
  reducedMotion: false,
  title: "The Most Quizzical Quiz EVER!",
  question: "",
  answers: [],
  leaders: [],
  personalResult: null,
  serverTime: 0,
  deadline: null,
  remainingMs: 25000,
  paused: false,
  canAnswer: false,
  labels: { submit: "אישור", waiting: "ממתין", results: "תוצאות" },
}
const record = {
  fixture:
    "Actual BMS theme source and vendored libraries; synthetic public snapshots and roster; real game questions",
  checks: [],
  screenshots: [],
  network: "none (container loopback only)",
  errors,
}
const check = (name, pass, details = {}) => {
  record.checks.push({ name, pass: Boolean(pass), ...details })
}
const show = async (extra) => {
  await page.evaluate((s) => window.__render(s), { ...base, ...extra })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(100)
}
const snap = async (name) => {
  await page.screenshot({ path: `${evidence}/${name}.png` })
  record.screenshots.push(`${name}.png`)
}
const quiz = (index = 0) => {
  const q = fixtures.questions[index]
  return {
    questionId: q.key,
    questionNumber: index + 1,
    questionCount: fixtures.questions.length,
    question: q.question,
    answers: q.answers.map((a, i) => ({ id: String(i), label: a.text })),
  }
}
const geometry = async () =>
  page.locator('[data-testid="package-question"]').evaluate((el) => {
    const b = el.getBoundingClientRect()
    window.__questionNode ??= el
    return {
      same: el === window.__questionNode,
      box: [b.x, b.y, b.width, b.height],
      text: el.textContent,
    }
  })
const fits = async () =>
  page.evaluate(() => {
    const selectors = [
      ".bms-question",
      ".bms-answer-text",
      ".bms-answer-badges",
      ".bms-phone",
      ".bms-register-heading",
      ".bms-leader-name",
    ]
    return selectors.flatMap((selector) =>
      [...document.querySelectorAll(selector)]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          const box = el
            .closest(".bms-question-area,.bms-answer")
            ?.getBoundingClientRect()
          return (
            r.width &&
            r.height &&
            (r.left < -1 ||
              r.right > innerWidth + 1 ||
              r.top < -1 ||
              r.bottom > innerHeight + 1 ||
              el.scrollWidth > el.clientWidth + 2 ||
              el.scrollHeight > el.clientHeight + 2 ||
              (box &&
                (r.top < box.top - 1 ||
                  r.bottom > box.bottom + 1 ||
                  r.left < box.left - 1 ||
                  r.right > box.right + 1)))
          )
        })
        .map((el) => ({
          selector,
          text: el.textContent,
          scroll: [el.scrollWidth, el.scrollHeight],
          client: [el.clientWidth, el.clientHeight],
        })),
    )
  })
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await show({ phase: "interlude", cardTitle: base.title })
  await snap("title-1920")
  check(
    "BMS stays English under Hebrew account locale",
    (await page.locator("main").getAttribute("lang")) === "en-GB" &&
      !/[\u0590-\u05ff]/u.test(await page.locator("main").innerText()),
  )
  const roster = Array.from({ length: 30 }, (_, i) => ({
    id: `demo-${i}`,
    label: `Demo player ${String(i + 1).padStart(2, "0")}`,
    connected: i % 3 === 0,
  }))
  assert.ok(
    fixtures.lobby.instructions.length,
    "Use the candidate game's actual lobby instructions",
  )
  const lobby = {
    phase: "lobby",
    joinPhoneNumber: fixtures.lobby.dialNumber,
    joinCode: "123456",
    joinUrl: "https://fixture.invalid/game",
    lobbyInstructions: fixtures.lobby.instructions,
    roster,
  }
  await show(lobby)
  await page.waitForTimeout(500)
  await snap("lobby-register-1920")
  check(
    "phone only; room code and URL absent",
    (await page.locator("main").innerText()).includes(lobby.joinPhoneNumber) &&
      !(await page.locator("main").innerText()).includes("123456") &&
      !(await page.locator("main").innerText()).includes("fixture.invalid"),
  )
  check(
    "register can scroll an uploaded class list",
    await page
      .locator(".bms-register-list")
      .evaluate((el) => el.scrollHeight > el.clientHeight),
  )
  check(
    "connected rows carry a real Rough Notation marker",
    (await page
      .locator('li[data-connected="true"] .rough-annotation')
      .count()) === 10,
  )
  check(
    "Rough Notation marker animation finishes visibly under the platform style CSP",
    await page
      .locator('li[data-connected="true"] .rough-annotation path')
      .evaluateAll(
        (paths) =>
          paths.length > 0 &&
          paths.every(
            (path) =>
              Math.abs(parseFloat(getComputedStyle(path).strokeDashoffset)) <
              0.01,
          ),
      ),
  )
  const lobbyOverflow = await fits()
  check("desktop lobby text fits", !lobbyOverflow.length, {
    overflow: lobbyOverflow,
  })
  await page
    .locator('li[data-player-id="demo-0"] .rough-annotation')
    .evaluate((el) => {
      window.__marker = el
    })
  const updated = roster.map((player) => ({
    ...player,
    connected: player.connected || player.id === "demo-1",
  }))
  await show({ ...lobby, roster: updated })
  await page.waitForTimeout(450)
  check(
    "new connection updates attendance once without replaying existing marks",
    (await page
      .locator('li[data-connected="true"] .rough-annotation')
      .count()) === 11 &&
      (await page
        .locator('li[data-player-id="demo-0"] .rough-annotation')
        .evaluate((el) => el === window.__marker)),
  )
  await show({ ...lobby, roster: [] })
  await snap("lobby-phone-only-1920")
  check(
    "unattached roster is omitted",
    (await page.locator(".bms-register").count()) === 0,
  )
  const q = quiz(0)
  await show({ ...q, phase: "question" })
  const first = await geometry()
  await show({ ...q, phase: "answerCards" })
  const answers = await geometry()
  await page.locator(".bms-answer").evaluateAll((els) => {
    window.__answerNodes = els
  })
  await show({ ...q, phase: "voting", remainingMs: 5000 })
  await snap("question-three-1920")
  await show({ ...q, phase: "voteLocked" })
  const revealed = q.answers.map((a, i) => ({
    ...a,
    correct: i === 1,
    votes: i === 2 ? 0 : 5,
    percent: i === 2 ? 0 : 50,
  }))
  await show({
    ...q,
    phase: "results",
    revealStage: "pending",
    answers: revealed,
  })
  check(
    "pending reveal withholds labels and shares even with legacy eager payload",
    (await page.locator(".bms-correct-label,.bms-audience-label").count()) ===
      0 &&
      (await page
        .locator(".bms-answer-share")
        .allTextContents()
        .then((values) => values.every((value) => !value))),
  )
  await show({
    ...q,
    phase: "results",
    revealStage: "audience",
    answers: revealed,
  })
  await snap("audience-tie-1920")
  check(
    "engine audience stage shows tied choices without disclosing correctness",
    (await page.locator(".bms-correct-label").count()) === 0 &&
      (await page.locator(".bms-audience-label").count()) === 2,
  )
  await show({
    ...q,
    phase: "results",
    revealStage: "correct",
    answers: revealed,
  })
  const result = await geometry()
  await snap("reveal-tie-1920")
  check(
    "one question node with unchanged geometry across question, answers, lock, reveal",
    first.same &&
      answers.same &&
      result.same &&
      JSON.stringify(first.box) === JSON.stringify(answers.box) &&
      JSON.stringify(first.box) === JSON.stringify(result.box),
    { first, answers, result },
  )
  check(
    "answer nodes persist on reveal",
    await page
      .locator(".bms-answer")
      .evaluateAll((els) =>
        els.every((el, i) => el === window.__answerNodes[i]),
      ),
  )
  check(
    "correctness and tied audience choices attach only to answers",
    (await page.locator(".bms-answer .bms-correct-label").count()) === 1 &&
      (await page.locator(".bms-answer .bms-audience-label").count()) === 2 &&
      (await page
        .locator(
          ".bms-question .bms-correct-label,.bms-question .bms-audience-label",
        )
        .count()) === 0,
  )
  const resultOverflow = await fits()
  check("desktop result text and badges fit", !resultOverflow.length, {
    overflow: resultOverflow,
  })
  const largest = fixtures.questions.findIndex((q) => q.answers.length === 5)
  const five =
    largest >= 0
      ? quiz(largest)
      : {
          ...quiz(0),
          questionId: "five-answer-contract-fixture",
          answers: Array.from({ length: 5 }, (_, i) => ({
            id: String(i),
            label: `Sample answer ${i + 1}`,
          })),
        }
  await show({ ...five, phase: "voting" })
  await snap("question-five-1920")
  const fiveOverflow = await fits()
  check("five-answer desktop fits", !fiveOverflow.length, {
    overflow: fiveOverflow,
  })
  await page.setViewportSize({ width: 1366, height: 768 })
  await show({
    ...five,
    phase: "results",
    answers: five.answers.map((a, i) => ({
      ...a,
      correct: i === 0,
      percent: i === 0 ? 60 : 10,
    })),
  })
  await snap("reveal-five-1366")
  const laptopOverflow = await fits()
  check("laptop answers and result badges fit", !laptopOverflow.length, {
    overflow: laptopOverflow,
  })
  const questionOverflow = []
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    for (let i = 0; i < fixtures.questions.length; i++) {
      const current = quiz(i)
      await show({
        ...current,
        phase: "results",
        revealStage: "correct",
        answers: current.answers.map((answer, n) => ({
          ...answer,
          correct: n === 0,
          percent: n === 0 ? 70 : 10,
        })),
      })
      const overflow = await fits()
      if (overflow.length)
        questionOverflow.push({
          viewport,
          question: current.questionId,
          overflow,
        })
    }
  }
  check(
    "all 23 actual BMS questions and their original answers fit desktop, laptop, and phone",
    !questionOverflow.length,
    { overflow: questionOverflow },
  )
  await page.setViewportSize({ width: 1366, height: 768 })
  const leaders = [
    { label: "Demo player 01", rank: 1, score: 18400 },
    { label: "Demo player 04", rank: 2, score: 17950 },
    { label: "Demo player 12", rank: 3, score: 17200 },
    { label: "Demo player 09", rank: 4, score: 16700 },
    { label: "Demo player 06", rank: 5, score: 15900 },
  ]
  await show({ phase: "leaderboard", leaders, finalLeaderboard: true })
  await snap("final-1366")
  check(
    "one final standings screen, no duplicate finale overlay",
    (await page.locator(".bms-scene").count()) === 1 &&
      (await page.locator(".bms-final-celebration,.bms-finale").count()) === 0,
  )
  await show({ phase: "closing", leaders })
  check(
    "closing presentation remains platform-owned",
    (await page.locator(".bms-scene").count()) === 0,
  )
  await show({ phase: "opening" })
  check(
    "opening presentation remains platform-owned",
    (await page.locator(".bms-scene").count()) === 0,
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await show({ ...q, phase: "voting", role: "player", canAnswer: true })
  await snap("player-390")
  await page.locator(".bms-answer").first().click()
  check(
    "player submits once and controls lock",
    (await page.evaluate(() => window.__submissions.length)) === 1 &&
      (await page.locator(".bms-answer:not(:disabled)").count()) === 0,
  )
  const phoneOverflow = await fits()
  check("player phone content fits", !phoneOverflow.length, {
    overflow: phoneOverflow,
  })
  await show(lobby)
  await page.waitForTimeout(450)
  await snap("lobby-390")
  const phoneLobbyOverflow = await fits()
  check("phone lobby fits", !phoneLobbyOverflow.length, {
    overflow: phoneLobbyOverflow,
  })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await show({ phase: "interlude", reducedMotion: true })
  await snap("title-reduced-1920")
  await page.locator(".bms-scene,.bms-stage-frame").evaluateAll((els) =>
    els.forEach((el) => {
      el.style.visibility = "hidden"
    }),
  )
  await page.screenshot({ path: `${evidence}/stage-backdrop.png` })
  check("no unexpected browser errors", !errors.length)
  const violations = await page.evaluate(() => window.__cspViolations)
  check("no sandbox content-security-policy violations", !violations.length, {
    violations,
  })
} catch (error) {
  record.error = String(error)
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
record.passed = !record.error && record.checks.every((check) => check.pass)
await fs.writeFile(`${evidence}/receipt.json`, JSON.stringify(record, null, 2))
console.log(JSON.stringify(record))
if (!record.passed) process.exitCode = 1
