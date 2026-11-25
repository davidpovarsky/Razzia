import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import http from "node:http"
import { createRequire } from "node:module"
import path from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    "source-root": { type: "string" },
    dependencies: { type: "string" },
    out: { type: "string" },
  },
  strict: true,
})
const sourceRoot = values["source-root"]
const { dependencies, out } = values
assert(
  sourceRoot &&
    dependencies &&
    out &&
    [sourceRoot, dependencies, out].every(path.isAbsolute),
  "Explicit absolute --source-root, --dependencies and --out are required",
)
const expectedChecks = [
  "live-v4-text-ownership",
  "live-original-text-ownership",
  "standalone-react-and-static-seeds",
  "new-question-and-replay",
  "deadline-clock-task-skew",
  "clock-future-pause-resume-finish",
]
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const sourcePins = {}
const result = {
  kind: "COUNTDOWN_TEXT_OWNERSHIP_REGRESSION",
  version: 1,
  sourceRoot,
  dependencies,
  sourcePins,
  setup: {
    dependenciesResolved: false,
    bundleBuilt: false,
    browserLaunched: false,
    fixtureReady: false,
  },
  expectedChecks,
  checks: [],
  passed: false,
  failureKind: null,
  network: "loopback-only",
  customerData: false,
  fixture:
    "Real production Stage/Scenes/Motion, React DOM and native Chromium WAAPI",
  scope: "Focused regression only; not a full-game or release qualification",
}
const fixtureSource = `import React, { createRef } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { renderToString } from "react-dom/server"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import { TadazzV4Stage } from "@countdown-source/extensions/src/presentation/tadazz-v4/TadazzV4Stage"
import { StageSceneV4 } from "@countdown-source/extensions/src/presentation/tadazz-v4/components"
import { OriginalThemeScene } from "@countdown-source/extensions/src/presentation/original-themes/OriginalThemeScene"
import { TadazzV4Motion } from "@countdown-source/extensions/src/presentation/tadazz-v4/motion"
import { ShowThemeScope } from "@countdown-source/extensions/src/presentation/show-themes/context"
import { resolveShowTheme } from "@countdown-source/extensions/src/core/show-themes/resolve"

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))
const waitFor = async (predicate: () => boolean, label: string) => {
  const limit = performance.now() + 6000
  while (!predicate()) {
    if (performance.now() >= limit) throw new Error("FIXTURE_WAIT:" + label)
    await nextFrame()
  }
}
const theme = resolveShowTheme({
  role: "manager",
  selection: { id: "royal-quiz", version: "1.0.0", overrides: {} },
})
if (theme.definition.id !== "royal-quiz") throw new Error("ORIGINAL_THEME_NOT_RESOLVED")
const wrap = (child: React.ReactNode, original = false) => (
  <I18nextProvider i18n={i18next}>
    {original ? <ShowThemeScope theme={theme}>{child}</ShowThemeScope> : child}
  </I18nextProvider>
)
const dataFor = (key: string, seconds: number, deadlineMs?: number) => ({
  questionKey: key, number: 1, total: 2, question: "Countdown ownership regression",
  mode: "quiz" as const, answers: [{ title: "First" }, { title: "Second" }],
  seconds, remainingSeconds: deadlineMs === undefined ? seconds :
    Math.min(seconds, Math.max(0, (deadlineMs - Date.now()) / 1000)),
  deadlineMs, cardsAlreadyOnStage: true, questionAlreadyOnStage: true,
})
const numberText = (node: Element) => Number(node.textContent)
const cleanup: Array<() => void> = []
const rootFor = () => {
  const element = document.createElement("div")
  element.style.cssText = "width:1920px;height:1080px;position:relative"
  document.body.appendChild(element)
  const root = createRoot(element)
  cleanup.push(() => { flushSync(() => root.unmount()); element.remove() })
  return { root, element }
}
const oneTimer = (element: Element) => {
  const nodes = element.querySelectorAll(".countdown-value")
  if (nodes.length !== 1) throw new Error("EXACTLY_ONE_TIMER_REQUIRED:" + nodes.length)
  return nodes[0] as HTMLElement
}
const sweepFor = (element: Element) => {
  const ring = element.querySelector(".timer-progress")
  if (!ring) throw new Error("TIMER_RING_REQUIRED")
  const animations = ring.getAnimations().filter((animation) =>
    animation.effect?.getKeyframes().some((frame) => frame.strokeDashoffset !== undefined))
  if (animations.length !== 1) throw new Error("EXACTLY_ONE_SWEEP_REQUIRED:" + animations.length)
  return animations[0]
}
const live = (original = false, seconds = 6, deadline = Date.now() + seconds * 1000) => {
  const { root, element } = rootFor()
  const ref = createRef<any>()
  const cues: string[] = []
  const data = dataFor("owner-question", seconds, deadline)
  flushSync(() => root.render(wrap(
    <TadazzV4Stage ref={ref} initialScene="countdown" initialData={data}
      onCue={(cue) => cues.push(cue.name)} />, original)))
  if (!ref.current) throw new Error("LIVE_STAGE_REF_REQUIRED")
  return { root, element, ref, cues, data, deadline, timer: () => oneTimer(element) }
}
const direct = (seconds: number, deadline?: number) => {
  const { root, element } = rootFor()
  const data = dataFor("direct-question", seconds, deadline)
  flushSync(() => root.render(wrap(
    <div className="tzv4-stage"><div className="tzv4-scene-root">
      <StageSceneV4 scene="countdown" data={data} assetBase="/assets/" />
    </div></div>)))
  const stage = element.querySelector(".tzv4-stage") as HTMLElement
  const cues: string[] = []
  const motion = new TadazzV4Motion(stage, { reducedMotion: true,
    onCue: (cue) => cues.push(cue.name) })
  cleanup.push(() => motion.dispose())
  const completion = motion.play("countdown", data)
  return { motion, completion, cues, element, deadline, seconds,
    timer: () => oneTimer(element), sweep: () => sweepFor(element) }
}
const sample = (clock: ReturnType<typeof direct>) => {
  const sweep = clock.sweep()
  const timing = sweep.effect!.getComputedTiming()
  const wall = Date.now()
  return {
    wall, performanceNow: performance.now(), documentTimeline: document.timeline.currentTime,
    startTime: sweep.startTime, currentTime: sweep.currentTime, playState: sweep.playState,
    playbackRate: sweep.playbackRate, duration: timing.duration, delay: timing.delay,
    progress: timing.progress, text: clock.timer().textContent,
    expectedRemainingMs: clock.deadline === undefined ? null :
      Math.min(clock.seconds * 1000, Math.max(0, clock.deadline - wall)),
    ringRemainingMs: clock.seconds * 1000 * (1 - (timing.progress ?? 0)),
  }
}

async function run(name: string) {
  const failures: Array<{ code: string; detail: unknown }> = []
  const observations: Record<string, unknown> = {}
  const check = (condition: boolean, code: string, detail: unknown) => {
    if (!condition) failures.push({ code, detail })
  }
  try {
    if (name === "live-v4-text-ownership" || name === "live-original-text-ownership") {
      const original = name === "live-original-text-ownership"
      const stage = live(original, 20)
      const host = stage.timer()
      const tag = original ? "SPAN" : "DIV"
      check(host.tagName === tag, "HOST_TAG_CHANGED", { actual: host.tagName, expected: tag })
      await waitFor(() => Math.ceil((stage.deadline - Date.now()) / 1000) < 20 &&
        numberText(host) > 1, "capture-real-remaining")
      const stale = { remainingSeconds: (stage.deadline - Date.now()) / 1000,
        deadlineMs: stage.deadline }
      const staleText = String(Math.ceil(stale.remainingSeconds)).padStart(2, "0")
      await waitFor(() => numberText(host) < Number(staleText), "engine-advanced-after-snapshot")
      const before = host.textContent
      const beforeCues = [...stage.cues]
      flushSync(() => stage.ref.current.patchData(stale))
      const after = stage.timer().textContent
      observations.patch = { before, after, staleText, stale, sameHost: stage.timer() === host,
        beforeCues, afterCues: [...stage.cues] }
      check(after === before, "MOTION_TEXT_OVERWRITTEN_BY_REACT", observations.patch)
      check(stage.timer() === host, "TIMER_REMOUNTED_ON_PATCH", observations.patch)
      check(JSON.stringify(stage.cues) === JSON.stringify(beforeCues),
        "SCENE_RESTARTED_ON_PATCH", observations.patch)
    } else if (name === "standalone-react-and-static-seeds") {
      for (const original of [false, true]) {
        const { root, element } = rootFor()
        const render = (remaining: number) => original
          ? <OriginalThemeScene family="royal-quiz" scene="countdown"
              data={{ ...dataFor("standalone", 20), remainingSeconds: remaining }} />
          : <StageSceneV4 scene="countdown" assetBase="/assets/"
              data={{ ...dataFor("standalone", 20), remainingSeconds: remaining }} />
        const html = renderToString(wrap(render(7.25), original))
        check(/data-testid="tadazz-timer"[^>]*>08</.test(html),
          "STATIC_INITIAL_SEED_WRONG", { original, html: html.match(/.{0,50}tadazz-timer.{0,60}/)?.[0] })
        flushSync(() => root.render(wrap(render(7.25), original)))
        const host = oneTimer(element)
        check(host.textContent === "08", "INITIAL_REACT_SEED_WRONG", { original, text: host.textContent })
        flushSync(() => root.render(wrap(render(3.25), original)))
        check(host === oneTimer(element) && host.textContent === "04",
          "STANDALONE_REACT_UPDATE_LOST", { original, text: host.textContent })
      }
    } else if (name === "new-question-and-replay") {
      for (const original of [false, true]) {
        const stage = live(original)
        const first = stage.timer()
        const secondData = dataFor("new-question", 9, Date.now() + 9000)
        flushSync(() => { void stage.ref.current.play("countdown", secondData) })
        const second = stage.timer()
        check(first !== second && second.textContent === "09",
          "NEW_QUESTION_NOT_RESEEDED", { original, remounted: first !== second, text: second.textContent })
        const replayData = { ...dataFor("new-question", 4, Date.now() + 4000),
          questionAlreadyOnStage: false, cardsAlreadyOnStage: false }
        flushSync(() => { void stage.ref.current.play("countdown", replayData) })
        const replay = stage.timer()
        check(replay !== second && replay.textContent === "04",
          "REPLAY_NOT_RESEEDED", { original, remounted: replay !== second, text: replay.textContent })
      }
    } else if (name === "deadline-clock-task-skew") {
      const deadline = Date.now() + 20000
      const running = direct(20, deadline)
      await running.sweep().ready
      await nextFrame()
      observations.before = sample(running)
      const busyStart = performance.now()
      while (performance.now() - busyStart < 1100) { /* One bounded stale-timeline task. */ }
      observations.afterBusy = sample(running)
      running.motion.syncCountdown({ deadlineMs: deadline })
      observations.afterSync = sample(running)
      // New/restarted clock must also have correct synchronous text before a frame.
      const initial = direct(20, deadline)
      const immediate = sample(initial)
      observations.immediateInitial = immediate
      check(immediate.text === String(Math.ceil(immediate.expectedRemainingMs! / 1000)).padStart(2, "0"),
        "INITIAL_TEXT_USES_STALE_TIMELINE", immediate)
      await nextFrame()
      await nextFrame()
      const after = sample(running), initialAfter = sample(initial)
      observations.afterFrame = after
      observations.initialAfterFrame = initialAfter
      const measuredBefore = observations.before as ReturnType<typeof sample>
      const measuredBusy = observations.afterBusy as ReturnType<typeof sample>
      const timelineLag = (measuredBusy.performanceNow - measuredBefore.performanceNow) -
        (Number(measuredBusy.documentTimeline) - Number(measuredBefore.documentTimeline))
      check(timelineLag >= 900, "STALE_TIMELINE_DISCRIMINATOR_NOT_ESTABLISHED", { timelineLag })
      for (const [role, point] of [["running", after], ["initial", initialAfter]] as const) {
        check(point.playbackRate === 1, "CLOCK_RATE_CHANGED", { role, point })
        check(Math.abs(point.ringRemainingMs - point.expectedRemainingMs!) < 100,
          "CLOCK_AHEAD_OF_AUTHORITATIVE_DEADLINE", { role, point })
        check(point.text === String(Math.ceil(point.expectedRemainingMs! / 1000)).padStart(2, "0"),
          "TEXT_DISAGREES_WITH_AUTHORITATIVE_DEADLINE", { role, point })
      }
    } else if (name === "clock-future-pause-resume-finish") {
      const deadline = Date.now() + 6000
      const clock = direct(4, deadline) // Starts two seconds in the future.
      await nextFrame()
      const future = sample(clock)
      observations.future = future
      check(future.text === "04" && future.ringRemainingMs === 4000,
        "FUTURE_CLOCK_DRAINS_BEFORE_OPEN", future)
      await waitFor(() => Date.now() >= deadline - 4000 + 300, "future-clock-opens")
      const opened = sample(clock)
      observations.opened = opened
      check(Math.abs(opened.ringRemainingMs - opened.expectedRemainingMs!) < 100,
        "FUTURE_OPEN_DELAY_DOUBLED", opened)
      clock.motion.pause(1307)
      check(clock.timer().textContent === "02", "INITIAL_PAUSE_REMAINDER_WRONG", sample(clock))
      clock.motion.pause(2307)
      const held = clock.timer().textContent
      clock.motion.syncCountdown({ deadlineMs: Date.now() + 9000 })
      await nextFrame()
      check(held === "03" && clock.timer().textContent === "03" &&
        clock.sweep().playState === "paused", "AUTHORITATIVE_PAUSE_HOLD_LOST", sample(clock))
      clock.motion.resume()
      const resumedDeadline = Date.now() + 2307
      clock.motion.syncCountdown({ deadlineMs: resumedDeadline })
      await nextFrame()
      await nextFrame()
      const sweep = clock.sweep()
      const resumedMs = 4000 * (1 - (sweep.effect!.getComputedTiming().progress ?? 0))
      check(Math.abs(resumedMs - Math.max(0, resumedDeadline - Date.now())) < 100,
        "RESUME_CLOCK_WRONG", { resumedMs, expected: resumedDeadline - Date.now() })
      clock.motion.finishAll()
      await clock.completion
      await Promise.resolve()
      check(clock.timer().textContent === "00" &&
        clock.cues.filter((x) => x === "countdown-ended").length === 1,
        "FINISH_ALL_COMPLETION_CHANGED", { text: clock.timer().textContent, cues: clock.cues })
      const local = direct(4)
      local.motion.pause()
      local.motion.syncCountdown({ deadlineMs: Date.now() + 2000 })
      await nextFrame()
      check(local.sweep().playState === "paused" && local.timer().textContent === "02",
        "PAUSED_PREVIEW_SEEK_RESUMED", sample(local))
      local.motion.pause(2307)
      check(local.timer().textContent === "03", "LOCAL_PAUSED_PREVIEW_CHANGED", sample(local))
      local.motion.syncCountdown({ deadlineMs: Date.now() + 10000 })
      check(local.sweep().playState === "paused" && local.timer().textContent === "03",
        "PAUSED_SYNC_RESUMED_CLOCK", sample(local))
      local.motion.finishAll()
      await local.completion
      const natural = direct(1, Date.now() + 650)
      await natural.completion
      await Promise.resolve()
      check(natural.timer().textContent === "00" &&
        natural.cues.filter((x) => x === "countdown-ended").length === 1,
        "NATURAL_COMPLETION_CUE_CHANGED", { text: natural.timer().textContent, cues: natural.cues })
    } else {
      throw new Error("UNKNOWN_CHECK:" + name)
    }
  } catch (error) {
    failures.push({ code: "UNEXPECTED_CASE_EXCEPTION", detail: String(error) })
  } finally {
    while (cleanup.length) cleanup.pop()!()
  }
  return { name, passed: failures.length === 0, details: { observations, failures },
    ...(failures.length ? { error: failures.map((x) => x.code).join(",") } : {}) }
}
void i18next.init({ lng: "en", fallbackLng: "en", resources: { en: { translation: {} } } })
  .then(() => { (window as any).__countdownRegression = { ready: true, run } })
  .catch((error) => { (window as any).__countdownRegressionError = String(error) })
`
await fs.mkdir(out, { recursive: true })
const write = (name, raw) =>
  fs.writeFile(path.join(out, name), raw, { flag: "wx" })
