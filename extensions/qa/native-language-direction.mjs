import fs from "node:fs/promises"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"

const source = process.env.LANGUAGE_SOURCE
const deps = process.env.LANGUAGE_DEPS
const evidence = process.env.LANGUAGE_EVIDENCE
const boundary = process.env.LANGUAGE_BOUNDARY
const componentsOverride = process.env.LANGUAGE_COMPONENTS
const before = process.env.LANGUAGE_BASELINE === "true"

if (!source || !deps || !evidence || !boundary) {
  throw new Error("Explicit isolated paths required")
}

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
const components = path.join(
  source,
  "extensions/src/presentation/tadazz-v4/components.tsx",
)
let baselineBoundary = undefined

if (before) {
  const host = await fs.readFile(
    path.join(
      source,
      "packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx",
    ),
    "utf8",
  )
  const start = host.indexOf(
    "export function TadazzShowView(props: TadazzShowViewProps) {",
  )
  const end = host.indexOf("\nfunction TadazzShowContent(", start)

  if (start < 0 || end < 0) {
    throw new Error("Prior actual presentation locale scope not found")
  }

  baselineBoundary = host
    .slice(start, end)
    .replace(
      "export function TadazzShowView(props: TadazzShowViewProps)",
      "export function PresentationLocale({locale,children}: {locale?:unknown;children:ReactNode})",
    )
    .replace(
      "const defaults = props.extensionState?.extras.defaults as\n    { presentationLocale?: unknown } | undefined",
      "const defaults = {presentationLocale:locale}",
    )
    .replace(
      "locale?:unknown;children:ReactNode}",
      "locale?:unknown;children:ReactNode}",
    )
    .replace("{locale,children}:", "{locale:fixtureLocale,children}:")
    .replace(
      "{presentationLocale:locale}",
      "{presentationLocale:fixtureLocale}",
    )
    .replace("<TadazzShowContent {...props} />", "{children}")

  if (
    baselineBoundary.includes("props") ||
    !baselineBoundary.includes("<I18nextProvider")
  ) {
    throw new Error("Prior provider-only scope extraction failed")
  }

  baselineBoundary = `import {useMemo,type ReactNode} from "react";import {I18nextProvider,useTranslation} from "react-i18next";\n${
    baselineBoundary
  }`
}

