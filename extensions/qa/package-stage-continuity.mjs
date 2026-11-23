import fs from "node:fs/promises"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"

const source = process.env.TADAZZ_CONTINUITY_SOURCE
const dependencies = process.env.TADAZZ_CONTINUITY_DEPS
const themeSource = process.env.TADAZZ_CONTINUITY_THEME
const evidence = process.env.TADAZZ_CONTINUITY_EVIDENCE

if (!source || !dependencies || !themeSource || !evidence) {
  throw new Error(
    "Explicit isolated source, dependency, fixture and evidence paths required",
  )
}

const require = createRequire(
  path.join(dependencies, "extensions/package.json"),
)
const { build } = require("esbuild")
const { chromium } = createRequire(
  path.join(dependencies, "packages/e2e/package.json"),
)("@playwright/test")
await fs.mkdir(evidence, { recursive: true })
const stage =
  process.env.TADAZZ_CONTINUITY_STAGE ||
  path.join(
    source,
    "packages/web/src/features/game/components/tadazz-show/PackageStage.tsx",
  )
const runtime = path.join(source, "extensions/src/presentation/package-runtime")
const requestAuth = path.join(source, "packages/web/src/lib/request-auth.ts")
const js = JSON.stringify
const result = {
  fixture: "actual PackageStage, ThemeSandboxHost, SDK and BMS source",
  checks: [],
  clockChecks: [],
  expectedClockChecks: 2,
  network: "loopback-only",
  customerData: false,
}
const hostEntry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {PackageStage} from ${js(stage)};
const root = createRoot(document.getElementById('root'));
const phases=['opening','lobby','question','answerCards','voting','voteLocked','results','leaderboard','interlude','closing','personalResult'];
window.__theme={definition:{id:'bms-memory-files',runtime:{sourceDigest:'a'.repeat(64),buildDigest:'b'.repeat(64)},sandbox:{slots:Object.fromEntries(phases.map(x=>[x,'implemented'])),roles:['manager','spectator','player']}}};
window.__serverClockOffset=0;
window.__nativeFrames=0;
new MutationObserver(()=>{if(document.querySelector('[data-native-fixture]')) window.__nativeFrames++;}).observe(document.getElementById('root'),{childList:true,subtree:true});
let props;
window.__render=(phase,id='q1',extra={})=>{
 const question={key:id,question:'Who was the last speaker that we had in sem?',number:id==='q1'?1:2,totalQuestions:2,answerCount:3,options:phase==='question'?[]:[{label:'Answer one'},{label:'Answer two'},{label:'Answer three'}]};
 const base={key:phase+':'+id,question,questionType:'single'};
 let scene=phase==='wait'?{kind:'wait',key:'wait:question-content',text:''}:phase==='results'?{...base,kind:'results',reveal:{mode:'quiz',counts:[1,2,0],percentages:[33,67,0],solutions:[1]}}:phase==='question'?{...base,kind:'question'}:{...base,kind:'voting',answers:question.options.map(x=>x.label),seconds:25,remainingSeconds:25,totalPlayers:3};
 props={scene,roomId:'fixture-room',questionId:id,epoch:extra.epoch??1,sequence:1,role:extra.role??'manager',paused:!!extra.paused,canAnswer:extra.role==='player'&&phase==='voting',voteLocked:phase==='voteLocked',remainingMs:25000,deadline:Date.now()+window.__serverClockOffset+25000,serverTime:Date.now()+window.__serverClockOffset,serverClockOffset:window.__serverClockOffset,onSubmit:()=>window.__submitted=(window.__submitted??0)+1,onFallback:()=>window.__fallbacks=(window.__fallbacks??0)+1};
 flushSync(()=>root.render(<PackageStage {...props}><div data-native-fixture>Native question</div></PackageStage>));
};
window.__render('question');
`
const presentationStub = `
export {ThemeSandboxHost} from ${js(path.join(runtime, "ThemeSandboxHost.tsx"))};
export {createPackageQuestionAdmission,packageQuestionContentSupported,packageUsesSandboxForPhase} from ${js(path.join(runtime, "question-family.ts"))};
export {createPackageSceneContinuity} from ${js(path.join(runtime, "scene-continuity.ts"))};
export {packageRuntimePhase,projectPackageClock,projectPackageScene} from ${js(path.join(runtime, "projection.ts"))};
export function useShowTheme(){return window.__theme}
`
const aliases = {
  "@razzia/extensions/presentation": presentationStub,
  "@razzia/web/lib/session":
    "export async function ensureSession(){return {token:'fixture-only'}}",
  "react-i18next":
    "const t=(key)=>({ 'game:confirm':'Confirm','extensions:packages.phases.lobby':'Waiting','extensions:packages.phases.results':'Results','extensions:packages.theme':'Game' }[key]??key);const i18n={language:'en'};export function useTranslation(){return {t,i18n}}",
}
const plugin = {
  name: "isolated-platform-services",
  setup(builder) {
    builder.onResolve({ filter: /^@razzia\/web\/lib\/request-auth$/ }, () => ({
      path: requestAuth,
    }))
    builder.onResolve({ filter: /^\.\/session$/ }, (args) => {
      if (args.importer === requestAuth) {
        return { path: "@razzia/web/lib/session", namespace: "service" }
      }
    })

    builder.onResolve(
      { filter: /^(?:react(?:-dom)?(?:\/.*)?|zod)$/ },
      (args) => ({
        path: createRequire(
          path.join(dependencies, "packages/web/package.json"),
        ).resolve(args.path),
      }),
    )
    builder.onResolve(
      {
        filter:
          /^(?:@razzia\/extensions\/presentation|@razzia\/web\/lib\/session|react-i18next)$/,
      },
      (args) => ({ path: args.path, namespace: "service" }),
    )
    builder.onLoad({ filter: /.*/, namespace: "service" }, (args) => ({
      contents: aliases[args.path],
      loader: "ts",
      resolveDir: source,
    }))
  },
}
const common = {
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  plugins: [plugin],
  logLevel: "silent",
}
await build({
  ...common,
  stdin: { contents: hostEntry, loader: "tsx", resolveDir: source },
  outfile: path.join(evidence, "host.js"),
})
await build({
  ...common,
  stdin: {
    contents: `import Theme from ${js(path.join(themeSource, "entry.tsx"))};import {mount} from ${js(path.join(runtime, "sdk.tsx"))};window.__questionAnimations=0;document.addEventListener("animationstart",event=>{if(event.target?.matches?.(".bms-question-paper,.bms-question-title"))window.__questionAnimations++});mount(Theme);`,
    loader: "tsx",
    resolveDir: source,
  },
  outfile: path.join(evidence, "theme.js"),
})
const bundle = await fs.readFile(path.join(evidence, "host.js"))
const theme = await fs.readFile(path.join(evidence, "theme.js"))
const themeCss = await fs.readFile(path.join(evidence, "theme.css"))
let capabilityRequests = 0
let childPort = undefined

const child = http.createServer((request, response) => {
  if (request.url.startsWith("/theme.js")) {
    response.writeHead(200, { "Content-Type": "text/javascript" })
    response.end(theme)

    return
  }

  if (request.url.startsWith("/theme.css")) {
    response.writeHead(200, { "Content-Type": "text/css" })
    response.end(themeCss)

    return
  }

  response.writeHead(200, { "Content-Type": "text/html" })
  response.end(
    '<!doctype html><link rel="stylesheet" href="/theme.css"><div id="root"></div><script src="/theme.js"></script>',
  )
})
await new Promise((resolve) => {
  child.listen(0, "127.0.0.1", resolve)
})
childPort = child.address().port
const parent = http.createServer((request, response) => {
  if (request.url.startsWith("/api/packages/runtime/")) {
    capabilityRequests += 1

    setTimeout(() => {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(
        JSON.stringify({
          url: `http://127.0.0.1:${childPort}/?ticket=${capabilityRequests}`,
        }),
      )
    }, 250)

    return
  }

  if (request.url === "/host.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" })
    response.end(bundle)

    return
  }

  response.writeHead(200, { "Content-Type": "text/html" })
  response.end(
    '<!doctype html><style>html,body{margin:0}#root{width:1200px;height:675px}.h-full{height:100%}.w-full{width:100%}.relative{position:relative}iframe{display:block;border:0}</style><div id="root"></div><script src="/host.js"></script>',
  )
})
await new Promise((resolve) => {
  parent.listen(0, "127.0.0.1", resolve)
})
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
})
const page = await browser.newPage({ viewport: { width: 1200, height: 675 } })
await page.clock.install()
const errors = []
page.on("pageerror", (error) => {
  if (!error.message.includes("intentional-fixture-failure")) {
    errors.push(error.message)
  }
})
async function frame() {
  const iframe = page.locator('[data-testid="package-runtime-frame"]')
  await iframe.waitFor({ state: "visible" })
  const handle = await iframe.elementHandle()
  const current = await handle.contentFrame()
  await current.locator(".bms-question-title").waitFor({ state: "visible" })

  return current
}
async function capture() {
  const current = await frame()

  return current.evaluate(() => {
    const heading = document.querySelector(".bms-question-title")
    const panel = document.querySelector(".bms-question-paper")
    const box = heading.getBoundingClientRect()
    window.__originalHeading ??= heading
    window.__originalPanel ??= panel
    window.__originalAnswers ??= [
      ...document.querySelectorAll(".bms-answer-card"),
    ]

    if (!window.__originalAnswers.length) {
      window.__originalAnswers = [
        ...document.querySelectorAll(".bms-answer-card"),
      ]
    }

    window.__documentIdentity ??= crypto.randomUUID()

    return {
      document: window.__documentIdentity,
      questionAnimations: window.__questionAnimations,
      sameHeading: heading === window.__originalHeading,
      samePanel: panel === window.__originalPanel,
      sameAnswers: [...document.querySelectorAll(".bms-answer-card")].every(
        (node, i) => node === window.__originalAnswers[i],
      ),
      question: heading.textContent,
      geometry: [box.x, box.y, box.width, box.height].map(
        (n) => Math.round(n * 10) / 10,
      ),
      correct: [...document.querySelectorAll('[data-correct="true"]')].length,
    }
  })
}
function check(name, pass, details) {
  result.checks.push({ name, passed: Boolean(pass), ...details })
}

