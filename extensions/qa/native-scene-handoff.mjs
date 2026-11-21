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
await fs.mkdir(evidence, { recursive: true })
const entry = `
import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {TadazzV4StageAdapter} from ${JSON.stringify(adapter)};
import {planTransition,runSteps} from ${JSON.stringify(director)};
const q1={key:'first#1',question:'FIRST QUESTION',number:1,totalQuestions:23,answerCount:3,options:[]};
const options=[{label:'Alpha'},{label:'Bravo'},{label:'Charlie'}];
function App(){
 const stage=useRef(null);const previous=useRef(null);const [custom,setCustom]=useState(null);
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
  mode:()=>stage.current?.mode,
 };
 return <TadazzV4StageAdapter ref={stage} customScreen={custom}/>;
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
    else if (url.pathname.startsWith("/tadazz-show/"))
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
  await page.goto("http://127.0.0.1:" + server.address().port)
  await page.waitForFunction(() => window.handoff?.mode())
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
