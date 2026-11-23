import { chromium } from "@playwright/test"
import { createServer } from "node:http"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

const root = fileURLToPath(new URL("../../", import.meta.url))
const output = path.join(
  root,
  "docs/extensions/plans/editor-hebrew-20261118/private-font-build",
)
const artifact = path.join(output, "artifact")
await mkdir(output, { recursive: true })
const css = await readFile(path.join(artifact, "renderer.css"), "utf8")
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src data:; connect-src 'self'; frame-src 'self'; media-src 'self'; base-uri 'none'; object-src 'none'"
const frame = {
  show: {
    format: "tada-show",
    version: 1,
    title: "בדיקת עברית QA",
    baseGameMode: "quiz",
    defaults: {
      showTheme: { id: "razzia-original", version: "1.0.0", overrides: {} },
    },
    cards: [
      {
        kind: "quiz",
        key: "Q01",
        question: "מה התשובה הנכונה לשאלה QA מספר 12?",
        answers: [{ text: "עברית English 123" }, { text: "English עברית 456" }],
        correctAnswers: [1],
      },
    ],
    settings: [],
  },
  chapterIndex: 0,
  clock: {
    epoch: 1,
    sequence: 0,
    elapsedMs: 0,
    deadlineMs: null,
    paused: true,
  },
  role: "manager",
  locale: "he",
  reducedMotion: true,
  soundEnabled: false,
  mediaRevealed: false,
  appearanceRevision: 0,
}
const frameScript = `(${async function inspectNativeFrame() {
  const { mount } = await import("/renderer.mjs")
  const rendererCss = await fetch("/renderer.css").then((r) => r.text())
  const rendererFrame = await fetch("/frame.json").then((r) => r.json())
  const instances = new Map()
  const violations = []
  const failures = []
  document.addEventListener("securitypolicyviolation", (event) => {
    violations.push({
      directive: event.violatedDirective,
      blocked: event.blockedURI,
    })
  })
  const faces = () =>
    Array.from(document.fonts).map((face) => ({
      family: face.family,
      status: face.status,
      weight: face.weight,
      style: face.style,
      unicodeRange: face.unicodeRange,
    }))
  window.audit = {
    faces,
    violations,
    failures,
    async create(name, { fallback = false, immediateDispose = false } = {}) {
      const target = document.createElement("div")
      target.id = name
      target.style.cssText =
        "width:960px;height:540px;position:relative;overflow:hidden;margin:0;"
      document.body.append(target)
      const originalReplace = CSSStyleSheet.prototype.replaceSync

      if (fallback) {
        CSSStyleSheet.prototype.replaceSync = undefined
      }

      let instance = undefined

      try {
        instance = mount(target, rendererCss, () => failures.push(name))
      } finally {
        if (fallback) {
          CSSStyleSheet.prototype.replaceSync = originalReplace
        }
      }

      instances.set(name, { instance, target })
      const result = instance.update(rendererFrame)

      if (immediateDispose) {
        instance.dispose()
      }

      await Promise.race([
        result,
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("Native update did not settle")),
            15000,
          )
        }),
      ])
      await document.fonts.ready
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })

      return this.snapshot(name)
    },
    snapshot(name) {
      const target = instances.get(name)?.target
      const textElements = target?.shadowRoot
        ? Array.from(target.shadowRoot.querySelectorAll("*")).filter(
            (element) =>
              Array.from(element.childNodes).some(
                (node) =>
                  node.nodeType === Node.TEXT_NODE &&
                  /[\u0590-\u05ff]/u.test(node.textContent ?? ""),
              ),
          )
        : []

      return {
        faces: faces(),
        fontsReady: document.fonts.status,
        checkHebrew: document.fonts.check('600 24px "Rubik Variable"', "עברית"),
        text: target?.shadowRoot?.textContent?.slice(-5000),
        textFonts: textElements.map((element) => ({
          tag: element.tagName,
          text: element.textContent,
          family: getComputedStyle(element).fontFamily,
          weight: getComputedStyle(element).fontWeight,
          direction: getComputedStyle(element).direction,
        })),
        styleParserCount: document.head.querySelectorAll(
          'style[media="not all"]',
        ).length,
      }
    },
    dispose(name) {
      const entry = instances.get(name)
      entry.instance.dispose()
      entry.target.remove()
      instances.delete(name)

      return faces()
    },
  }
}})()`
const serve = async (req, res) => {
  res.setHeader("Content-Security-Policy", csp)
  const url = new URL(req.url, "http://127.0.0.1")

  try {
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(
        '<!doctype html><meta charset="utf-8"><title>Isolated native Hebrew font proof</title><body style="margin:0;background:#0a0a0a"><iframe id="native-a" src="/frame.html" style="display:block;border:0;width:960px;height:540px"></iframe><iframe id="native-b" src="/frame.html" style="display:block;border:0;width:960px;height:540px"></iframe></body>',
      )
    } else if (url.pathname === "/frame.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(
        '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><body style="margin:0;background:#0a0a0a"><script type="module" src="/frame-harness.mjs"></script></body></html>',
      )
    } else if (url.pathname === "/frame-harness.mjs") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8")
      res.end(frameScript)
    } else if (url.pathname === "/frame.json") {
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify(frame))
    } else if (
      url.pathname === "/renderer.mjs" ||
      url.pathname === "/renderer.css"
    ) {
      res.setHeader(
        "Content-Type",
        url.pathname.endsWith(".css") ? "text/css" : "text/javascript",
      )
      res.end(await readFile(path.join(artifact, url.pathname.slice(1))))
    } else {
      const publicRoot = path.join(root, "packages/web/public")
      const filename = path.resolve(
        publicRoot,

        `.${decodeURIComponent(url.pathname)}`,
      )

      if (!filename.startsWith(publicRoot + path.sep)) {
        throw new Error("Outside fixture")
      }

      const types = {
        ".webp": "image/webp",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".mp3": "audio/mpeg",
        ".json": "application/json",
      }
      res.setHeader(
        "Content-Type",
        types[path.extname(filename)] ?? "application/octet-stream",
      )
      res.end(await readFile(filename))
    }
  } catch {
    res.writeHead(404)
    res.end("Not found")
  }
}
const server = createServer((req, res) => void serve(req, res))
await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve)
})
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1000, height: 1120 } })
const errors = []
const requests = []
page.on("pageerror", (error) => errors.push(String(error)))
page.on("response", (response) =>
  requests.push({ url: response.url(), status: response.status() }),
)
const receipt = {
  startedAt: new Date().toISOString(),
  scope:
    "Actual temporary native renderer artifact in isolated iframe documents and ShadowRoots; parent has no font stylesheet. Release digest admission is a separate root gate.",
  csp,
  cssSha256: createHash("sha256").update(css).digest("hex"),
  embeddedFontFaces: (css.match(/@font-face/g) ?? []).length,
  embeddedWoff2Sources: (css.match(/data:[^,;]*font[^,]*;base64,/g) ?? [])
    .length,
  checks: {},
  errors,
  requests,
}

