import fs from "node:fs/promises"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"

const source = process.env.TADAZZ_HANDOFF_SOURCE
const deps = process.env.TADAZZ_HANDOFF_DEPS
const evidence = process.env.TADAZZ_HANDOFF_EVIDENCE
const adapterOverride = process.env.TADAZZ_HANDOFF_ADAPTER
if (!source || !deps || !evidence)
  throw new Error("Explicit isolated source/deps/evidence required")
const require = createRequire(path.join(deps, "extensions/package.json"))
const { build } = require("esbuild")
const { chromium } = createRequire(
  path.join(deps, "packages/e2e/package.json"),
)("@playwright/test")
const adapter = path.join(
  source,
  "extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx",
)
const director = path.join(
  source,
  "extensions/src/presentation/tadazz-show/show-director.ts",
)
const audioOwner = path.join(
  source,
  "extensions/src/presentation/audio-cue-player.tsx",
)
const timerEvents = path.join(
  source,
  "extensions/src/presentation/show-themes/timer-events.ts",
)
await fs.mkdir(evidence, { recursive: true })
const entry = `
import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {TadazzV4StageAdapter} from ${JSON.stringify(adapter)};
import {planTransition,runSteps} from ${JSON.stringify(director)};
import {AudioCuePlayer} from ${JSON.stringify(audioOwner)};
import {startCountdownCue} from ${JSON.stringify(timerEvents)};
const q1={key:'first#1',question:'FIRST QUESTION',number:1,totalQuestions:23,answerCount:3,options:[]};
const options=[{label:'Alpha'},{label:'Bravo'},{label:'Charlie'}];
function App(){
 const stage=useRef(null);const previous=useRef(null);const [custom,setCustom]=useState(null);
 const [guessOff,setGuessOff]=useState(false);const cues=useRef([]);
 const [audio,setAudio]=useState({gameId:'start-audio',epoch:1,seconds:5,role:'manager',paused:false});
 const startTick=()=>{const detail=startCountdownCue(audio);if(detail)window.dispatchEvent(new CustomEvent('tadazz:sfx',{detail}))};
 const drive=async(next)=>{
   // The live director intentionally ignores this split-delivery placeholder.
   if(next.kind==='wait'&&next.key==='wait:question-content')return;
   const handle=stage.current;
   const steps=planTransition(previous.current,next,{questionKey:handle.questionKey,mode:handle.mode});
   previous.current=next;await runSteps(handle,steps,()=>true);
 };
 window.handoff={
  async results(){
   await drive({kind:'question',key:'question:q1',question:q1});
   await drive({kind:'voting',key:'voting:q1',question:{...q1,options},seconds:null});
   await drive({kind:'results',key:'results:q1',question:{...q1,options},reveal:{mode:'quiz',counts:[1,2,0],percentages:[33,67,0],solutions:[1]}});
  },
  async prepared(){
   flushSync(()=>setCustom(<div data-testid="handoff-prepared" style={{fontSize:90,color:'white',fontFamily:'sans-serif'}}>QUESTION 2</div>));
   await drive({kind:'prepared',key:'prepared:2',questionNumber:2,totalAnswers:3});
  },
  async gap(){
   flushSync(()=>setCustom(null));
   await drive({kind:'wait',key:'wait:question-content',text:'game:waitingForAnswers'});
  },
  async next(){
   flushSync(()=>setCustom(null));
   await drive({kind:'question',key:'question:q2',question:{...q1,key:'second#2',number:2,question:'SECOND QUESTION'}});
  },
  async directNext(){
   await stage.current.nextQuestion({...q1,key:'third#3',number:3,question:'THIRD QUESTION'});
  },
  async newCustom(){
   flushSync(()=>setCustom(<div data-testid="handoff-prepared" style={{fontSize:90,color:'white'}}>QUESTION 4</div>));
   await stage.current.showCustomScreen();
  },
  async authored(next){
   flushSync(()=>setCustom(<div data-testid="unexpected-native-overlay">STALE CUSTOM TITLE</div>));
   await drive(next);
  },
  rerenderCustom(){
   flushSync(()=>setCustom(<div data-testid="unexpected-native-overlay">REFRESHED CUSTOM TITLE</div>));
  },
  async choices(count,look){
   flushSync(()=>{setCustom(null);setGuessOff(look)});
   const question={...q1,key:'choices-'+count+'-'+look,question:'Which option do you choose?',number:count,answerCount:count,options:Array.from({length:count},(_,i)=>({label:['A walk by the river','An evening with friends','A homemade celebration','Exploring somewhere new','A quiet afternoon'][i]}))};
   await drive({kind:'question',key:'question:'+question.key,question:{...question,options:[]}});
   await drive({kind:'voting',key:'voting:'+question.key,question,seconds:null});
   cues.current=[];
  },
  async choiceResults(){
   const question=previous.current.question;
   await drive({kind:'results',key:'results:'+question.key,question,reveal:{mode:'quiz',counts:question.options.map((_,i)=>i+1),solutions:[1]}});
  },
  cues:()=>cues.current.map(cue=>cue.name),
  audioState:(next)=>flushSync(()=>setAudio(current=>({...current,...next}))),
  mode:()=>stage.current?.mode,
 };
 return <div style={{width:'100%',height:'100%'}} data-guess-off-stage={guessOff?'true':undefined} data-guess-off-media={guessOff?'text':undefined}><TadazzV4StageAdapter ref={stage} customScreen={custom} guessOffLook={guessOff} onCue={cue=>cues.current.push(cue)}/><div style={{position:'fixed',top:0,left:0,zIndex:1000,background:'white',color:'black'}}><AudioCuePlayer eventOnly={audio.role==='player'} paused={audio.paused} autoPlay={false} showControls/><button data-testid="start-audio-tick" onClick={startTick}>Server start tick</button></div></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
`
const resolveModule = createRequire(
  path.join(deps, "packages/web/package.json"),
)
const plugins = [
  {
    name: "isolated-native-source",
    setup(builder) {
      builder.onResolve(
        {
          filter:
            /^(?:react(?:-dom)?(?:\/.*)?|zod|clsx|tailwind-merge|lucide-react|framer-motion|motion(?:\/.*)?)$/,
        },
        (args) => ({ path: resolveModule.resolve(args.path) }),
      )
      builder.onResolve({ filter: /^@razzia\// }, async (args) => {
        const [, scope, ...parts] = args.path.split("/")
        const base =
          scope === "extensions"
            ? path.join(source, "extensions/src")
            : path.join(source, "packages", scope, "src")
        const requested = path.join(base, ...parts)
        for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
          const candidate = requested + suffix
          try {
            if ((await fs.stat(candidate)).isFile()) return { path: candidate }
          } catch {}
        }
        throw new Error("Unresolved candidate workspace import " + args.path)
      })
      builder.onResolve({ filter: /^[^./]/ }, (args) => ({
        path: resolveModule.resolve(args.path),
      }))
      if (adapterOverride)
        builder.onLoad(
          { filter: /TadazzV4StageAdapter\.tsx$/ },
          async (args) =>
            args.path === adapter
              ? {
                  contents: await fs.readFile(adapterOverride, "utf8"),
                  loader: "tsx",
                  resolveDir: path.dirname(adapter),
                }
              : undefined,
        )
    },
  },
]
await build({
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  plugins,
  logLevel: "silent",
  external: ["/tadazz-show/*"],
  loader: { ".woff2": "file", ".png": "file", ".jpg": "file", ".svg": "file" },
  define: { "process.env.NODE_ENV": '"production"' },
  stdin: { contents: entry, loader: "tsx", resolveDir: source },
  outfile: path.join(evidence, "fixture.js"),
})
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost")
    let file
    if (url.pathname === "/fixture.js" || url.pathname === "/fixture.css")
      file = path.join(evidence, url.pathname.slice(1))
    else if (
      url.pathname.startsWith("/tadazz-show/") ||
      url.pathname.startsWith("/sounds/")
    )
      file = path.join(source, "packages/web/public", url.pathname.slice(1))
    else {
      response.writeHead(200, { "Content-Type": "text/html" })
      response.end(
        '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:#101a31}</style><div id="root"></div><script src="/fixture.js"></script>',
      )
      return
    }
    const mime = file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".css")
        ? "text/css"
        : file.endsWith(".mp3")
          ? "audio/mpeg"
          : file.endsWith(".png")
            ? "image/png"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : file.endsWith(".woff2")
                ? "font/woff2"
                : "image/jpeg"
    response.writeHead(200, { "Content-Type": mime })
    response.end(await fs.readFile(file))
  } catch {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
})
const result = {
  fixture:
    "actual TadazzV4StageAdapter + show-director; no altered animation clock",
  source,
  adapterOverride: adapterOverride ?? null,
  checks: [],
  customerData: false,
  network: "container loopback only",
}
function check(name, passed, details = {}) {
  result.checks.push({ name, passed: Boolean(passed), ...details })
}
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.addInitScript(() => {
    window.audioAttempts = []
    window.startAudioElements = []
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (...args) {
      if (this instanceof HTMLAudioElement) {
        window.audioAttempts.push({ src: this.src, volume: this.volume })
        if (!window.startAudioElements.includes(this))
          window.startAudioElements.push(this)
      }
      return play.apply(this, args)
    }
  })
  await page.goto("http://127.0.0.1:" + server.address().port)
  await page.waitForFunction(() => window.handoff?.mode())
  const startAttemptCount = () =>
    page.evaluate(
      () =>
        window.audioAttempts.filter((item) =>
          item.src.endsWith("/sounds/boump.mp3"),
        ).length,
    )
  await page.getByTestId("start-audio-tick").click()
  await page.waitForFunction(() =>
    window.startAudioElements.some(
      (audio) =>
        audio.src.endsWith("/sounds/boump.mp3") && audio.currentTime > 0,
    ),
  )
  check(
    "start countdown retains the original recording through the shared owner",
    (await startAttemptCount()) === 1,
  )
  await page.getByTestId("start-audio-tick").click()
  await page.evaluate(() => window.handoff.rerenderCustom())
  await page.getByTestId("start-audio-tick").click()
  check(
    "duplicate server start ticks and re-renders do not replay the effect",
    (await startAttemptCount()) === 1,
  )
  await page.getByTestId("host-toggle-audio-mute").click()
  await page.evaluate(() => window.handoff.audioState({ seconds: 4 }))
  await page.getByTestId("start-audio-tick").click()
  check(
    "master mute silences the start countdown",
    (await startAttemptCount()) === 1,
  )
  await page.getByTestId("host-toggle-audio-mute").click()
  await page.evaluate(() => window.handoff.audioState({ paused: true }))
  await page.getByTestId("start-audio-tick").click()
  check(
    "paused shows emit no start countdown playback",
    (await startAttemptCount()) === 1,
  )
  await page.evaluate(() =>
    window.handoff.audioState({ paused: false, role: "player" }),
  )
  await page.getByTestId("start-audio-tick").click()
  check(
    "player views do not start a second countdown sound",
    (await startAttemptCount()) === 1,
  )
  await page.evaluate(() => window.handoff.audioState({ role: "manager" }))
  await page.getByTestId("start-audio-tick").click()
  check(
    "resumed host plays the next current tick once",
    (await startAttemptCount()) === 2,
  )
  await page.evaluate(() => window.handoff.results())
  await page
    .locator('[data-testid="tadazz-question-panel"] .q-text')
    .waitFor({ state: "visible" })
  check(
    "chosen/correct results keep exactly one question",
    (await page.locator('[data-testid="tadazz-question-panel"]').count()) === 1,
  )
  await page.evaluate(() => window.handoff.prepared())
  await page
    .locator('[data-testid="handoff-prepared"]')
    .waitFor({ state: "visible" })
  await page.evaluate(() => {
    window.preparedNode = document.querySelector(
      '[data-testid="handoff-prepared"]',
    )
    window.gapFrames = { total: 0, empty: 0, changed: 0 }
    window.sampleGap = true
    const sample = () => {
      if (!window.sampleGap) return
      const n = document.querySelector('[data-testid="handoff-prepared"]')
      window.gapFrames.total++
      if (!n || n.getBoundingClientRect().width === 0) window.gapFrames.empty++
      if (n !== window.preparedNode) window.gapFrames.changed++
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.evaluate(() => window.handoff.gap())
  await page.waitForTimeout(900)
  const observed = await page.evaluate(() => {
    window.sampleGap = false
    return {
      ...window.gapFrames,
      mode: window.handoff.mode(),
      text: document
        .querySelector('[data-testid="tadazz-custom-screen"]')
        ?.textContent?.trim(),
    }
  })
  check(
    "prepared content remains painted through split socket handoff",
    observed.total >= 3 &&
      observed.empty === 0 &&
      observed.changed === 0 &&
      observed.text === "QUESTION 2",
    { observed },
  )
  await page.screenshot({ path: path.join(evidence, "handoff-gap.png") })
  await page.evaluate(() => window.handoff.next())
  await page
    .locator('[data-testid="tadazz-question-panel"] .q-text')
    .waitFor({ state: "visible" })
  const after = await page.evaluate(() => ({
    text: document.querySelector(".q-text")?.textContent?.trim(),
    prepared:
      document.querySelector('[data-testid="handoff-prepared"]') !== null,
    mode: window.handoff.mode(),
    count: document.querySelectorAll('[data-testid="tadazz-question-panel"]')
      .length,
  }))
  check(
    "next question replaces retained custom card once",
    after.text === "SECOND QUESTION" &&
      !after.prepared &&
      after.count === 1 &&
      after.mode === "question",
    { after },
  )
  await page.evaluate(() => window.handoff.directNext())
  check(
    "direct native question handoff still completes",
    (await page.locator(".q-text").innerText()) === "THIRD QUESTION",
  )
  await page.evaluate(() => window.handoff.newCustom())
  check(
    "new authored custom content replaces old retained content",
    (await page.locator('[data-testid="handoff-prepared"]').innerText()) ===
      "QUESTION 4",
  )
  const authoredCases = [
    { name: "opening", scene: { kind: "opening" }, expectedMode: "intro" },
    {
      name: "populated leaderboard",
      scene: { kind: "leaderboard", title: "LEADERBOARD" },
      data: {
        leaderboard: { entries: [{ displayName: "Player A", points: 120 }] },
      },
      expectedMode: "leaderboard",
    },
    {
      name: "interim results",
      scene: { kind: "interimResults", title: "RESULTS" },
      data: {
        interimResults: {
          questionText: "Which choice?",
          options: [
            { label: "Alpha", count: 2, percentage: 67 },
            { label: "Bravo", count: 1, percentage: 33 },
          ],
        },
      },
      expectedMode: "results",
    },
    {
      name: "interlude",
      scene: { kind: "interlude", title: "NEXT ROUND" },
      expectedMode: "custom",
    },
    {
      name: "transition title",
      scene: { kind: "transition", title: "NEXT ROUND" },
      expectedMode: "custom",
    },
    {
      name: "recap",
      scene: {
        kind: "answerRecap",
        recapItems: [{ label: "Alpha" }, { label: "Bravo" }],
      },
      expectedMode: "custom",
    },
    {
      name: "closing",
      scene: { kind: "closing" },
      data: {
        leaderboard: { entries: [{ displayName: "Player A", points: 120 }] },
      },
      expectedMode: "finale",
    },
  ]
  for (const testCase of authoredCases) {
    await page.evaluate(
      (testCase) =>
        window.handoff.authored({
          kind: "scene",
          key: "authored:" + testCase.name,
          scene: testCase.scene,
          activeSceneData: testCase.data,
        }),
      testCase,
    )
    await page.evaluate(() => window.handoff.rerenderCustom())
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
    const painted = await page.evaluate(() => ({
      mode: window.handoff.mode(),
      customVisible: document
        .querySelector('[data-testid="tadazz-custom-screen"]')
        ?.classList.contains("is-visible"),
      nativeScene: document
        .querySelector("[data-v4-scene]")
        ?.getAttribute("data-v4-scene"),
    }))
    check(
      "native " +
        testCase.name +
        " retains sole ownership after a parent re-render",
      painted.mode === testCase.expectedMode && painted.customVisible === false,
      { painted },
    )
  }
  for (const guessOff of [false, true]) {
    for (const count of [3, 4, 5]) {
      await page.evaluate(
        ({ count, guessOff }) => window.handoff.choices(count, guessOff),
        { count, guessOff },
      )
      const geometry = await page.evaluate(() => {
        const cards = [
          ...document.querySelectorAll('[data-testid^="tadazz-card-"]'),
        ]
        return cards.map((card) => {
          const rect = card.getBoundingClientRect(),
            title = card.querySelector(".answer-title")
          const range = document.createRange()
          range.selectNodeContents(title)
          const text = range.getBoundingClientRect()
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            textFits:
              text.left >= rect.left - 1 &&
              text.right <= rect.right + 1 &&
              text.top >= rect.top - 1 &&
              text.bottom <= rect.bottom + 1,
            withinViewport:
              rect.left >= -1 &&
              rect.right <= innerWidth + 1 &&
              rect.top >= -1 &&
              rect.bottom <= innerHeight + 1,
          }
        })
      })
      const overlaps = geometry.some((a, i) =>
        geometry
          .slice(i + 1)
          .some(
            (b) =>
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1,
          ),
      )
      check(
        `${guessOff ? "Guess-off" : "native"} ${count} answer cards fit without overlap or clipped text`,
        geometry.length === count &&
          !overlaps &&
          geometry.every(
            (card) =>
              card.width > 0 &&
              card.height > 0 &&
              card.textFits &&
              card.withinViewport,
          ),
        { geometry, overlaps },
      )
      await page.evaluate(() => window.handoff.choiceResults())
      const cuesBefore = await page.evaluate(() => window.handoff.cues())
      await page.evaluate(() => window.handoff.rerenderCustom())
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      )
      const afterRefresh = await page.evaluate(() => ({
        cues: window.handoff.cues(),
        mode: window.handoff.mode(),
        visibleCustom: document
          .querySelector('[data-testid="tadazz-custom-screen"]')
          ?.classList.contains("is-visible"),
      }))
      check(
        `${guessOff ? "Guess-off" : "native"} ${count} choices retain one reveal after re-render`,
        afterRefresh.mode === "results" &&
          afterRefresh.visibleCustom === false &&
          cuesBefore.filter((name) => name === "survey-reveal").length === 1 &&
          JSON.stringify(afterRefresh.cues) === JSON.stringify(cuesBefore),
        { cuesBefore, afterRefresh },
      )
    }
  }
  check("no browser runtime errors", errors.length === 0, { errors })
  await page.screenshot({ path: path.join(evidence, "completed.png") })
  result.passed = result.checks.every((x) => x.passed)
} catch (error) {
  result.error = String(error)
  result.passed = false
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
await fs.writeFile(
  path.join(evidence, "receipt.json"),
  JSON.stringify(result, null, 2),
)
console.log(JSON.stringify(result))
if (!result.passed) process.exitCode = 1