async function checkClockCalibration({ name, offset, ageSeconds, renew }) {
  await page.goto(`http://127.0.0.1:${parent.address().port}`)
  await frame()
  await page.waitForTimeout(600)
  const first = await capture()
  const requestsAtLaunch = capabilityRequests
  await page.evaluate((value) => {
    window.__serverClockOffset = value
    window.__render("question")
  }, offset)

  for (let second = 0; second < ageSeconds; second += 1) {
    await page.clock.runFor(1000)
    await page.evaluate(() => Promise.resolve())
  }

  const sameQuestion = await capture()
  await page.evaluate(() => window.__render("question", "q2", { epoch: 3 }))
  await page.waitForTimeout(750)
  const next = await capture()
  result.clockChecks.push({
    name,
    passed:
      sameQuestion.document === first.document &&
      next.document !== first.document &&
      capabilityRequests === requestsAtLaunch + Number(renew) &&
      errors.length === 0,
    offset,
    ageSeconds,
    requestsAtLaunch,
    capabilityRequests,
  })
}

try {
  await page.goto(`http://127.0.0.1:${parent.address().port}`)
  await frame()
  await page.waitForTimeout(600)
  const reading = await capture()
  const nativeFrames = await page.evaluate(() => window.__nativeFrames)
  check(
    "loading does not paint then replace a native question",
    nativeFrames === 0,
    { nativeFrames },
  )
  check("no correctness before reveal", reading.correct === 0, {
    correct: reading.correct,
  })
  await page.evaluate(() => window.__render("voting"))
  await page.waitForTimeout(600)
  const voting = await capture()
  check(
    "question and geometry persist when answers arrive",
    voting.document === reading.document &&
      voting.sameHeading &&
      voting.samePanel &&
      voting.questionAnimations === reading.questionAnimations &&
      JSON.stringify(voting.geometry) === JSON.stringify(reading.geometry),
    { reading, voting },
  )
  await page.evaluate(() => window.__render("wait", "q2", { epoch: 2 }))
  await page.waitForTimeout(80)
  await page.evaluate(() => window.__render("voting"))
  await page.waitForTimeout(600)
  const coherent = await capture()
  check(
    "staggered socket messages do not replace iframe or question",
    coherent.document === voting.document &&
      coherent.sameHeading &&
      coherent.sameAnswers,
    { coherent },
  )
  // Advance both parent and real SDK clocks together, flushing each heartbeat.
  // An instant wall-clock jump would intentionally trip runtime health checks.
  for (let second = 0; second < 241; second += 1) {
    await page.clock.runFor(1000)
    await page.evaluate(() => Promise.resolve())
  }
  await page.evaluate(() => window.__render("voteLocked"))
  await page.waitForTimeout(500)
  const locked = await capture()
  const beforeRevealRequests = capabilityRequests
  await page.evaluate(() => window.__render("results"))
  await page.waitForTimeout(600)
  const revealed = await capture()
  check(
    "expired launch ticket is not renewed inside question or reveal",
    capabilityRequests === 1 &&
      locked.document === coherent.document &&
      revealed.document === locked.document,
    { capabilityRequests, beforeRevealRequests },
  )
  check(
    "answers and question persist on correct reveal",
    revealed.document === coherent.document &&
      revealed.sameHeading &&
      revealed.samePanel &&
      revealed.sameAnswers &&
      revealed.questionAnimations === reading.questionAnimations &&
      JSON.stringify(revealed.geometry) === JSON.stringify(reading.geometry) &&
      revealed.correct === 1,
    { revealed },
  )
  await page.evaluate(() => window.__render("results", "q1", { paused: true }))
  await page.waitForTimeout(80)
  await page.evaluate(() => window.__render("results"))
  const resumed = await capture()
  check(
    "pause resume preserves question tree",
    resumed.document === revealed.document &&
      resumed.sameHeading &&
      resumed.sameAnswers,
    {},
  )
  await page.evaluate(() => window.__render("question", "q2", { epoch: 3 }))
  await page.waitForTimeout(750)
  const next = await capture()
  check(
    "new question can renew expired capability",
    capabilityRequests === 2 && next.document !== resumed.document,
    { capabilityRequests },
  )
  await (
    await frame()
  ).evaluate(() => {
    const broken = document.createElement("script")
    broken.textContent = 'throw new Error("intentional-fixture-failure")'
    document.head.append(broken)
  })
  await page.locator("[data-native-fixture]").waitFor({ state: "visible" })
  await page.evaluate(() => window.__render("voting", "q2", { epoch: 3 }))
  await page.waitForTimeout(100)
  check(
    "real SDK failure activates native fallback and stays latched",
    (await page.locator('[data-testid="package-runtime-frame"]').count()) ===
      0 && (await page.evaluate(() => window.__fallbacks > 0)),
    {},
  )
  check("no unexpected browser errors", errors.length === 0, { errors })
  await page.screenshot({ path: path.join(evidence, "fallback.png") })
  await checkClockCalibration({
    name: "forward calibration does not renew a fresh launch capability",
    offset: 600_000,
    ageSeconds: 0,
    renew: false,
  })
  await checkClockCalibration({
    name: "backward calibration does not reuse an expired launch capability",
    offset: -600_000,
    ageSeconds: 301,
    renew: true,
  })
  result.passed =
    result.checks.length === 10 &&
    result.checks.every((item) => item.passed) &&
    result.clockChecks.length === result.expectedClockChecks &&
    result.clockChecks.every((item) => item.passed)
} catch (error) {
  result.error = String(error)
  result.errors = errors
  result.dom = await page.locator("#root").innerHTML()
  result.passed = false
} finally {
  await browser.close()
  await new Promise((resolve) => {
    parent.close(resolve)
  })
  await new Promise((resolve) => {
    child.close(resolve)
  })
}

await fs.writeFile(
  path.join(evidence, "receipt.json"),
  JSON.stringify(result, null, 2),
)
console.log(JSON.stringify(result))

if (!result.passed) {
  process.exitCode = 1
}