try {
  await page.goto(base)
  const iframeA = page.frames().find((item) => item.name() === "native-a")
  const iframeB = page.frames().find((item) => item.name() === "native-b")
  assert(iframeA && iframeB)
  await Promise.all(
    [iframeA, iframeB].map((item) =>
      item.waitForFunction(() => Boolean(window.audit)),
    ),
  )
  receipt.checks.parentBefore = await page.evaluate(() =>
    Array.from(document.fonts).map((face) => face.family),
  )
  assert.equal(receipt.checks.parentBefore.length, 0)
  receipt.checks.original = await iframeA.evaluate(() =>
    window.audit.create("original"),
  )
  assert.equal(receipt.checks.original.faces.length, 6)
  assert(
    receipt.checks.original.faces.every(
      (face) =>
        face.family.replaceAll('"', "") === "Rubik Variable" &&
        face.status === "loaded" &&
        face.weight === "300 900",
    ),
  )
  assert(
    receipt.checks.original.faces.some((face) =>
      face.unicodeRange.includes("U+590-5FF"),
    ),
  )
  assert(
    receipt.checks.original.textFonts.some(
      (item) =>
        item.text.includes("שאלה QA") && item.family.includes("Rubik Variable"),
    ),
  )
  receipt.checks.duplicate = await iframeA.evaluate(() =>
    window.audit.create("duplicate"),
  )
  assert.equal(receipt.checks.duplicate.faces.length, 6)
  receipt.checks.otherDocument = await iframeB.evaluate(() =>
    window.audit.create("independent"),
  )
  assert.equal(receipt.checks.otherDocument.faces.length, 6)
  await page
    .locator("#native-a")
    .screenshot({ path: path.join(output, "native-hebrew-iframe.png") })
  receipt.checks.afterFirstDispose = await iframeA.evaluate(() =>
    window.audit.dispose("original"),
  )
  assert.equal(receipt.checks.afterFirstDispose.length, 6)
  receipt.checks.afterLastDispose = await iframeA.evaluate(() =>
    window.audit.dispose("duplicate"),
  )
  assert.equal(receipt.checks.afterLastDispose.length, 0)
  receipt.checks.otherStillOwned = await iframeB.evaluate(() =>
    window.audit.faces(),
  )
  assert.equal(receipt.checks.otherStillOwned.length, 6)
  receipt.checks.disposedBeforeReady = await iframeA.evaluate(() =>
    window.audit.create("dispose-early", { immediateDispose: true }),
  )
  assert.equal(receipt.checks.disposedBeforeReady.faces.length, 0)
  await iframeA.evaluate(() => window.audit.dispose("dispose-early"))
  receipt.checks.fallback = await iframeA.evaluate(() =>
    window.audit.create("fallback", { fallback: true }),
  )
  assert.equal(receipt.checks.fallback.faces.length, 6)
  assert(
    receipt.checks.fallback.faces.every((face) => face.status === "loaded"),
  )
  assert.equal(receipt.checks.fallback.styleParserCount, 0)
  assert(
    receipt.checks.fallback.textFonts.some(
      (item) =>
        item.text.includes("שאלה QA") && item.family.includes("Rubik Variable"),
    ),
  )
  await page
    .locator("#native-a")
    .screenshot({ path: path.join(output, "native-hebrew-style-fallback.png") })
  await iframeA.evaluate(() => window.audit.dispose("fallback"))
  await iframeB.evaluate(() => window.audit.dispose("independent"))
  receipt.checks.final = {
    parent: await page.evaluate(() =>
      Array.from(document.fonts).map((face) => face.family),
    ),
    first: await iframeA.evaluate(() => ({
      faces: window.audit.faces(),
      violations: window.audit.violations,
      failures: window.audit.failures,
    })),
    second: await iframeB.evaluate(() => ({
      faces: window.audit.faces(),
      violations: window.audit.violations,
      failures: window.audit.failures,
    })),
  }
  assert.deepEqual(receipt.checks.final.parent, [])
  assert.deepEqual(receipt.checks.final.first, {
    faces: [],
    violations: [],
    failures: [],
  })
  assert.deepEqual(receipt.checks.final.second, {
    faces: [],
    violations: [],
    failures: [],
  })
  assert.deepEqual(errors, [])
  assert(requests.every((item) => item.url.startsWith(base)))
  receipt.passed = true
} catch (error) {
  receipt.passed = false
  receipt.failure = String(error.stack ?? error)
  await page.screenshot({
    path: path.join(output, "failure.png"),
    fullPage: true,
  })
  process.exitCode = 1
} finally {
  receipt.finishedAt = new Date().toISOString()
  await writeFile(
    path.join(output, "iframe-font-proof.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  )
  console.log(
    JSON.stringify({
      passed: receipt.passed,
      checks: Object.keys(receipt.checks),
      failure: receipt.failure,
      errors,
    }),
  )
  await browser.close()
  await new Promise((resolve) => {
    server.close(resolve)
  })
}
