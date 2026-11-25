import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createRequire } from "node:module"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "../../../..")
const output = process.env.STUDIO_DIAGNOSTICS

if (!output) {
  throw new Error("Set STUDIO_DIAGNOSTICS to an owned scratch directory")
}

await mkdir(output, { recursive: true })
const require = createRequire(join(repo, "extensions/package.json"))
const { build } = require("esbuild")
const { chromium } = require("@playwright/test")
const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim()
const sourcePaths = [
  ...new Set([
    ...git("diff", "--name-only").split("\n"),
    ...git("ls-files", "--others", "--exclude-standard").split("\n"),
  ]),
]
  .filter(
    (path) =>
      /\.(ts|tsx|mjs|json)$/.test(path) &&
      (path.startsWith("packages/") ||
        path.startsWith("extensions/") ||
        /browser-(check\.mjs|fixture\.tsx|i18n\.ts)$/.test(path)),
  )
  .sort((left, right) => {
    if (left < right) {
      return -1
    }

    if (left > right) {
      return 1
    }

    return 0
  })
const sourceReceipt = {
  checkedAt: new Date().toISOString(),
  baseCommit: git("rev-parse", "HEAD"),
  node: process.version,
  esbuild: require("esbuild").version,
  playwright: require("@playwright/test/package.json").version,
  fileSHA256: Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (path) => [
        path,
        createHash("sha256")
          .update(await readFile(join(repo, path)))
          .digest("hex"),
      ]),
    ),
  ),
}
const alias = {
  "@razzia/common": join(repo, "packages/common/src"),
  "@razzia/extensions": join(repo, "extensions/src"),
  "@razzia/socket": join(repo, "packages/socket/src"),
  "@razzia/web/i18n": join(here, "browser-i18n.ts"),
  "@razzia/web": join(repo, "packages/web/src"),
}
await build({
  entryPoints: [join(here, "browser-fixture.tsx")],
  tsconfig: join(repo, "packages/web/tsconfig.app.json"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  nodePaths: [
    join(repo, "packages/web/node_modules"),
    join(repo, "extensions/node_modules"),
  ],
  external: ["/tadazz-show/*"],
  outfile: join(output, "fixture.js"),
  alias,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "warning",
})
await build({
  stdin: {
    contents:
      'export { createDefaultQuizExtrasV2, computeCanonicalBaseDigest, quizExtrasV2Schema } from "@razzia/extensions/core"; export { quizzValidator } from "@razzia/common/validators/quizz";',
    resolveDir: repo,
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node26",
  outfile: join(output, "fixture-core.mjs"),
  alias,
  logLevel: "warning",
})
const {
  createDefaultQuizExtrasV2,
  computeCanonicalBaseDigest,
  quizExtrasV2Schema,
  quizzValidator,
} = await import(pathToFileURL(join(output, "fixture-core.mjs")))
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
]
const base = {
  id: "quiz-one",
  gameMode: "quiz",
  subject: "Original fixture",
  questions: ["First original question", "Second original question"].map(
    (question) => ({
      type: "single",
      question,
      answers: ["Yes", "No"],
      solutions: [0],
      cooldown: 2,
      time: 20,
    }),
  ),
}
const extras = createDefaultQuizExtrasV2(
  base.id,
  ids,
  computeCanonicalBaseDigest(base),
)
extras.perQuestion[ids[0]] = {
  answerVisuals: [
    {
      answerIndex: 0,
      display: "image",
      url: "/media/original.png",
      alt: "Original",
    },
  ],
}
const database = new Map([[base.id, { base, extras }]])
let failNextSave = false
let deferCreate = false
let releaseCreate = null
const saves = []
let created = 0
const errors = []
const cases = []
const json = (response, status, data) => {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(data))
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://fixture")
    const path = url.pathname

    if (path === "/fixture.js") {
      response.writeHead(200, { "content-type": "text/javascript" })
      response.end(await readFile(join(output, "fixture.js")))

      return
    }

    if (path.startsWith("/fixture/") || path.startsWith("/api/quizz/")) {
      const data = database.get(path.split("/").at(-1))
      json(response, data ? 200 : 404, data?.base ?? {})

      return
    }

    if (path.startsWith("/api/extensions/quizzes")) {
      const [, , , , id] = path.split("/")

      if (request.method === "GET") {
        const data = database.get(id)
        json(
          response,
          data ? 200 : 404,
          data
            ? {
                quizId: id,
                exists: true,
                extras: data.extras,
                baseDigest: data.extras.baseDigest,
              }
            : {},
        )

        return
      }

      let text = ""
      for await (const chunk of request) {
        text += chunk
      }
      const payload = JSON.parse(text)
      saves.push({
        method: request.method,
        id,
        expectedRevision: payload.expectedRevision,
      })

      if (failNextSave) {
        failNextSave = false
        json(response, 503, { error: "fixture outage" })

        return
      }

      if (request.method === "POST" && deferCreate) {
        deferCreate = false
        await new Promise((done) => {
          releaseCreate = done
        })
      }

      const existing = database.get(id)

      if (
        existing &&
        payload.expectedRevision !== null &&
        payload.expectedRevision !== existing.extras.revision
      ) {
        json(response, 409, {
          currentRevision: existing.extras.revision,
          expectedRevision: payload.expectedRevision,
        })

        return
      }

      const validated = quizzValidator.safeParse(payload.quizz)
      const validatedExtras = quizExtrasV2Schema.safeParse(payload.extras)

      if (!validated.success || !validatedExtras.success) {
        json(response, 422, {
          validation: validated.error?.issues,
          extras: validatedExtras.error?.issues,
        })

        return
      }

      if (!id) {
        created += 1
      }

      const targetId = id || `created-${created}`
      const revision = existing ? existing.extras.revision + 1 : 1
      const baseDigest = computeCanonicalBaseDigest(payload.quizz)
      database.set(targetId, {
        base: { ...payload.quizz, id: targetId },
        extras: { ...payload.extras, quizId: targetId, revision, baseDigest },
      })
      json(response, request.method === "POST" ? 201 : 200, {
        quizId: targetId,
        revision,
        baseDigest,
      })

      return
    }

    if (path.startsWith("/api/")) {
      json(response, 200, [])

      return
    }

    response.writeHead(200, { "content-type": "text/html" })
    response.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      *{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#f7f7f8;color:#222}
      header{padding:8px;background:white;border-bottom:1px solid #ddd}button{cursor:pointer;min-height:32px;padding:6px 12px;border-radius:8px;border:1px solid #ddd;background:#e9e7ff;color:#202030}button:disabled{opacity:.4;cursor:default}
      header>div, .actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}fieldset{margin:16px;border:1px solid #ddd}label{display:block;margin:8px}input{padding:6px;border:1px solid #ccc;border-radius:6px}output{display:none}svg{width:18px;height:18px}
      [role=dialog],[role=alertdialog]{position:fixed;inset:20% auto auto 50%;transform:translateX(-50%);padding:24px;background:white;border:1px solid #aaa;border-radius:12px;max-width:500px;width:calc(100% - 32px);z-index:100}
    </style></head><body><div id="root"></div><script>
      const owner = new URL(location.href).searchParams.get("owner") || "owner-one";
      localStorage.setItem("token", "e30."+btoa(JSON.stringify({sub:owner,role:"manager",exp:4102444800}))+".fixture");
    </script><script type="module" src="/fixture.js"></script></body></html>`)
  } catch (error) {
    errors.push(String(error))
    json(response, 500, { error: String(error) })
  }
})
await new Promise((done) => {
  server.listen(0, "127.0.0.1", done)
})
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage"],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
await context.addInitScript(() => {
  window.fixtureDraftWrites = []
  const original = Storage.prototype.setItem
  Storage.prototype.setItem = function setItem(key, value) {
    original.call(this, key, value)

    if (key.startsWith("tadazz:studio-draft:")) {
      window.fixtureDraftWrites.push(JSON.parse(value))
    }
  }
})
const inspect = async (page) =>
  JSON.parse(await page.getByTestId("inspector").textContent())
const check = async (page, condition, message) => {
  const start = Date.now()
  const poll = async () => {
    if (Date.now() - start >= 6000) {
      throw new Error(`${message} | ${JSON.stringify(await inspect(page))}`)
    }

    try {
      if (condition(await inspect(page))) {
        return
      }
    } catch {
      // The fixture may not have mounted its inspector yet.
    }

    await page.waitForTimeout(30)

    return poll()
  }

  await poll()
}
const recordCount = (page, ownerId = "owner-one", quizId = "quiz-one") =>
  page.evaluate(
    ({ owner, quiz }) =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith(
          `tadazz:studio-draft:v1:${owner}:${quiz === null ? "new" : `quiz-${quiz}`}:`,
        ),
      ).length,
    { owner: ownerId, quiz: quizId },
  )
const open = async (page, id = "quiz-one", extra = "") => {
  await page.goto(`${origin}/manager/quizz/${id}${extra}`)
  await check(
    page,
    (state) => state.ready === "ready" && state.snapshot,
    "Editor did not become ready",
  )
}
const attach = (page) => {
  page.setDefaultTimeout(6000)
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("dialog", (dialog) => dialog.accept())
}
const page = await context.newPage()
attach(page)

async function waitForCreate() {
  if (releaseCreate) {
    return
  }

  await page.waitForTimeout(20)

  return waitForCreate()
}

try {
  await open(page)
  const initial = (await inspect(page)).snapshot
  assert.equal((await inspect(page)).canUndo, false)
  await page.getByTestId("question-text").fill("Unsaved original content")
  await page.getByTestId("add-scene").click()
  await page.getByTestId("scene-title").fill("Recovered scene title")
  const scene = (await inspect(page)).snapshot.selectedTimelineId
  await page.getByTestId("duplicate").click()
  const duplicate = (await inspect(page)).snapshot.selectedTimelineId
  assert.notEqual(duplicate, scene)
  await page.getByTestId("studio-undo").click()
  await check(
    page,
    (state) => state.snapshot.extras.timeline.length === 3,
    "Undo duplicate",
  )
  await page.getByTestId("studio-redo").click()
  await check(
    page,
    (state) =>
      state.snapshot.extras.timeline.some((item) => item.id === duplicate),
    "Redo identity",
  )
  await page.getByTestId("remove").click()
  await page.getByTestId(`select-${initial.extras.timeline[1].id}`).click()
  await page.getByTestId("move-first").click()
  await page
    .getByTestId("question-text")
    .fill("Later edit survives structural undo")
  await page.getByTestId("edit-audio").click()
  await page.getByTestId("studio-undo").click()
  await check(
    page,
    (state) => state.snapshot.questionIds[0] === ids[0],
    "Undo question reorder",
  )
  let snap = (await inspect(page)).snapshot
  assert.equal(
    snap.values.questions[1].question,
    "Later edit survives structural undo",
  )
  assert.equal(snap.extras.audio.cues.start.volume, 0.17)
  await page.getByTestId(`select-${initial.extras.timeline[0].id}`).click()
  await page.getByTestId("remove").click()
  await check(
    page,
    (state) => state.snapshot.questionIds.length === 1,
    "Remove question",
  )
  await page.getByTestId("studio-undo").click()
  await check(
    page,
    (state) => state.snapshot.questionIds.length === 2,
    "Undo question deletion",
  )
  snap = (await inspect(page)).snapshot
  assert.deepEqual(
    snap.extras.perQuestion[ids[0]],
    initial.extras.perQuestion[ids[0]],
  )
  assert.equal(snap.values.questions[0].question, "Unsaved original content")
  await page.getByTestId(`select-${initial.extras.timeline[0].id}`).click()
  await page.getByTestId("convert-survey").click()
  await check(
    page,
    (state) => state.snapshot.values.questions[0].playMode === "survey",
    "Question conversion",
  )
  await page.getByTestId("studio-undo").click()
  assert.notEqual(
    (await inspect(page)).snapshot.values.questions[0].playMode,
    "survey",
  )
  await page.getByTestId("convert-scene").click()
  await page
    .getByRole("button", { name: "Convert to Scene", exact: true })
    .last()
    .click()
  await check(
    page,
    (state) => state.snapshot.questionIds.length === 1,
    "Confirmed scene conversion",
  )
  await page.getByTestId("studio-undo").click()
  await check(
    page,
    (state) => state.snapshot.questionIds.length === 2,
    "Undo scene conversion",
  )
  const recovery = (await inspect(page)).snapshot
  assert.equal((await inspect(page)).dirty, true)
  await page.waitForTimeout(450)
  assert.equal(await recordCount(page), 1)
  cases.push(
    "Actual providers: mixed add/duplicate/remove/reorder and quiz/survey/scene conversion Undo; exact IDs, attachments and later field/audio edits preserved",
  )
  await page.reload()
  await page.getByTestId("studio-draft-recovery").waitFor()
  assert.equal(saves.length, 0)
  await page.getByTestId("studio-draft-restore").click()
  await check(
    page,
    (state) =>
      state.snapshot.values.questions[0].question ===
      recovery.values.questions[0].question,
    "Existing draft restore",
  )
  snap = (await inspect(page)).snapshot
  assert.deepEqual(snap.questionIds, recovery.questionIds)
  assert.deepEqual(snap.extras.scenes, recovery.extras.scenes)
  assert.equal(snap.extras.audio.cues.start.volume, 0.17)
  assert.equal((await inspect(page)).dirty, true)
  await page.screenshot({
    path: join(output, "browser-recovered-existing.png"),
    fullPage: true,
  })
  cases.push(
    "Existing quiz hard reload: explicit recovery restores composite text, scenes, audio and stable IDs without a server write",
  )
  await page.getByTestId("editor-save-btn").click()
  await page.getByTestId("manager-config").waitFor()
  assert.equal(await recordCount(page), 0)
  assert.equal(saves.at(-1).expectedRevision, 1)
  await open(page)
  assert.deepEqual(
    (await inspect(page)).snapshot.questionIds,
    recovery.questionIds,
  )
  assert.equal((await inspect(page)).canUndo, false)
  assert.equal((await inspect(page)).dirty, false)
  cases.push(
    "Actual composite save/reopen: revision advances, submitted backup clears, IDs persist and Undo starts empty",
  )

  await page.getByTestId("question-text").fill("Retain through failed save")
  await page.waitForTimeout(450)
  failNextSave = true
  await page.getByTestId("editor-save-btn").click()
  await page.waitForTimeout(250)
  assert.match(page.url(), /manager\/quizz\/quiz-one/)
  assert.equal(await recordCount(page), 1)
  await page.reload()
  await page.getByTestId("studio-draft-restore").click()
  await check(
    page,
    (state) =>
      state.snapshot.values.questions[0].question ===
      "Retain through failed save",
    "Failed save recovery",
  )
  const serverVersion = database.get("quiz-one")
  serverVersion.base.subject = "New server title"
  serverVersion.extras.revision += 1
  serverVersion.extras.baseDigest = computeCanonicalBaseDigest(
    serverVersion.base,
  )
  await page.waitForTimeout(450)
  await page.reload()
  await page.getByTestId("studio-draft-stale").waitFor()
  await page.getByTestId("studio-draft-restore").click()
  const attempts = saves.length
  await page.getByTestId("editor-save-btn").click()
  await page.getByTestId("conflict-modal").waitFor()
  assert.equal(saves.length, attempts)
  await page.getByTestId("conflict-cancel-button").click()
  await page.getByTestId("editor-save-btn").click()
  await page.getByTestId("conflict-modal").waitFor()
  assert.equal(saves.length, attempts)
  await page.getByTestId("conflict-reload-button").click()
  await check(
    page,
    (state) =>
      state.snapshot.values.subject === "New server title" &&
      !state.draftConflict,
    "Conflict server reload",
  )
  await page.waitForTimeout(450)
  assert.equal(await recordCount(page), 0)
  assert.equal((await inspect(page)).canUndo, false)
  cases.push(
    "Failed save retained; stale recovery keeps original revision; Save/cancel/Save cannot bypass conflict; explicit server reload clears only its draft/history",
  )

  await open(page, "new")
  await page.locator('input[name="subject"]').fill("Incomplete new show")
  await page.getByTestId("add-scene").click()
  await page.getByTestId("scene-title").fill("New draft scene")
  const newIds = (await inspect(page)).snapshot.questionIds
  await page.waitForTimeout(450)
  await page.reload()
  await page.getByTestId("studio-draft-restore").click()
  await check(
    page,
    (state) => state.snapshot.values.subject === "Incomplete new show",
    "New draft restore",
  )
  assert.deepEqual((await inspect(page)).snapshot.questionIds, newIds)
  const priorPosts = created
  await page.getByTestId("editor-save-btn").click()
  assert.equal(created, priorPosts)
  assert.equal(await recordCount(page, "owner-one", null), 1)
  await page.getByTestId("question-text").fill("Valid new question")
  await page.getByTestId("answer-a").fill("Answer one")
  await page.getByTestId("answer-b").fill("Answer two")
  await page.getByTestId("editor-save-btn").click()
  await page.getByTestId("manager-config").waitFor()
  assert.equal(created, priorPosts + 1)
  assert.equal(await recordCount(page, "owner-one", null), 0)
  cases.push(
    "New quiz hard reload retains incomplete form and scene; invalid Save preserves backup; valid composite create clears its own new-draft record",
  )

  await open(page, "new")
  await page.locator('input[name="subject"]').fill("Create response race")
  await page.getByTestId("question-text").fill("Valid race question")
  await page.getByTestId("answer-a").fill("One")
  await page.getByTestId("answer-b").fill("Two")
  deferCreate = true
  await page.getByTestId("editor-save-btn").click()

  await waitForCreate()
  await page.evaluate(() => window.fixtureLateEdit())
  await check(
    page,
    (state) => state.snapshot.values.subject === "Newer edit during create",
    "Late create edit",
  )
  const beforeCreateReceiptWrites = await page.evaluate(
    () => window.fixtureDraftWrites.length,
  )
  releaseCreate()
  releaseCreate = null
  await check(
    page,
    (state) =>
      state.snapshot.extras.quizId.startsWith("created-") && state.dirty,
    "Created identity with newer local edits",
  )
  const savedNewId = (await inspect(page)).snapshot.extras.quizId
  const firstStoredAfterCreate = await page.evaluate(
    (index) => window.fixtureDraftWrites[index],
    beforeCreateReceiptWrites,
  )
  assert.equal(firstStoredAfterCreate.snapshot.extras.quizId, savedNewId)
  assert.equal(
    firstStoredAfterCreate.snapshot.extras.revision,
    database.get(savedNewId).extras.revision,
  )
  assert.equal(
    firstStoredAfterCreate.snapshot.extras.baseDigest,
    database.get(savedNewId).extras.baseDigest,
  )
  assert.equal(
    firstStoredAfterCreate.snapshot.values.subject,
    "Newer edit during create",
  )

  const savedNew = database.get(savedNewId)
  savedNew.base.subject = "Server changed newly created quiz"
  savedNew.extras.revision += 1
  savedNew.extras.baseDigest = computeCanonicalBaseDigest(savedNew.base)
  await page.getByTestId("editor-save-btn").click()
  await page.getByTestId("conflict-modal").waitFor()
  await page.getByTestId("conflict-reload-button").click()
  await check(
    page,
    (state) =>
      state.snapshot.values.subject === "Server changed newly created quiz" &&
      !state.draftConflict,
    "Reload saved new identity",
  )
  assert.equal((await inspect(page)).canUndo, false)
  await page
    .getByTestId("question-text")
    .fill("Explicit new-identity overwrite")
  savedNew.extras.revision += 1
  await page.getByTestId("editor-save-btn").click()
  await page.getByTestId("conflict-modal").waitFor()
  await page.getByTestId("conflict-overwrite-button").click()
  await page.getByTestId("conflict-confirm-overwrite-button").click()
  await page.getByTestId("manager-config").waitFor()
  assert.equal(saves.at(-1).id, savedNewId)
  assert.equal(saves.at(-1).expectedRevision, null)
  assert.equal(
    database.get(savedNewId).base.questions[0].question,
    "Explicit new-identity overwrite",
  )
  assert.equal(created, priorPosts + 2)
  cases.push(
    "Late edit during create retains unsaved draft; subsequent Save, conflict reload and explicitly confirmed overwrite all use the persisted quiz identity without duplicate creation",
  )

  await open(page)
  await page.getByTestId("question-text").fill("Tab one pending old")
  await page.waitForTimeout(450)
  const second = await context.newPage()
  attach(second)
  await open(second)
  await second.getByTestId("studio-draft-recovery").waitFor()
  await page.getByTestId("question-text").fill("Tab one newer protected")
  await page.waitForTimeout(450)
  await second.getByTestId("studio-draft-restore").click()
  await check(
    second,
    (state) =>
      state.snapshot.values.questions[0].question === "Tab one pending old",
    "Second tab chosen draft",
  )
  assert.equal(await recordCount(second), 2)
  await second.getByTestId("editor-exit-btn").click()
  await second.getByTestId("editor-discard-exit").click()
  await second.getByTestId("manager-config").waitFor()
  assert.equal(await recordCount(second), 1)
  await page.reload()
  await page.getByTestId("studio-draft-restore").click()
  await check(
    page,
    (state) =>
      state.snapshot.values.questions[0].question === "Tab one newer protected",
    "Newer tab backup survived",
  )
  await second.close()
  cases.push(
    "Two tabs: compare-and-remove preserves newer first-tab backup; explicit discard in second tab removes only its own record",
  )

  await page.waitForTimeout(450)
  await open(page, "quiz-one", "?owner=owner-two&lng=he")
  assert.equal((await inspect(page)).pending, false)
  assert.notEqual(
    (await inspect(page)).snapshot.values.questions[0].question,
    "Tab one newer protected",
  )
  assert.equal(await recordCount(page, "owner-one"), 1)
  cases.push(
    "Different authenticated owner cannot see or overwrite the other owner's pending draft",
  )

  const deniedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  await deniedContext.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function setItem(key, value) {
      if (key.startsWith("tadazz:studio-draft:")) {
        throw new DOMException("Fixture quota", "QuotaExceededError")
      }

      return original.call(this, key, value)
    }
  })
  const denied = await deniedContext.newPage()
  attach(denied)
  await open(denied, "new", "?lng=he")
  await denied.getByTestId("question-text").fill("אפשר להמשיך לערוך")
  await denied.getByTestId("studio-draft-warning").waitFor()
  assert.equal(
    (await inspect(denied)).snapshot.values.questions[0].question,
    "אפשר להמשיך לערוך",
  )
  await denied.screenshot({
    path: join(output, "browser-storage-warning-he-mobile.png"),
    fullPage: true,
  })
  await deniedContext.close()
  cases.push(
    "Storage quota denial: Hebrew mobile warning appears; normal editing remains functional",
  )

  assert.deepEqual(errors, [])
  sourceReceipt.browserBundleSHA256 = createHash("sha256")
    .update(await readFile(join(output, "fixture.js")))
    .digest("hex")
  sourceReceipt.browserReceipt = "browser-result.json"
  await writeFile(
    join(output, "source-receipt.json"),
    `${JSON.stringify(sourceReceipt, null, 2)}\n`,
  )

  const report = {
    status: "PASS",
    passedCases: cases.length,
    cases,
    saves,
    browserErrors: errors,
    scope:
      "Isolated fixture server; real QuizzEditorProvider, StudioEditorProvider, native header/recovery/history controls and composite save hook. Not production or a full Studio visual qualification.",
  }
  await writeFile(
    join(output, "browser-result.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await page
    .screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {
      // Keep the original assertion failure when a closed page cannot be captured.
    })
  const report = {
    status: "FAIL",
    cases,
    error: String(error),
    browserErrors: errors,
    saves,
  }
  await writeFile(
    join(output, "browser-result.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.error(JSON.stringify(report, null, 2))
  process.exitCode = 1
} finally {
  await browser.close()
  await new Promise((done) => {
    server.close(done)
  })
}
