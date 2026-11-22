import fs from "node:fs/promises"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"

const source = process.env.TADAZZ_HANDOFF_SOURCE
const deps = process.env.TADAZZ_HANDOFF_DEPS
const evidence = process.env.TADAZZ_HANDOFF_EVIDENCE
const adapterOverride = process.env.TADAZZ_HANDOFF_ADAPTER
const legacySceneIdentity =
  process.env.TADAZZ_HANDOFF_LEGACY_SCENE_IDENTITY === "1"
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
const themeContext = path.join(
  source,
  "extensions/src/presentation/show-themes/context.tsx",
)
const themeResolver = path.join(
  source,
  "extensions/src/core/show-themes/resolve.ts",
)
const themeEffects = path.join(
  source,
  "extensions/src/core/show-themes/audio.ts",
)
const audioDefaults = path.join(
  source,
  "extensions/src/core/platform-audio-defaults.ts",
)
const audioPolicy = path.join(
  source,
  "extensions/src/presentation/tadazz-audio-policy.ts",
)
const closingBoundary = path.join(
  source,
  "extensions/src/presentation/platform-closing.tsx",
)
const applicationPreview = path.join(
  source,
  "extensions/src/presentation/show-library-preview/application-preview-stage.tsx",
)
const previewFrameSchema = path.join(
  source,
  "extensions/src/core/show-library/application-preview-schema.ts",
)
await fs.mkdir(evidence, { recursive: true })
const sceneResolver = path.join(
  source,
  "extensions/src/presentation/tadazz-show/presentation-scene.ts",
)
const sceneSchema = path.join(source, "extensions/src/core/quiz-extras.ts")
const entry = `
import React,{useRef,useState,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {TadazzV4StageAdapter} from ${JSON.stringify(adapter)};
import {planTransition,runSteps,showSceneTransitionIdentity} from ${JSON.stringify(director)};
import {AudioCuePlayer} from ${JSON.stringify(audioOwner)};
import {startCountdownCue} from ${JSON.stringify(timerEvents)};
import {ShowThemeScope} from ${JSON.stringify(themeContext)};
import {resolveShowTheme} from ${JSON.stringify(themeResolver)};
import {resolveThemeEffect,applyThemeAudioDefaults} from ${JSON.stringify(themeEffects)};
import {createDefaultAudioExtras} from ${JSON.stringify(sceneSchema)};
import * as Scenes from ${JSON.stringify(sceneResolver)};
import {createPlatformAudioExtras} from ${JSON.stringify(audioDefaults)};
import {resolveNativePhaseAudioCue,resolveTadazzAudioPolicy} from ${JSON.stringify(audioPolicy)};
import {PlatformClosingBoundary} from ${JSON.stringify(closingBoundary)};
import {ApplicationPreviewStage} from ${JSON.stringify(applicationPreview)};
import {applicationPreviewFrameSchema} from ${JSON.stringify(previewFrameSchema)};
const q1={key:'first#1',question:'FIRST QUESTION',number:1,totalQuestions:23,answerCount:3,options:[]};
const options=[{label:'Alpha'},{label:'Bravo'},{label:'Charlie'}];
const transitionIdentity=${legacySceneIdentity ? "scene=>JSON.stringify(scene)" : "showSceneTransitionIdentity"};
function App(){
 const stage=useRef(null);const previous=useRef(null);const [custom,setCustom]=useState(null);
 const previousIdentity=useRef(null);
 const [guessOff,setGuessOff]=useState(false);const [answerImages,setAnswerImages]=useState(false);const cues=useRef([]);
 const [audio,setAudio]=useState({gameId:'start-audio',epoch:1,seconds:5,role:'manager',paused:false,sceneKind:'start',closingElapsed:null});
 const [audioExtras,setAudioExtras]=useState(()=>createPlatformAudioExtras());
 const [openingOverride,setOpeningOverride]=useState(null);
 const theme=React.useMemo(()=>{
  const base=resolveShowTheme({role:audio.role});
  return openingOverride ? resolveShowTheme({role:audio.role,selection:{...base.requested,overrides:{...base.requested.overrides,audio:{...base.requested.overrides.audio,opening:openingOverride}}}}) : base;
 },[audio.role,openingOverride]);
 const statusName=audio.sceneKind==='start'?'SHOW_START':'FINISHED';
 const policy=resolveTadazzAudioPolicy({sceneKind:audio.sceneKind,statusName});
 const cueId=resolveNativePhaseAudioCue(audio.sceneKind,audio.sceneKind==='start'?'start':'podium1');
 const startTick=()=>{const detail=startCountdownCue(audio);if(detail)window.dispatchEvent(new CustomEvent('tadazz:sfx',{detail}))};
 const drive=async(next)=>{
   // The live director intentionally ignores this split-delivery placeholder.
   if(next.kind==='wait'&&next.key==='wait:question-content')return;
   const identity=transitionIdentity(next);
   if(previousIdentity.current===identity)return;
   previousIdentity.current=identity;
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
  async elapsedSnapshot(){
   if(previous.current?.kind!=='scene')throw new Error('Expected authored scene');
   await drive({...previous.current,elapsedMs:(previous.current.elapsedMs??0)+1000});
  },
  rerenderCustom(){
   flushSync(()=>setCustom(<div data-testid="unexpected-native-overlay">REFRESHED CUSTOM TITLE</div>));
  },
  async choices(count,look,images=false){
   flushSync(()=>{setCustom(null);setGuessOff(look);setAnswerImages(images)});
   const question={...q1,key:'choices-'+count+'-'+look+'-'+images,question:'Which option do you choose?',number:count,answerCount:count,options:Array.from({length:count},(_,i)=>({label:['A walk by the river','An evening with friends','A homemade celebration','Exploring somewhere new','A quiet afternoon'][i],...(images?{image:'/tadazz-show/great-guessoff/banana.webp',display:'both'}:{})}))};
   await drive({kind:'question',key:'question:'+question.key,question:{...question,options:[]}});
   await drive({kind:'voting',key:'voting:'+question.key,question,seconds:null});
   cues.current=[];
  },
  async choiceResults(mode='quiz'){
   const question=previous.current.question;
   await drive({kind:'results',key:'results:'+question.key,question,reveal:{mode,counts:question.options.map((_,i)=>i+1),...(mode==='quiz'?{solutions:[1]}:{})}});
  },
  cues:()=>cues.current.map(cue=>cue.name),
  audioState:(next)=>flushSync(()=>setAudio(current=>({...current,...next}))),
  audioMix:(next)=>flushSync(()=>setAudioExtras(current=>({...current,cues:{...current.cues,start:{...current.cues.start,...next}}}))),
  openingOverride:(next)=>flushSync(()=>setOpeningOverride(next)),
  audioDebug:()=>({audio,theme:{id:theme.definition.id,role:theme.role,legacyPolicy:theme.requested.legacyPolicy,start:resolveThemeEffect(theme,'timer-start'),selection:theme.audioSelections.opening},savedStart:audioExtras.cues.start}),
  mode:()=>stage.current?.mode,
 };
 return <ShowThemeScope theme={theme}><div style={{width:'100%',height:'100%'}} data-guess-off-stage={guessOff?'true':undefined} data-guess-off-media={guessOff&&!answerImages?'text':undefined}><TadazzV4StageAdapter ref={stage} customScreen={custom} guessOffLook={guessOff} onCue={cue=>cues.current.push(cue)}/><div style={{position:'fixed',top:0,left:0,zIndex:1000,background:'white',color:'black'}}><PlatformClosingBoundary elapsedMs={audio.closingElapsed}><AudioCuePlayer gameId={audio.gameId} epoch={audio.epoch} phase={statusName} cueId={cueId} soundtrackSlot={policy.slot} continuityKey={policy.continuityKey} audioExtras={audioExtras} stageOwnsReveal eventOnly={audio.role==='player'} paused={audio.paused} autoPlay showControls/></PlatformClosingBoundary><button data-testid="start-audio-tick" onClick={startTick}>Server start tick</button></div></div></ShowThemeScope>;
}
function PreviewApp({audioMode='custom'}){
 const [frame,setFrame]=useState(()=>applicationPreviewFrameSchema.parse({
  show:{format:'tada-show',version:1,title:'Authored scene audio fixture',baseGameMode:'quiz',settings:[],cards:[{key:'authored-recap',kind:'animation',preset:'round-recap',durationMs:20000,advance:'manual',...(audioMode==='absent'?{}:{audio:{mode:audioMode,url:'/media/fixture-recap.mp3#authored-recap-marker',volume:1,loop:false}})},{key:'following-question',kind:'quiz',question:'Synthetic following question',timeSeconds:20,answers:[{text:'Alpha'},{text:'Bravo'},{text:'Charlie'}],correctAnswers:[1]}]},
  chapterIndex:0,clock:{epoch:1,sequence:1,elapsedMs:0,deadlineMs:20000,paused:false},role:'spectator',locale:'en',reducedMotion:false,soundEnabled:true,mediaRevealed:false,appearanceRevision:0,
 }));
 window.previewScene={
  info:()=>({audio:frame.show.cards[0].audio,expectedRecap:applyThemeAudioDefaults(resolveShowTheme({role:frame.role}),createDefaultAudioExtras()).soundtrack.recap.url}),
  update:next=>flushSync(()=>setFrame(current=>applicationPreviewFrameSchema.parse({...current,...next}))),
  clock:next=>flushSync(()=>setFrame(current=>applicationPreviewFrameSchema.parse({...current,clock:{...current.clock,...next,sequence:current.clock.sequence+1}}))),
 };
 return <ApplicationPreviewStage frame={frame} onCommitted={()=>{window.previewCommitted=true}} onUnavailable={()=>{window.previewUnavailable=true}}/>;
}
function TerminalHandoffApp({role}){
 const theme=React.useMemo(()=>resolveShowTheme({role,selection:{id:'tadazz-classic',version:'1.0.0',overrides:{}}}),[role]);
 const extras=React.useMemo(()=>createPlatformAudioExtras(),[]);
 window.terminalHandoff={expectedFinale:applyThemeAudioDefaults(theme,extras).soundtrack.finale.url};
 const stage=useRef(null),previous=useRef(null),identity=useRef(null),cues=useRef([]);
 const [snapshot,setSnapshot]=useState({gameId:'finale-diagnostic',epoch:2,phase:'scene',startedAt:Date.now()-7600,status:{name:'SHOW_RESPONSES',data:{question:'Previous question',answers:['Alpha','Bravo','Charlie'],responses:{0:1},solutions:[0]}},extras:{presentationLaunch:{stage:'running',startedAt:null},currentScene:{id:'authored-finale',kind:'animation',preset:'grand-finale',durationMs:9200,advance:'auto'},activeTimelineStep:{kind:'animation',sceneId:'authored-finale',stepIndex:1}},closingElapsed:7600,paused:false});
 const scene=Scenes.computeShowScene({role,isConnected:true,status:snapshot.status,envelope:snapshot,questionStates:{current:1,total:1}});
 const pending=Scenes.isShowSceneContentPending(scene);
 const waitingForFinale=scene.kind==='wait'&&scene.key==='wait:finale-content';
 const descriptor=scene.kind==='scene'?scene.scene:null;
 const policy=resolveTadazzAudioPolicy({statusName:snapshot.status.name,extensionPhase:snapshot.phase,sceneKind:descriptor?.kind??scene.kind,scenePreset:descriptor?.preset,presentationLaunch:snapshot.extras.presentationLaunch,activeTimelineStep:snapshot.extras.activeTimelineStep});
 const sceneIdentity=showSceneTransitionIdentity(scene);
 useLayoutEffect(()=>{
  if(pending||identity.current===sceneIdentity)return;
  identity.current=sceneIdentity;
  const handle=stage.current;
  const steps=planTransition(previous.current,scene,{questionKey:handle.questionKey,mode:handle.mode});
  previous.current=scene;
  void runSteps(handle,steps,()=>true);
 },[sceneIdentity,pending]);
 window.terminalHandoff.snapshot={scene,policy,gameId:snapshot.gameId,epoch:snapshot.epoch};
 window.terminalHandoff.stage=()=>({mode:stage.current?.mode,questionKey:stage.current?.questionKey,cues:cues.current.map(cue=>cue.name)});
 window.terminalHandoff.gap=stageName=>flushSync(()=>setSnapshot(current=>({...current,phase:'responses',epoch:3,extras:{presentationLaunch:{stage:stageName,startedAt:current.startedAt}},closingElapsed:stageName==='closed'?8680:8000})));
 window.terminalHandoff.pause=value=>flushSync(()=>setSnapshot(current=>({...current,paused:value})));
 window.terminalHandoff.finished=()=>flushSync(()=>setSnapshot(current=>({...current,phase:'finished',status:{name:'FINISHED',data:{top:[{username:'Winner',points:10}]}},extras:{presentationLaunch:{stage:'closed',startedAt:current.startedAt}},closingElapsed:8680})));
 window.terminalHandoff.staleLaunch=()=>flushSync(()=>setSnapshot(current=>({...current,extras:{...current.extras,presentationLaunch:{stage:'closed',startedAt:1},activeTimelineStep:{kind:'question',questionId:'replay-current'}}})));
 window.terminalHandoff.replay=gameId=>flushSync(()=>setSnapshot(current=>({...current,gameId,epoch:4,phase:'question',status:{name:'SHOW_QUESTION',data:{question:'Replay question',totalAnswers:3}},extras:{presentationLaunch:{stage:'running',startedAt:null}},closingElapsed:null})));
 return <ShowThemeScope theme={theme}><PlatformClosingBoundary elapsedMs={snapshot.closingElapsed}><TadazzV4StageAdapter ref={stage} onCue={cue=>cues.current.push(cue)}/><AudioCuePlayer eventOnly={role==='player'||(scene.kind==='wait'&&!waitingForFinale)} audioExtras={extras} gameId={snapshot.gameId} activeCardKey={descriptor?.id} phase={snapshot.phase} epoch={snapshot.epoch} soundtrackSlot={policy.slot} continuityKey={policy.continuityKey} paused={snapshot.paused} autoPlay showControls stageOwnsReveal/></PlatformClosingBoundary></ShowThemeScope>;
}
const root=createRoot(document.getElementById('root'));
window.mountAuthoredPreview=(audioMode='custom')=>flushSync(()=>root.render(<PreviewApp key={audioMode} audioMode={audioMode}/>));
window.mountTerminalHandoff=role=>flushSync(()=>root.render(<TerminalHandoffApp key={role} role={role}/>));
root.render(<App/>);
`
const plugins = [
  {
    name: "isolated-native-source",
    setup(builder) {
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
      builder.onResolve({ filter: /^[^./]/ }, async (args) => {
        const relative = path.relative(source, args.resolveDir)
        if (
          relative === ".." ||
          relative.startsWith(".." + path.sep) ||
          path.isAbsolute(relative)
        )
          return undefined
        // Candidate code uses the matching installed workspace. Once resolved
        // into that dependency tree, esbuild follows each real importer itself
        // (including pnpm's private transitive dependencies).
        const resolved = await builder.resolve(args.path, {
          resolveDir: path.join(deps, relative),
          kind: args.kind,
        })
        if (!resolved.errors.length) return resolved
        // Presentation peers are supplied by the web host. Use esbuild here,
        // too, so conditional package exports retain their browser branch.
        return builder.resolve(args.path, {
          resolveDir: path.join(deps, "packages/web"),
          kind: args.kind,
        })
      })
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
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  plugins,
  logLevel: "silent",
  external: ["/tadazz-show/*"],
  loader: { ".woff2": "file", ".png": "file", ".jpg": "file", ".svg": "file" },
  define: { "process.env.NODE_ENV": '"production"' },
  stdin: {
    contents: entry,
    loader: "tsx",
    resolveDir: path.join(source, "packages/web"),
  },
  outfile: path.join(evidence, "fixture.js"),
})
const serverFailures = []
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost")
    let file
    if (url.pathname === "/fixture.js" || url.pathname === "/fixture.css")
      file = path.join(evidence, url.pathname.slice(1))
    else if (url.pathname === "/media/fixture-start.mp3")
      file = path.join(source, "packages/web/public/sounds/boump.mp3")
    else if (url.pathname === "/assets/tadazz-question-background.png")
      file = path.join(
        source,
        "extensions/assets/tadazz-question-background.png",
      )
    else if (url.pathname === "/media/fixture-recap.mp3")
      file = path.join(
        source,
        "packages/web/public/tadazz-show/music/cutie-patootie.mp3",
      )
    else if (
      url.pathname.startsWith("/tadazz-show/") ||
      url.pathname.startsWith("/sounds/")
    )
      file = path.join(source, "packages/web/public", url.pathname.slice(1))
    else {
      response.writeHead(200, { "Content-Type": "text/html" })
      response.end(
        '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:#101a31}</style><div id="root"></div><script type="module" src="/fixture.js"></script>',
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
    const bytes = await fs.readFile(file)
    response.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": bytes.length,
    })
    response.end(bytes)
  } catch (error) {
    serverFailures.push({ url: request.url, error: String(error) })
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
  legacySceneIdentity,
  checks: [],
  customerData: false,
  network: "container loopback only",
}
function check(name, passed, details = {}) {
  result.checks.push({ name, passed: Boolean(passed), ...details })
}
const errors = []
const errorDetails = []
const failedRequests = []
const failedResponses = []
const consoleErrors = []
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
page.on("pageerror", (error) => {
  errors.push(error.message)
  errorDetails.push({ message: error.message, stack: error.stack })
})
page.on("requestfailed", (request) =>
  failedRequests.push({ url: request.url(), failure: request.failure() }),
)
page.on("response", (response) => {
  if (response.status() >= 400)
    failedResponses.push({ url: response.url(), status: response.status() })
})
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text())
})
async function captureAudio(label) {
  const state = await page.evaluate(() => ({
    debug: window.handoff?.audioDebug(),
    state: Object.fromEntries(
      Array.from(
        document.querySelector('[data-testid="audio-cue-player-state"]')
          ?.attributes ?? [],
      ).map((attribute) => [attribute.name, attribute.value]),
    ),
    attempts: window.audioAttempts,
    events: window.audioEvents,
    media: (window.startAudioElements ?? []).map((audio) => ({
      src: audio.src,
      currentSrc: audio.currentSrc,
      time: audio.currentTime,
      duration: audio.duration,
      paused: audio.paused,
      ended: audio.ended,
      readyState: audio.readyState,
      networkState: audio.networkState,
      volume: audio.volume,
      muted: audio.muted,
      loop: audio.loop,
      error: audio.error && {
        code: audio.error.code,
        message: audio.error.message,
      },
    })),
  }))
  result.observations ??= []
  result.observations.push({
    label,
    ...state,
    failedRequests: [...failedRequests],
    failedResponses: [...failedResponses],
    serverFailures: [...serverFailures],
    errors: [...errors],
    errorDetails: [...errorDetails],
    consoleErrors: [...consoleErrors],
  })
}
try {
  await page.addInitScript(() => {
    window.animationStarts = 0
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      window.animationStarts += 1
      return animate.apply(this, args)
    }
    window.audioAttempts = []
    window.audioEvents = []
    window.startAudioElements = []
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (...args) {
      let attempt
      if (this instanceof HTMLAudioElement) {
        attempt = {
          src: this.src,
          volume: this.volume,
          time: this.currentTime,
          readyState: this.readyState,
          status: "pending",
        }
        window.audioAttempts.push(attempt)
        if (!window.startAudioElements.includes(this)) {
          window.startAudioElements.push(this)
          for (const name of [
            "error",
            "stalled",
            "waiting",
            "canplay",
            "playing",
            "pause",
            "ended",
          ]) {
            this.addEventListener(name, () => {
              if (window.audioEvents.length < 200)
                window.audioEvents.push({
                  name,
                  src: this.src,
                  time: this.currentTime,
                  readyState: this.readyState,
                  networkState: this.networkState,
                  error: this.error && {
                    code: this.error.code,
                    message: this.error.message,
                  },
                })
            })
          }
        }
      }
      const promise = play.apply(this, args)
      if (attempt)
        promise.then(
          () => {
            attempt.status = "fulfilled"
          },
          (error) => {
            attempt.status = "rejected"
            attempt.error = { name: error.name, message: error.message }
          },
        )
      return promise
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
  const unlock = page.getByTestId("host-enable-audio")
  // Autoplay rejection is asynchronous. Observe either actual playback or the
  // real gate before interacting, so an early visibility check cannot miss it.
  await page.waitForFunction(() => {
    const state = document.querySelector(
      '[data-testid="audio-cue-player-state"]',
    )
    const url = state?.getAttribute("data-audio-url")
    return (
      state?.getAttribute("data-audio-blocked") === "true" ||
      window.startAudioElements.some(
        (audio) =>
          audio.src.endsWith(url || "missing") &&
          !audio.paused &&
          audio.currentTime > 0.05,
      )
    )
  })
  if (await unlock.isVisible()) await unlock.click()
  await page.waitForFunction(() => {
    const state = document.querySelector(
      '[data-testid="audio-cue-player-state"]',
    )
    const url = state?.getAttribute("data-audio-url")
    return (
      state?.getAttribute("data-audio-blocked") === "false" &&
      window.startAudioElements.some(
        (audio) =>
          audio.src.endsWith(url || "missing") &&
          !audio.paused &&
          audio.currentTime > 0.05,
      )
    )
  })
  await captureAudio("before-first-countdown-tick")
  check(
    "SHOW_START phase does not duplicate the countdown's first effect",
    (await startAttemptCount()) === 0,
  )
  check(
    "SHOW_START keeps its round-start music bed",
    (await page
      .getByTestId("audio-cue-player-state")
      .getAttribute("data-soundtrack-slot")) === "roundStart",
  )
  await page.getByTestId("start-audio-tick").click()
  await captureAudio("after-first-countdown-tick")
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
  await page.evaluate(() => {
    window.handoff.audioMix({ enabled: false, volume: 0.27 })
    window.handoff.audioState({ seconds: 3 })
  })
  await page.getByTestId("start-audio-tick").click()
  check(
    "saved legacy start-cue disable is respected by the single owner",
    (await startAttemptCount()) === 2,
  )
  await page.evaluate(() =>
    window.handoff.audioMix({ enabled: true, volume: 0 }),
  )
  await page.getByTestId("start-audio-tick").click()
  check(
    "saved zero start volume silences the countdown",
    (await startAttemptCount()) === 2,
  )
  await page.evaluate(() => window.handoff.audioMix({ volume: 0.27 }))
  await page.getByTestId("start-audio-tick").click()
  const legacyVolume = await page.evaluate(
    () =>
      window.audioAttempts
        .filter((item) => item.src.endsWith("/sounds/boump.mp3"))
        .at(-1)?.volume,
  )
  check(
    "saved nonzero start volume survives countdown delegation",
    (await startAttemptCount()) === 3 && Math.abs(legacyVolume - 0.27) < 0.001,
    { volume: legacyVolume },
  )
  await page.evaluate(() => {
    window.handoff.audioMix({
      source: "media",
      url: "/media/fixture-start.mp3",
      volume: 0.31,
    })
    window.handoff.audioState({ seconds: 2 })
  })
  await page.getByTestId("start-audio-tick").click()
  await page.waitForFunction(() =>
    window.startAudioElements.some(
      (audio) =>
        audio.src.endsWith("/media/fixture-start.mp3") && audio.currentTime > 0,
    ),
  )
  const customStart = await page.evaluate(() =>
    window.audioAttempts.filter((item) =>
      item.src.endsWith("/media/fixture-start.mp3"),
    ),
  )
  check(
    "saved owner-media start cue retains its URL and volume",
    customStart.length === 1 && Math.abs(customStart[0].volume - 0.31) < 0.001,
    { attempts: customStart },
  )
  await page.evaluate(() => {
    window.handoff.openingOverride({ volume: 0.61 })
    window.handoff.audioState({ seconds: 1 })
  })
  await page.getByTestId("start-audio-tick").click()
  const explicitVolume = await page.evaluate(
    () =>
      window.audioAttempts
        .filter((item) => item.src.endsWith("/sounds/boump.mp3"))
        .at(-1)?.volume,
  )
  check(
    "explicit theme opening volume retains precedence over legacy settings",
    (await startAttemptCount()) === 4 &&
      Math.abs(explicitVolume - 0.61) < 0.001,
    { volume: explicitVolume },
  )
  await page.evaluate(() => {
    window.handoff.openingOverride({ muted: true })
    window.handoff.audioState({ epoch: 2, seconds: 5 })
  })
  await page.getByTestId("start-audio-tick").click()
  check(
    "theme opening mute silences the delegated countdown",
    (await startAttemptCount()) === 4,
  )
  await page.evaluate(() => {
    window.handoff.openingOverride(null)
    window.handoff.audioMix({
      source: "default",
      url: undefined,
      enabled: true,
      volume: 0.8,
    })
  })
  await captureAudio("countdown-policy-complete")
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
    let titleSelector = null
    if (testCase.scene.kind === "leaderboard") {
      titleSelector =
        '[data-testid="tadazz-leaderboard-screen"] .leader-head h2'
    } else if (testCase.scene.kind === "interimResults") {
      titleSelector = '[data-testid="tadazz-question-panel"] .eyebrow'
    }
    const title = titleSelector
      ? {
          count: await page.locator(titleSelector).count(),
          text: await page.locator(titleSelector).textContent(),
          visible: await page.locator(titleSelector).isVisible(),
        }
      : null
    check(
      "native " +
        testCase.name +
        " retains sole ownership after a parent re-render",
      painted.mode === testCase.expectedMode &&
        painted.customVisible === false &&
        (!title ||
          (title.count === 1 &&
            title.text === testCase.scene.title &&
            title.visible)),
      { painted, authoredTitle: title },
    )
    const beforeClock = await page.evaluate(() => ({
      animationStarts: window.animationStarts,
      cues: window.handoff.cues(),
    }))
    await page.evaluate(() => window.handoff.elapsedSnapshot())
    const afterClock = await page.evaluate(() => ({
      animationStarts: window.animationStarts,
      cues: window.handoff.cues(),
    }))
    check(
      `native ${testCase.name} ignores an elapsed-only authored snapshot`,
      afterClock.animationStarts === beforeClock.animationStarts &&
        JSON.stringify(afterClock.cues) === JSON.stringify(beforeClock.cues),
      { beforeClock, afterClock },
    )
  }
  for (const guessOff of [false, true]) {
    const cases = [3, 4, 5].map((count) => ({ count, images: false }))
    if (guessOff) cases.push({ count: 5, images: true })
    for (const { count, images } of cases) {
      await page.evaluate(
        ({ count, guessOff, images }) =>
          window.handoff.choices(count, guessOff, images),
        { count, guessOff, images },
      )
      if (images) {
        await page.waitForFunction((count) => {
          const images = [
            ...document.querySelectorAll(".choice-slot .tz-photo-frame img"),
          ]
          return (
            images.length === count &&
            images.every((image) => image.complete && image.naturalWidth > 0)
          )
        }, count)
      }
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
            titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
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
        `${guessOff ? "Guess-off" : "native"} ${count}${images ? " image" : ""} answer cards fit without overlap or clipped text`,
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
      const votingLayout = await page.evaluate(() => {
        const bounds = (node) => {
          if (!node) return null
          const rect = node.getBoundingClientRect()
          let visible = rect.width > 0 && rect.height > 0
          for (
            let ancestor = node;
            ancestor instanceof Element;
            ancestor = ancestor.parentElement
          ) {
            const style = getComputedStyle(ancestor)
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              Number(style.opacity) <= 0.01
            )
              visible = false
          }
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            visible,
            withinViewport:
              rect.left >= -1 &&
              rect.right <= innerWidth + 1 &&
              rect.top >= -1 &&
              rect.bottom <= innerHeight + 1,
          }
        }
        const question = document.querySelector(".q-text")
        window.choiceQuestionNode = question
        window.choiceQuestionBaseline = {
          bounds: bounds(question),
          text: question.textContent,
          fontSize: getComputedStyle(question).fontSize,
          fontWeight: getComputedStyle(question).fontWeight,
        }
        const stage = document
          .querySelector(".tzv4-stage")
          .getBoundingClientRect()
        const banner = bounds(document.querySelector('[data-v4="vote-status"]'))
        const badges = [
          ...document.querySelectorAll(".choice-slot .answer-index"),
        ].map(bounds)
        return {
          banner,
          badges,
          bannerStageTop:
            banner && (banner.top - stage.top) / (stage.width / 1920),
        }
      })
      const badgeOverlaps = votingLayout.badges.some((badge) => {
        const banner = votingLayout.banner
        return (
          !badge ||
          !banner ||
          (Math.min(badge.right, banner.right) -
            Math.max(badge.left, banner.left) >
            1 &&
            Math.min(badge.bottom, banner.bottom) -
              Math.max(badge.top, banner.top) >
              1)
        )
      })
      check(
        `${guessOff ? "Guess-off" : "native"} ${count}${images ? " image" : ""} visible answer badges and voting banner fit without overlap`,
        votingLayout.banner?.visible &&
          votingLayout.banner.withinViewport &&
          votingLayout.badges.length === count &&
          votingLayout.badges.every(
            (badge) => badge?.visible && badge.withinViewport,
          ) &&
          !badgeOverlaps &&
          Math.abs(
            votingLayout.bannerStageTop - (guessOff && !images ? 855 : 930),
          ) <= 1,
        { votingLayout, badgeOverlaps },
      )
      const caseName = `${guessOff ? "guess-off" : "native"}-${count}${images ? "-image" : ""}-answers`
      await page.screenshot({
        path: path.join(evidence, `${caseName}-voting.png`),
      })
      const resultMode = count === 3 ? "survey" : "quiz"
      await page.evaluate(
        (mode) => window.handoff.choiceResults(mode),
        resultMode,
      )
      const resultLabels = await page.evaluate(() => {
        const question = document.querySelector(".q-text")
        const rect = question.getBoundingClientRect()
        const before = window.choiceQuestionBaseline
        const visible = (node) => {
          if (!node) return false
          const bounds = node.getBoundingClientRect()
          if (!bounds.width || !bounds.height) return false
          for (
            let ancestor = node;
            ancestor instanceof Element;
            ancestor = ancestor.parentElement
          ) {
            const style = getComputedStyle(ancestor)
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              Number(style.opacity) <= 0.01
            )
              return false
          }
          return true
        }
        return {
          heading: document
            .querySelector(".q-frame .eyebrow")
            ?.textContent?.trim(),
          status: document
            .querySelector('.tzv4-sr-status[data-testid="tadazz-status"]')
            ?.textContent?.trim(),
          tags: [...document.querySelectorAll(".choice-slot .winner-tag")]
            .filter(visible)
            .map((node) => ({
              text: node.textContent.trim(),
              correct: node
                .closest(".choice-slot")
                .classList.contains("is-correct"),
              favourite: node
                .closest(".choice-slot")
                .classList.contains("is-favourite"),
            })),
          retainedQuestion:
            question === window.choiceQuestionNode &&
            question.textContent === before.text,
          stableGeometry: ["left", "right", "top", "bottom"].every(
            (key) => Math.abs(rect[key] - before.bounds[key]) <= 1,
          ),
          stableTypography:
            getComputedStyle(question).fontSize === before.fontSize &&
            getComputedStyle(question).fontWeight === before.fontWeight,
        }
      })
      const expectedHeading =
        resultMode === "quiz" ? "CORRECT ANSWER" : "AUDIENCE RESULTS"
      const expectedTag =
        resultMode === "quiz" ? "CORRECT ANSWER" : "AUDIENCE FAVOURITE"
      check(
        `${guessOff ? "Guess-off" : "native"} ${count}${images ? " image" : ""} ${resultMode} results keep the question stable and use the correct labels`,
        resultLabels.heading === expectedHeading &&
          resultLabels.status === expectedHeading &&
          resultLabels.tags.length === 1 &&
          resultLabels.tags[0].text === expectedTag &&
          (resultMode === "quiz"
            ? resultLabels.tags[0].correct
            : resultLabels.tags[0].favourite) &&
          resultLabels.retainedQuestion &&
          resultLabels.stableGeometry &&
          resultLabels.stableTypography,
        { resultMode, resultLabels },
      )
      await page.screenshot({
        path: path.join(evidence, `${caseName}-reveal.png`),
      })
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
        `${guessOff ? "Guess-off" : "native"} ${count}${images ? " image" : ""} choices retain one reveal after re-render`,
        afterRefresh.mode === "results" &&
          afterRefresh.visibleCustom === false &&
          cuesBefore.filter((name) => name === "survey-reveal").length === 1 &&
          JSON.stringify(afterRefresh.cues) === JSON.stringify(cuesBefore),
        { cuesBefore, afterRefresh },
      )
    }
  }
  await page.evaluate(() =>
    window.handoff.audioState({ sceneKind: "finale", closingElapsed: 0 }),
  )
  await page.waitForFunction(() => {
    const state = document.querySelector(
      '[data-testid="audio-cue-player-state"]',
    )
    const url = state?.getAttribute("data-audio-url")
    const audio = window.startAudioElements.findLast((item) =>
      item.src.endsWith(url || "missing"),
    )
    if (!audio || audio.currentTime <= 0.05 || audio.paused) return false
    window.finaleAudio = audio
    window.finaleBeforeClose = {
      url,
      time: audio.currentTime,
      plays: window.audioAttempts.filter((item) => item.src === audio.src)
        .length,
      identity: state.getAttribute("data-audio-identity"),
    }
    return true
  })
  await page.evaluate(() =>
    window.handoff.audioState({ closingElapsed: 100000 }),
  )
  await page.waitForTimeout(500)
  const finale = await page.evaluate(() => {
    const state = document.querySelector(
      '[data-testid="audio-cue-player-state"]',
    )
    const before = window.finaleBeforeClose,
      audio = window.finaleAudio
    return {
      before,
      time: audio.currentTime,
      paused: audio.paused,
      loop: audio.loop,
      desiredLoop: state.getAttribute("data-audio-loop"),
      identity: state.getAttribute("data-audio-identity"),
      plays: window.audioAttempts.filter((item) => item.src === audio.src)
        .length,
      closed: document
        .querySelector('[data-testid="platform-closing-boundary"]')
        ?.getAttribute("data-closing-stage"),
    }
  })
  check(
    "finale music continues as one loop after the platform curtains close",
    finale.closed === "closed" &&
      finale.loop &&
      finale.desiredLoop === "true" &&
      !finale.paused &&
      finale.time >= finale.before.time &&
      finale.identity === finale.before.identity &&
      finale.plays === finale.before.plays,
    { finale },
  )
  await page.evaluate(() => {
    window.previewPhaseEvents = []
    window.addEventListener("tadazz:sfx", (event) => {
      if (event.detail?.name?.startsWith("phase-"))
        window.previewPhaseEvents.push(event.detail.name)
    })
    window.mountAuthoredPreview()
  })
  await page.waitForFunction(() => window.previewCommitted === true)
  const previewUrl = "/media/fixture-recap.mp3#authored-recap-marker"
  const readPreviewAudio = () =>
    page.evaluate((url) => {
      const owners = [
        ...document.querySelectorAll('[data-testid="audio-cue-player-state"]'),
      ]
      const owner = owners[0]
      const active = window.startAudioElements.filter(
        (audio) =>
          !audio.paused && !audio.ended && !audio.muted && audio.volume > 0,
      )
      const matching = active.filter((audio) => audio.src.endsWith(url))
      const audio = matching[0]
      return {
        owners: owners.length,
        url: owner?.getAttribute("data-audio-url"),
        identity: owner?.getAttribute("data-audio-identity"),
        blocked: owner?.getAttribute("data-audio-blocked"),
        error: owner?.getAttribute("data-audio-error"),
        active: active.length,
        matching: matching.length,
        element: audio ? window.startAudioElements.indexOf(audio) : null,
        time: audio?.currentTime ?? 0,
        volume: audio?.volume,
        loop: audio?.loop,
        plays: window.audioAttempts.filter(
          (item) => item.src.endsWith(url) && item.status === "fulfilled",
        ).length,
        attemptCount: window.audioAttempts.filter((item) =>
          item.src.endsWith(url),
        ).length,
        rejected: window.audioAttempts.filter(
          (item) => item.src.endsWith(url) && item.status === "rejected",
        ).length,
        phaseEvents: window.previewPhaseEvents,
        unavailable: window.previewUnavailable === true,
      }
    }, previewUrl)
  await page.waitForFunction((url) => {
    const owner = document.querySelector(
      '[data-testid="audio-cue-player-state"]',
    )
    return (
      owner?.getAttribute("data-audio-blocked") === "true" ||
      window.startAudioElements.some(
        (audio) =>
          audio.src.endsWith(url) && !audio.paused && audio.currentTime > 0.25,
      )
    )
  }, previewUrl)
  const previewUnlock = page.getByTestId("preview-unlock-audio")
  if (await previewUnlock.isVisible()) await previewUnlock.click()
  await page.waitForFunction(
    (url) =>
      window.startAudioElements.some(
        (audio) =>
          audio.src.endsWith(url) && !audio.paused && audio.currentTime > 0.4,
      ),
    previewUrl,
  )
  const previewBefore = await readPreviewAudio()
  check(
    "actual application preview plays an authored fragment through exactly one central owner",
    previewBefore.owners === 1 &&
      previewBefore.active === 1 &&
      previewBefore.matching === 1 &&
      previewBefore.url === previewUrl &&
      previewBefore.blocked === "false" &&
      previewBefore.error === "false" &&
      previewBefore.volume === 1 &&
      previewBefore.loop === false &&
      previewBefore.plays === 1 &&
      !previewBefore.unavailable,
    { previewBefore },
  )
  check(
    "an authored recap does not introduce an opening phase sound",
    !previewBefore.phaseEvents.includes("phase-start"),
    { phaseEvents: previewBefore.phaseEvents },
  )
  await page.evaluate(() => window.previewScene.clock({ elapsedMs: 1000 }))
  await page.waitForFunction(
    ({ url, time }) =>
      window.startAudioElements.some(
        (audio) =>
          audio.src.endsWith(url) &&
          !audio.paused &&
          audio.currentTime > time + 0.15,
      ),
    { url: previewUrl, time: previewBefore.time },
  )
  const previewAfter = await readPreviewAudio()
  check(
    "authored preview clock updates retain the same playing element without duplicate replay",
    previewAfter.owners === 1 &&
      previewAfter.active === 1 &&
      previewAfter.matching === 1 &&
      previewAfter.identity === previewBefore.identity &&
      previewAfter.element === previewBefore.element &&
      previewAfter.plays === previewBefore.plays &&
      previewAfter.attemptCount === previewBefore.attemptCount &&
      previewAfter.phaseEvents.length === 0 &&
      previewAfter.time > previewBefore.time,
    { previewAfter },
  )
  await page.evaluate(() => window.previewScene.clock({ paused: true }))
  await page.waitForFunction(() =>
    window.startAudioElements.every(
      (audio) =>
        audio.paused || audio.ended || audio.muted || audio.volume === 0,
    ),
  )
  check(
    "authored preview pause stops actual scene playback",
    (await readPreviewAudio()).active === 0,
  )
  await page.evaluate(() => window.previewScene.clock({ paused: false }))
  await page.waitForFunction(
    (url) =>
      window.startAudioElements.some(
        (audio) => audio.src.endsWith(url) && !audio.paused,
      ),
    previewUrl,
  )
  const previewResumed = await readPreviewAudio()
  check(
    "authored preview resume retains one scene audio owner",
    previewResumed.active === 1 &&
      previewResumed.matching === 1 &&
      previewResumed.identity === previewBefore.identity &&
      previewResumed.phaseEvents.length === 0 &&
      previewResumed.time >= previewAfter.time &&
      previewResumed.element === previewBefore.element,
    { previewResumed },
  )
  await page.evaluate(() => window.previewScene.update({ soundEnabled: false }))
  await page.waitForFunction(() =>
    window.startAudioElements.every(
      (audio) =>
        audio.paused || audio.ended || audio.muted || audio.volume === 0,
    ),
  )
  check(
    "authored preview sound disable suppresses scene audio",
    (await readPreviewAudio()).active === 0,
  )
  await page.screenshot({
    path: path.join(evidence, "authored-fragment-preview.png"),
  })

  const readEdgeAudio = () =>
    page.evaluate(() => {
      const owners = [
        ...document.querySelectorAll('[data-testid="audio-cue-player-state"]'),
      ]
      const owner = owners[0]
      return {
        owners: owners.length,
        attributes: Object.fromEntries(
          Array.from(owner?.attributes ?? []).map((a) => [a.name, a.value]),
        ),
        audio: window.startAudioElements.map((audio, element) => ({
          element,
          url: audio.getAttribute("src"),
          time: audio.currentTime,
          paused: audio.paused,
          ended: audio.ended,
          loop: audio.loop,
          volume: audio.volume,
        })),
        attempts: window.audioAttempts.map((attempt) => ({ ...attempt })),
        phaseEvents: [...window.previewPhaseEvents],
        preview: window.previewScene?.info(),
        terminal: window.terminalHandoff?.snapshot,
        stage: window.terminalHandoff?.stage(),
        curtain: document
          .querySelector('[data-testid="platform-closing-boundary"]')
          ?.getAttribute("data-closing-stage"),
      }
    })
  const activeEdgeAudio = (state, url) =>
    state.audio.filter(
      (audio) => audio.url === url && !audio.paused && !audio.ended,
    )
  const waitForEdgeAudio = async (url) => {
    await page.waitForFunction((url) => {
      const owner = document.querySelector(
        '[data-testid="audio-cue-player-state"]',
      )
      return (
        owner?.getAttribute("data-audio-blocked") === "true" ||
        window.startAudioElements.some(
          (audio) =>
            audio.getAttribute("src") === url &&
            !audio.paused &&
            !audio.ended &&
            audio.currentTime > 0.05,
        )
      )
    }, url)
    for (const testId of ["preview-unlock-audio", "host-enable-audio"]) {
      const control = page.getByTestId(testId)
      if (await control.isVisible()) await control.click()
    }
    await page.waitForFunction(
      (url) =>
        window.startAudioElements.some(
          (audio) =>
            audio.getAttribute("src") === url &&
            !audio.paused &&
            !audio.ended &&
            audio.currentTime > 0.1,
        ),
      url,
    )
    return readEdgeAudio()
  }
  for (const mode of ["absent", "inherit", "mute"]) {
    const attemptStart = await page.evaluate(() => window.audioAttempts.length)
    await page.evaluate((mode) => {
      window.previewPhaseEvents = []
      window.previewCommitted = false
      window.previewUnavailable = false
      window.mountAuthoredPreview(mode)
    }, mode)
    await page.waitForFunction(() => window.previewCommitted === true)
    const expected = await page.evaluate(
      () => window.previewScene.info().expectedRecap,
    )
    if (mode !== "mute") await waitForEdgeAudio(expected)
    else await page.waitForTimeout(150)
    const before = await readEdgeAudio()
    await page.evaluate(() => window.previewScene.clock({ elapsedMs: 700 }))
    await page.waitForTimeout(250)
    const after = await readEdgeAudio()
    check(
      mode + "-schema-retains-mode-and-authored-url",
      mode === "absent" ||
        (before.preview.audio?.mode === mode &&
          before.preview.audio?.url === previewUrl),
    )
    check(
      mode + "-never-starts-inactive-authored-url",
      after.attempts
        .slice(attemptStart)
        .every((attempt) => !attempt.src.endsWith(previewUrl)),
    )
    check(
      mode + "-no-implicit-opening-effect",
      !before.phaseEvents.includes("phase-start") &&
        !after.phaseEvents.includes("phase-start"),
      { before: before.phaseEvents, after: after.phaseEvents },
    )
    if (mode === "mute") {
      check(
        "mute-remains-silent",
        after.owners === 1 &&
          after.attributes["data-audio-url"] === "" &&
          after.audio.every((audio) => audio.paused || audio.ended),
        { after },
      )
    } else {
      const initial = activeEdgeAudio(before, expected),
        next = activeEdgeAudio(after, expected)
      check(
        mode + "-single-recap-bed-advances-without-replay",
        before.owners === 1 &&
          after.owners === 1 &&
          before.attributes["data-soundtrack-slot"] === "recap" &&
          after.attributes["data-soundtrack-slot"] === "recap" &&
          before.attributes["data-audio-url"] === expected &&
          after.attributes["data-audio-url"] === expected &&
          initial.length === 1 &&
          next.length === 1 &&
          initial[0].element === next[0].element &&
          next[0].time > initial[0].time &&
          before.attempts.length === after.attempts.length,
        { expected, before, after },
      )
    }
  }
  for (const role of ["manager", "spectator"]) {
    await page.evaluate((role) => {
      window.previewPhaseEvents = []
      window.mountTerminalHandoff(role)
    }, role)
    const url = await page.evaluate(() => window.terminalHandoff.expectedFinale)
    const started = await waitForEdgeAudio(url)
    await page.evaluate(() => window.terminalHandoff.pause(true))
    await page.waitForTimeout(120)
    const paused = await readEdgeAudio()
    await page.evaluate(() => window.terminalHandoff.pause(false))
    const before = await waitForEdgeAudio(url)
    check(
      role + "-finale-pause-resume-keeps-element-and-position",
      activeEdgeAudio(started, url).length === 1 &&
        activeEdgeAudio(paused, url).length === 0 &&
        activeEdgeAudio(before, url).length === 1 &&
        activeEdgeAudio(started, url)[0].element ===
          activeEdgeAudio(before, url)[0].element &&
        activeEdgeAudio(before, url)[0].time >=
          activeEdgeAudio(started, url)[0].time,
      { started, paused, before },
    )
    await page.evaluate(() => window.terminalHandoff.gap("closing"))
    await page.waitForTimeout(180)
    const closing = await readEdgeAudio()
    await page.evaluate(() => window.terminalHandoff.gap("closed"))
    await page.waitForTimeout(180)
    const closed = await readEdgeAudio()
    await page.evaluate(() => window.terminalHandoff.finished())
    await page.waitForTimeout(350)
    const finished = await readEdgeAudio()
    const observations = [closing, closed, finished],
      initial = activeEdgeAudio(before, url)[0]
    check(
      role + "-authored-finale-split-status-keeps-one-track",
      observations.every((state) => {
        const active = activeEdgeAudio(state, url)
        return (
          state.owners === 1 &&
          active.length === 1 &&
          active[0].element === initial?.element &&
          active[0].time >= initial?.time &&
          state.attempts.length === before.attempts.length &&
          state.attributes["data-audio-identity"] ===
            before.attributes["data-audio-identity"]
        )
      }),
      { before, closing, closed, finished },
    )
    check(
      role + "-closing-handoff-does-not-replay-question",
      closing.stage.mode === before.stage.mode &&
        closed.stage.mode === before.stage.mode &&
        observations.every(
          (state) =>
            !state.stage.cues
              .slice(before.stage.cues.length)
              .some((cue) =>
                [
                  "scene:picture-answers",
                  "scene:survey-results",
                  "scene:question",
                  "scene:countdown",
                ].includes(cue),
              ),
        ),
      {
        before: before.stage,
        closing: closing.stage,
        closed: closed.stage,
        finished: finished.stage,
      },
    )
    check(
      role + "-same-platform-curtain-remains-closed",
      closing.curtain === "closing" &&
        closed.curtain === "closed" &&
        finished.curtain === "closed",
    )
    await page.evaluate(() =>
      window.terminalHandoff.replay("finale-diagnostic"),
    )
    await page.waitForTimeout(900)
    const replay = await readEdgeAudio()
    check(
      role + "-same-game-replay-releases-final-ending",
      replay.terminal.scene.kind === "question" &&
        replay.attributes["data-soundtrack-slot"] === "question" &&
        activeEdgeAudio(replay, url).length === 0,
      { replay },
    )
    await page.evaluate(() =>
      window.terminalHandoff.replay("new-game-diagnostic"),
    )
    await page.waitForTimeout(250)
    const newGame = await readEdgeAudio()
    check(
      role + "-new-game-does-not-inherit-final-ending",
      newGame.terminal.gameId === "new-game-diagnostic" &&
        newGame.terminal.scene.kind === "question" &&
        newGame.attributes["data-soundtrack-slot"] === "question" &&
        !newGame.attributes["data-audio-identity"].includes(
          "finale-diagnostic:",
        ),
      { newGame },
    )
    await page.evaluate(() => window.terminalHandoff.staleLaunch())
    await page.waitForTimeout(200)
    const staleLaunch = await readEdgeAudio()
    check(
      role + "-active-question-rejects-stale-closing-launch",
      staleLaunch.terminal.scene.kind === "question" &&
        staleLaunch.attributes["data-soundtrack-slot"] === "question" &&
        activeEdgeAudio(staleLaunch, url).length === 0,
      { staleLaunch },
    )
  }
  check("no browser runtime errors", errors.length === 0, { errors })
  await page.screenshot({ path: path.join(evidence, "completed.png") })
  result.passed = result.checks.every((x) => x.passed)
} catch (error) {
  result.error = String(error)
  result.passed = false
  try {
    await captureAudio("failure")
  } catch (captureError) {
    result.diagnosticError = String(captureError)
  }
  try {
    await page.screenshot({ path: path.join(evidence, "failure.png") })
  } catch (captureError) {
    result.screenshotError = String(captureError)
  }
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