let browser = undefined
let server = undefined

try {
  const requireDependencies = createRequire(
    path.join(dependencies, "package.json"),
  )
  const { build } = requireDependencies("esbuild")
  const { chromium } = requireDependencies("@playwright/test")
  result.setup.dependenciesResolved = true
  result.dependencyVersions = {
    esbuild: requireDependencies("esbuild/package.json").version,
    playwright: requireDependencies("@playwright/test/package.json").version,
  }
  const recordSource = async (filename) => {
    const rel = path.relative(sourceRoot, filename)

    if (rel && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) {
      sourcePins[rel.split(path.sep).join("/")] = digest(
        await fs.readFile(filename),
      )
    }
  }
  const resolveDependency = async (builder, args) => {
    const requested =
      args.path === "react-dom/server" ? "react-dom/server.browser" : args.path
    const reactSingleton = /^(?:react|react-dom)(?:\/|$)/.test(requested)
    const cachedRelative =
      typeof args.importer === "string" && path.isAbsolute(args.importer)
        ? path.relative(path.resolve(dependencies, ".."), args.importer)
        : null
    const fromCachedPackage =
      cachedRelative !== null &&
      !path.isAbsolute(cachedRelative) &&
      cachedRelative !== ".." &&
      !cachedRelative.startsWith(`..${path.sep}`) &&
      cachedRelative.split(path.sep).includes("node_modules")
    const resolveDirs =
      fromCachedPackage && !reactSingleton
        ? [args.resolveDir || path.dirname(args.importer)]
        : [dependencies, path.resolve(dependencies, "../packages/web")]
    let lastResolution = undefined
    for (const resolveDir of resolveDirs) {
      // Native esbuild resolution preserves browser exports and import/require kind.
      const resolved = await builder.resolve(requested, {
        kind: args.kind,
        importer: args.importer,
        namespace: args.namespace,
        resolveDir,
        pluginData: { countdownDependencyResolution: true },
      })
      // The reentry marker applies only to this nested resolve, never child imports.
      const resolution = { ...resolved }
      delete resolution.pluginData

      if (resolution.errors.length === 0) {
        return resolution
      }

      lastResolution = resolution
    }

    return lastResolution
  }
  const bundled = await build({
    stdin: {
      contents: fixtureSource,
      loader: "tsx",
      sourcefile: "countdown-regression-fixture.tsx",
      resolveDir: sourceRoot,
    },
    absWorkingDir: sourceRoot,
    outfile: path.join(out, "fixture.js"),
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "countdown-regression-source-and-existing-dependencies",
        setup(builder) {
          builder.onResolve({ filter: /^\/tadazz-show\// }, (args) => {
            if (args.kind !== "url-token") {
              return undefined
            }

            return { path: args.path, external: true }
          })
          builder.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
            path: path.resolve(
              args.resolveDir,
              args.path.slice(0, -"?inline".length),
            ),
            namespace: "countdown-inline-css",
          }))
          builder.onLoad(
            { filter: /.*/, namespace: "countdown-inline-css" },
            async (args) => {
              await recordSource(args.path)

              return {
                contents: `export default ${JSON.stringify(await fs.readFile(args.path, "utf8"))}`,
                loader: "js",
              }
            },
          )
          builder.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.pluginData?.countdownDependencyResolution === true) {
              return undefined
            }

            if (path.isAbsolute(args.path)) {
              return undefined
            }

            const roots = {
              "@countdown-source/": sourceRoot,
              "@razzia/common/": path.join(sourceRoot, "packages/common/src"),
              "@razzia/extensions/": path.join(sourceRoot, "extensions/src"),
              "@razzia/web/": path.join(sourceRoot, "packages/web/src"),
              "@razzia/socket/": path.join(sourceRoot, "packages/socket/src"),
            }
            for (const [prefix, root] of Object.entries(roots)) {
              if (args.path.startsWith(prefix)) {
                return builder.resolve(
                  path.join(root, args.path.slice(prefix.length)),
                  {
                    kind: args.kind,
                    resolveDir: sourceRoot,
                  },
                )
              }
            }
            for (const [prefix, root] of Object.entries(roots)) {
              if (args.path === prefix.slice(0, -1)) {
                return builder.resolve(root, {
                  kind: args.kind,
                  resolveDir: sourceRoot,
                })
              }
            }

            return resolveDependency(builder, args)
          })
          builder.onLoad({ filter: /.*/, namespace: "file" }, async (args) => {
            await recordSource(args.path)

            return undefined
          })
        },
      },
    ],
  })
  const js = bundled.outputFiles.find((file) =>
    file.path.endsWith(".js"),
  )?.contents
  const css =
    bundled.outputFiles.find((file) => file.path.endsWith(".css"))?.contents ??
    Buffer.from("")

  assert(
    js && Object.keys(sourcePins).length > 0,
    "Actual production bundle inputs required",
  )
  await write("fixture.tsx", fixtureSource)
  await write("fixture.js", js)
  await write("fixture.css", css)
  result.fixtureSha256 = digest(fixtureSource)
  result.bundleSha256 = digest(js)
  result.setup.bundleBuilt = true
  const blankSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
  server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")

    if (url.pathname === "/fixture.js") {
      response.writeHead(200, { "content-type": "text/javascript" })
      response.end(js)
    } else if (url.pathname === "/fixture.css") {
      response.writeHead(200, { "content-type": "text/css" })
      response.end(css)
    } else if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html" })
      response.end(
        '<!doctype html><html><head><meta charset="utf-8"/><link rel="stylesheet" href="/fixture.css"/></head><body><script src="/fixture.js"></script></body></html>',
      )
    } else {
      // Clock tests use no authored media; decorative asset requests stay local.
      response.writeHead(200, { "content-type": "image/svg+xml" })
      response.end(blankSvg)
    }
  })
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  assert(address && typeof address !== "string")
  const origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
  result.setup.browserLaunched = true
  result.browserVersion = browser.version()
  for (const name of expectedChecks) {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    })
    const pageErrors = []
    const externalRequests = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === origin) {
        return route.continue()
      }

      externalRequests.push(route.request().url().split("?")[0])

      return route.abort()
    })

    try {
      await page.goto(origin, { waitUntil: "load", timeout: 10000 })
      await page.waitForFunction(
        () => window.__countdownRegression?.ready === true,
        undefined,
        { timeout: 10000 },
      )
      result.setup.fixtureReady = true
      let timeout = undefined
      const check = await Promise.race([
        page.evaluate(
          (checkName) => window.__countdownRegression.run(checkName),
          name,
        ),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`CASE_TIMEOUT:${name}`)),
            15000,
          )
        }),
      ]).finally(() => clearTimeout(timeout))

      if (pageErrors.length || externalRequests.length) {
        check.passed = false
        check.error = `${check.error ? `${check.error},` : ""}BROWSER_OR_EXTERNAL_REQUEST_ERROR`
      }

      check.details.pageErrors = pageErrors
      check.details.externalRequests = externalRequests
      result.checks.push(check)
      await write(`${name}.json`, `${JSON.stringify(check, null, 2)}\n`)
    } finally {
      await page.close()
    }
  }
  for (const [name, sha] of Object.entries(sourcePins)) {
    assert.equal(
      digest(await fs.readFile(path.join(sourceRoot, name))),
      sha,
      `Source changed during regression: ${name}`,
    )
  }
  result.passed =
    result.checks.length === expectedChecks.length &&
    result.checks.every(
      (check, index) => check.name === expectedChecks[index] && check.passed,
    )
  result.failureKind = result.passed ? null : "BEHAVIORAL_FAILURE"
} catch (error) {
  result.failureKind = "SETUP_FAILURE"
  result.fatalError = String(error)
  result.fatalStack = error instanceof Error ? error.stack : undefined
} finally {
  await browser?.close()

  if (server) {
    await new Promise((resolve) => {
      server.close(resolve)
    })
  }
}

result.sourcePins = Object.fromEntries(
  Object.entries(sourcePins).sort((left, right) => {
    const leftValue = String(left)
    const rightValue = String(right)

    if (leftValue < rightValue) {
      return -1
    }

    if (leftValue > rightValue) {
      return 1
    }

    return 0
  }),
)
await write("result.json", `${JSON.stringify(result, null, 2)}\n`)
console.log(
  JSON.stringify({
    passed: result.passed,
    failureKind: result.failureKind,
    result: path.join(out, "result.json"),
    checks: result.checks.map(({ name, passed }) => ({ name, passed })),
  }),
)
process.exitCode = result.passed ? 0 : 1