await fs.mkdir(evidence, { recursive: true })
const entry = `
import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import i18next from 'i18next';
import {initReactI18next,I18nextProvider,useTranslation} from 'react-i18next';
import {PresentationLocale} from ${JSON.stringify(boundary)};
import {TadazzV4StageAdapter} from ${JSON.stringify(adapter)};
import {planTransition,runSteps} from ${JSON.stringify(director)};
const rootI18n=i18next.createInstance();
function Stage(){
 const {i18n,t}=useTranslation();const stage=useRef(null);const previous=useRef(null);const question=useRef(null);const selected=useRef([]);
 const drive=async(next)=>{const h=stage.current;const steps=planTransition(previous.current,next,{questionKey:h.questionKey,mode:h.mode});previous.current=next;await runSteps(h,steps,()=>true)};
 window.languageStage={
  language:()=>i18n.language,
  async question(text,count,key){selected.current=[];question.current={key,question:text,number:1,totalQuestions:23,answerCount:count,options:[]};await drive({kind:'question',key:'q:'+key,question:question.current})},
  async answers(){const q=question.current;question.current={...q,options:Array.from({length:q.answerCount},(_,i)=>({label:['Alpha','Bravo','Charlie','Delta','Echo'][i]}))};await drive({kind:'voting',key:'v:'+q.key,question:question.current,seconds:null})},
  async results(){const q=question.current;await drive({kind:'results',key:'r:'+q.key,question:q,reveal:{mode:'quiz',counts:q.options.map((_,i)=>i===0?1:0),percentages:q.options.map((_,i)=>i===0?100:0),solutions:[0]}})},
  selected:()=>selected.current,
 };
 return <TadazzV4StageAdapter ref={stage} interactive onSelectOption={index=>selected.current.push(index)} labels={{votingOpen:t('vote'),audienceResults:t('results'),correctAnswer:t('correct')}} v4Labels={{storyRound:t('round'),questionLabel:t('question')}}/>;
}
function App(){const [locale,setLocale]=useState('en');window.setGameLocale=value=>flushSync(()=>setLocale(value));return <PresentationLocale locale={locale}><Stage/></PresentationLocale>}
rootI18n.use(initReactI18next).init({lng:'he',fallbackLng:'en',initAsync:false,resources:{en:{translation:{vote:'VOTING OPEN',results:'AUDIENCE RESULTS',correct:'CORRECT ANSWER',round:'ROUND',question:'QUESTION'}},he:{translation:{vote:'ההצבעה פתוחה',results:'תוצאות הקהל',correct:'תשובה נכונה',round:'סבב',question:'שאלה'}}}}).then(()=>createRoot(document.getElementById('root')).render(<I18nextProvider i18n={rootI18n}><App/></I18nextProvider>));
`
const plugins = [
  {
    name: "actual-native-locale-boundary",
    setup(builder) {
      builder.onResolve({ filter: /^@razzia\// }, async (args) => {
        const [, scope, ...parts] = args.path.split("/")
        const base =
          scope === "extensions"
            ? path.join(source, "extensions/src")
            : path.join(source, "packages", scope, "src")
        for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
          const file = path.join(base, ...parts) + suffix

          try {
            if ((await fs.stat(file)).isFile()) {
              return { path: file }
            }
          } catch {
            // A candidate path may be absent; try the remaining extensions.
          }
        }
        throw new Error(`Unresolved actual workspace ${args.path}`)
      })
      builder.onResolve({ filter: /^[^./]/ }, async (args) => {
        if (
          args.pluginData?.cachedDependency ||
          args.path.startsWith("@razzia/") ||
          args.importer.startsWith(`${deps}/`)
        ) {
          return
        }

        for (const workspace of ["packages/web", "extensions"]) {
          const resolved = await builder.resolve(args.path, {
            kind: args.kind,
            resolveDir: path.join(deps, workspace),
            pluginData: { cachedDependency: true },
          })

          if (!resolved.errors.length) {
            return { path: resolved.path, external: resolved.external }
          }
        }
        throw new Error(`Unresolved cached browser dependency ${args.path}`)
      })
      builder.onLoad({ filter: /presentation-locale\.tsx$/ }, async (args) =>
        args.path === boundary
          ? {
              contents: before
                ? baselineBoundary
                : await fs.readFile(boundary, "utf8"),
              loader: "tsx",
              resolveDir: path.dirname(boundary),
            }
          : undefined,
      )

      if (componentsOverride) {
        builder.onLoad({ filter: /components\.tsx$/ }, async (args) =>
          args.path === components
            ? {
                contents: await fs.readFile(componentsOverride, "utf8"),
                loader: "tsx",
                resolveDir: path.dirname(components),
              }
            : undefined,
        )
      }
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
  define: { "process.env.NODE_ENV": '"production"' },
  external: ["/tadazz-show/*"],
  loader: { ".woff2": "file", ".png": "file", ".jpg": "file", ".svg": "file" },
  stdin: { contents: entry, loader: "tsx", resolveDir: source },
  outfile: path.join(evidence, "fixture.js"),
})
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost")
    let file = undefined

    if (url.pathname === "/fixture.js" || url.pathname === "/fixture.css") {
      file = path.join(evidence, url.pathname.slice(1))
    } else if (url.pathname.startsWith("/tadazz-show/")) {
      file = path.join(source, "packages/web/public", url.pathname.slice(1))
    } else {
      response.writeHead(200, { "Content-Type": "text/html" })
      response.end(
        '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:#101a31}</style><div id="root"></div><script src="/fixture.js"></script></html>',
      )

      return
    }

    const getAssetContentType = () => {
      if (file.endsWith(".js")) {
        return "text/javascript"
      }

      if (file.endsWith(".css")) {
        return "text/css"
      }

      if (file.endsWith(".png")) {
        return "image/png"
      }

      if (file.endsWith(".svg")) {
        return "image/svg+xml"
      }

      if (file.endsWith(".woff2")) {
        return "font/woff2"
      }

      return "image/jpeg"
    }

    response.writeHead(200, {
      "Content-Type": getAssetContentType(),
    })
    response.end(await fs.readFile(file))
  } catch {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve)
})
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
})
const result = {
  fixture:
    "actual native adapter/director under Hebrew document; previous actual provider-only scope versus shared PresentationLocale",
  source,
  before,
  checks: [],
  network: "isolated loopback",
  documentLocale: "he",
}
const check = (name, passed, details = {}) =>
  result.checks.push({ name, passed: Boolean(passed), ...details })

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => window.languageStage?.language())
  const cases = [
    {
      id: "english-three",
      locale: "en",
      text: "Who was the last speaker that we had in sem?",
      count: 3,
      dir: "ltr",
    },
    {
      id: "hebrew-three",
      locale: "he",
      text: "מי היה הדובר האחרון שלנו?",
      count: 3,
      dir: "rtl",
    },
    {
      id: "english-content-hebrew-game",
      locale: "he",
      text: "Who was the last speaker that we had in sem?",
      count: 3,
      dir: "ltr",
    },
    {
      id: "english-five",
      locale: "en",
      text: "Which answer is correct?",
      count: 5,
      dir: "ltr",
    },
  ]
  for (const c of cases) {
    await page.evaluate((receivedC) => {
      window.setGameLocale(receivedC.locale)

      return window.languageStage.question(
        receivedC.text,
        receivedC.count,
        receivedC.id,
      )
    }, c)
    await page.locator(".q-text").waitFor({ state: "visible" })
    await page.evaluate(() => {
      window.originalQuestionNode = document.querySelector(".q-text")
    })
    await page.evaluate(() => window.languageStage.answers())
    await page.locator('[data-testid="tadazz-card-0"]').click()
    const voting = await page.evaluate(() => ({
      sameQuestion:
        document.querySelector(".q-text") === window.originalQuestionNode,
      selection: window.languageStage.selected(),
    }))
    await page.evaluate(() => window.languageStage.results())
    const observed = await page.evaluate(() => {
      const q = document.querySelector(".q-text")
      const text = q.firstChild
      const rectAt = (index) => {
        const range = document.createRange()
        range.setStart(text, index)
        range.setEnd(text, index + 1)
        const r = range.getBoundingClientRect()

        return { left: r.left, right: r.right, top: r.top }
      }
      const cards = Array.from(
        document.querySelectorAll("[data-v4-choice]"),
      ).map((n) => ({
        index: Number(n.dataset.index),
        left: n.getBoundingClientRect().left,
        top: n.getBoundingClientRect().top,
        number: n.querySelector(".answer-monogram")?.textContent?.trim(),
        correct: n.classList.contains("is-correct"),
      }))

      return {
        language: window.languageStage.language(),
        documentDirection: document.documentElement.dir,
        scopeDirection: document.querySelector(
          '[data-testid="tadazz-presentation-locale"]',
        )?.dir,
        questionDirection: getComputedStyle(q).direction,
        last: rectAt(text.length - 1),
        previous: rectAt(text.length - 2),
        cards,
        sameQuestion: window.originalQuestionNode === q,
        questionCount: document.querySelectorAll(".q-text").length,
      }
    })
    const reading = observed.cards
      .slice()
      .sort((a, b) => {
        if (Math.abs(a.top - b.top) > 10) {
          return a.top - b.top
        }

        if (c.locale === "he") {
          return b.left - a.left
        }

        return a.left - b.left
      })
      .map((x) => x.index)
    check(
      `${c.id}: answer order follows show locale`,
      JSON.stringify(reading) ===
        JSON.stringify(Array.from({ length: c.count }, (_, i) => i)),
      { reading },
    )
    const punctuation =
      c.dir === "ltr"
        ? observed.last.left >= observed.previous.right - 2
        : observed.last.right <= observed.previous.left + 2
    check(
      `${c.id}: terminal punctuation follows question content`,
      punctuation && observed.questionDirection === c.dir,
      {
        direction: observed.questionDirection,
        last: observed.last,
        previous: observed.previous,
      },
    )
    check(
      `${c.id}: original answer index and correct choice stay bound`,
      JSON.stringify(voting.selection) === "[0]" &&
        observed.cards.every(
          (x) =>
            x.number === String(x.index + 1) && x.correct === (x.index === 0),
        ),
    )
    check(
      `${c.id}: question node persists through answers and reveal`,
      voting.sameQuestion &&
        observed.sameQuestion &&
        observed.questionCount === 1,
    )
    check(
      `${c.id}: per-show language leaves editor document unchanged`,
      observed.language === c.locale && observed.documentDirection === "rtl",
    )

    if (c.id === "english-three" || c.id === "hebrew-three") {
      await page.screenshot({ path: path.join(evidence, `${c.id}.png`) })
    }
  }
  check("no browser runtime errors", errors.length === 0, { errors })
  result.passed = result.checks.every((x) => x.passed)
} catch (error) {
  result.passed = false
  result.error = String(error)
} finally {
  await browser.close()
  await new Promise((resolve) => {
    server.close(resolve)
  })
}

await fs.writeFile(
  path.join(evidence, "receipt.json"),
  `${JSON.stringify(result, null, 2)}\n`,
)
console.log(JSON.stringify(result))

if (!result.passed) {
  process.exitCode = 1
}
