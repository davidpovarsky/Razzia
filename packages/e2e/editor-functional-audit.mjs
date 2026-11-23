import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const evidenceName = process.env.TADAZZ_EDITOR_AUDIT_EVIDENCE ?? "functional"

if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(evidenceName)) {
  throw new Error("Invalid editor audit evidence basename")
}

const root = path.resolve("../.."),
  out = path.join(
    root,
    "docs/extensions/plans/editor-hebrew-20261118",
    evidenceName,
  )
fs.mkdirSync(out, { recursive: true })
const dictionaries = Object.fromEntries(
  ["common", "quizz", "manager"].map((ns) => [
    ns,
    JSON.parse(
      fs.readFileSync(
        path.join(root, "packages/web/src/locales/en", `${ns}.json`),
        "utf8",
      ),
    ),
  ]),
)
const resolve = (v, parts) =>
  v?.[parts.join(".")] ??
  (parts.length > 1 ? resolve(v?.[parts[0]], parts.slice(1)) : undefined)
const t = (key) => {
  const [ns, k] = key.split(":")
  const value = resolve(dictionaries[ns], k.split("."))

  if (typeof value !== "string") {
    throw Error(`Missing fixture translation ${key}`)
  }

  return value
}
const subject = `Editor end-to-end ${Date.now()}`,
  legacyId = `editor-legacy-${Date.now()}`

fs.writeFileSync(
  path.resolve(".config/quizz", `${legacyId}.json`),
  JSON.stringify({
    id: legacyId,
    subject: legacyId,
    gameMode: "quiz",
    questions: [
      {
        type: "single",
        question: "Legacy source question",
        answers: ["Yes", "No"],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
    ],
  }),
)
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
})
const checks = [],
  errors = [],
  httpErrors = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("response", (r) => {
  if (r.status() >= 400) {
    httpErrors.push({ status: r.status(), path: new URL(r.url()).pathname })
  }
})
await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
const check = async (name, fn) => {
  await fn()
  checks.push(name)
  console.log(`PASS ${name}`)
}
const title = () => page.locator('input[name$=".question"]')
const fillQuestion = async (label, answers) => {
  await title().fill(label)
  for (let i = 0; i < answers.length; i += 1) {
    await page.getByTestId(`answer-text-${i}`).fill(answers[i])
  }
}
const save = async () => {
  await page.getByTestId("editor-save-btn").click()
  await page.waitForURL("**/manager/config", { timeout: 25000 })
}
const reopen = async (name) => {
  await page
    .getByRole("button", { name: t("manager:tabs.quizz"), exact: true })
    .click()
  const row = page.getByText(name, { exact: true }).locator("..")
  await row
    .getByRole("button", { name: t("manager:quizz.edit"), exact: true })
    .click()
  await page.getByTestId("editor-save-btn").waitFor()
}
const readSaved = () =>
  fs
    .readdirSync(path.resolve(".config/quizz"))
    .map((n) =>
      JSON.parse(fs.readFileSync(path.resolve(".config/quizz", n), "utf8")),
    )
    .find((q) => q.subject === subject)
let saved = undefined,
  mediaUrl = undefined,
  originalLegacyQuestionId = undefined

try {
  await check(
    "Unauthenticated editor navigation and composite API require manager access",
    async () => {
      await page.goto("http://127.0.0.1:3180/manager/quizz?lng=en")
      await expect(page.locator('input[type="password"]')).toBeVisible()
      expect(new URL(page.url()).pathname.replace(/\/$/, "")).toBe("/manager")
      expect(
        (
          await page.request.get(
            "http://127.0.0.1:3180/api/extensions/quizzes/protected-proof",
          )
        ).status(),
      ).toBe(401)
      expect(
        (
          await page.request.put(
            "http://127.0.0.1:3180/api/extensions/quizzes/protected-proof",
            { data: {} },
          )
        ).status(),
      ).toBe(401)
    },
  )
  await page.locator('input[type="password"]').fill("e2e-password")
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await page.waitForURL("**/manager/config")
  await page.goto("http://127.0.0.1:3180/manager/quizz?lng=en")
  await page.locator('input[name="subject"]').fill(subject)
  await check(
    "Complete unsaved question remains editable with live preview",
    async () => {
      await fillQuestion("Which colour is the sky?", ["Blue", "Green"])
      await expect(page.getByTestId("question-live-preview")).toBeVisible()
      await expect(title()).toHaveValue("Which colour is the sky?")
      await expect(page.locator("body")).not.toContainText(
        "show-library:non-json-value",
      )
    },
  )
  await check("Text-only mode hides all image controls", async () => {
    await expect(page.getByTestId("answer-pick-image-0")).toHaveCount(0)
    await expect(page.getByTestId("answer-alt-input-0")).toHaveCount(0)
  })
  await check(
    "Image mode uploads and decodes real media; text toggle retains it",
    async () => {
      await page.getByTestId("answer-mode-0-image").click()
      await page.getByTestId("answer-pick-image-0").click()
      const dialog = page.getByRole("dialog")
      await dialog.locator('input[type="file"]').setInputFiles({
        name: "editor-proof.png",
        mimeType: "image/png",
        buffer: png,
      })
      const item = dialog.getByTitle(/^editor-proof-.+\.png$/).last()
      await item.waitFor()
      await item.click()
      const img = page.getByTestId("answer-image-preview-0")
      await expect(img).toBeVisible()
      await expect
        .poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0))
        .toBeTruthy()
      mediaUrl = await img.getAttribute("src")
      await page.getByTestId("answer-alt-input-0").fill("A blue sky image")
      await page.getByTestId("answer-mode-0-text").click()
      await expect(page.getByTestId("answer-pick-image-0")).toHaveCount(0)
      await page.getByTestId("answer-mode-0-both").click()
      await expect(img).toHaveAttribute("src", mediaUrl)
      await expect(page.getByTestId("answer-alt-input-0")).toHaveValue(
        "A blue sky image",
      )
    },
  )
  await check("Answer count limits and five live answers work", async () => {
    for (let i = 2; i < 5; i += 1) {
      await page
        .getByRole("button", { name: t("quizz:addAnswer"), exact: true })
        .click()
      await page
        .getByTestId(`answer-text-${i}`)
        .fill(["Red", "Yellow", "Purple"][i - 2])
    }
    await expect(
      page.getByRole("button", { name: t("quizz:addAnswer"), exact: true }),
    ).toBeDisabled()
    await expect(page.getByTestId("answer-text-4")).toHaveValue("Purple")
    await page
      .getByTestId("question-live-preview")
      .screenshot({ path: path.join(out, "question-five-answers.png") })
  })
  await check(
    "Authored answer-type conversion requires confirmation; cancel preserves answers",
    async () => {
      await page.getByTestId("answer-type-estimation").click()
      const dialog = page.getByRole("alertdialog")
      await expect(dialog).toBeVisible()
      await dialog
        .getByRole("button", { name: t("common:cancel"), exact: true })
        .click()
      await expect(page.getByTestId("answer-text-0")).toHaveValue("Blue")
      await expect(page.getByTestId("answer-text-4")).toHaveValue("Purple")
    },
  )
  await check(
    "Multiple-choice controls appear only in their mode",
    async () => {
      await page.getByTestId("studio-add-card-btn").click()
      await page.getByTestId("answer-type-multi").click()
      await fillQuestion("Choose the primary colours", ["Red", "Blue"])
      await page
        .getByRole("radio", {
          name: t("quizz:question.config.scoringMode.strict"),
          exact: true,
        })
        .click()
      await expect(
        page.getByRole("radio", {
          name: t("quizz:question.config.scoringMode.strict"),
          exact: true,
        }),
      ).toHaveAttribute("aria-checked", "true")
    },
  )
  await check(
    "Estimation quiz and survey use the selected card mode",
    async () => {
      await page.getByTestId("studio-add-card-btn").click()
      await page.getByTestId("answer-type-estimation").click()
      await expect(page.getByRole("alertdialog")).toHaveCount(0)
      await title().fill("Estimate the number")
      await page
        .getByRole("spinbutton", {
          name: t("quizz:question.config.estimation.max"),
          exact: true,
        })
        .fill("200")
      await page
        .getByRole("spinbutton", {
          name: t("quizz:question.estimation.correctAnswer"),
          exact: true,
        })
        .fill("120")
      await page
        .getByRole("radio", {
          name: t("quizz:question.config.estimation.inputModes.input"),
          exact: true,
        })
        .click()
      await page
        .getByRole("spinbutton", {
          name: t("quizz:question.config.estimation.step"),
          exact: true,
        })
        .fill("5")
      await page.getByTestId("toggle-kind-survey").click()
      await expect(
        page.getByRole("spinbutton", {
          name: t("quizz:question.estimation.correctAnswer"),
          exact: true,
        }),
      ).toHaveCount(0)
      await expect(
        page.getByRole("spinbutton", {
          name: t("quizz:question.config.estimation.margin"),
          exact: true,
        }),
      ).toHaveCount(0)
      await expect(
        page.getByRole("heading", {
          name: t("quizz:question.config.scoring"),
          exact: true,
        }),
      ).toHaveCount(0)
      await page.getByTestId("toggle-kind-quiz").click()
      await expect(
        page.getByRole("spinbutton", {
          name: t("quizz:question.estimation.correctAnswer"),
          exact: true,
        }),
      ).toHaveValue("120")
    },
  )
  await check(
    "Blank question converts to scene immediately with no fake media URL",
    async () => {
      await page.getByTestId("studio-add-card-btn").click()
      await page.getByTestId("toggle-kind-media").click()
      await expect(page.getByRole("alertdialog")).toHaveCount(0)
      await expect(page.getByTestId("scene-media-url-input")).toHaveValue("")
      await expect(page.getByTestId("editor-question-card-2")).toBeVisible()
      await expect(page.getByTestId("editor-question-card-3")).toHaveCount(0)
    },
  )
  await check(
    "Save validates and roundtrips mixed question types with empty media draft",
    async () => {
      await save()
      saved = readSaved()
      expect(saved.questions.map((q) => q.type)).toEqual([
        "single",
        "multi",
        "estimation",
      ])
      expect(saved.questions[0].answers).toHaveLength(5)
      expect(saved.questions[1].options.scoringMode).toBe("strict")
      expect(saved.questions[2].solutions).toEqual([120])
      await reopen(subject)
      await expect(page.getByTestId("answer-mode-0-both")).toHaveAttribute(
        "aria-checked",
        "true",
      )
      await expect(page.getByTestId("answer-alt-input-0")).toHaveValue(
        "A blue sky image",
      )
      await page.getByTestId("studio-tab-launch").click()
      await expect(page.getByTestId("studio-launch-btn")).toBeDisabled()
      await expect(
        page.getByText("Some media cards have empty URLs", { exact: true }),
      ).toBeVisible()
    },
  )
  await check("Filling scene media then saving enables launch", async () => {
    await page.getByTestId("studio-tab-questions").click()
    const scene = page
      .getByTestId("editor-timeline")
      .locator('[data-scene-kind="media"]')
      .getByTestId("editor-scene-select")
    await scene.click()
    await page.getByTestId("scene-media-url-input").fill(mediaUrl)
    await save()
    await reopen(subject)
    await page.getByTestId("studio-tab-launch").click()
    await expect(page.getByTestId("studio-launch-btn")).toBeEnabled()
  })
  await check("Sidecar-only edits block launching until saved", async () => {
    await page.getByTestId("studio-tab-questions").click()
    await page.getByTestId("editor-question-card-0").click()
    await page.getByTestId("answer-mode-0-text").click()
    await page.getByTestId("studio-tab-launch").click()
    await expect(page.getByTestId("studio-launch-btn")).toBeDisabled()
    await expect(
      page.getByText(
        "Unsaved changes detected. Please save the quiz before launching.",
        { exact: true },
      ),
    ).toBeVisible()
    await save()
    await reopen(subject)
    await page.getByTestId("studio-tab-launch").click()
    await expect(page.getByTestId("studio-launch-btn")).toBeEnabled()
  })
  await check(
    "Legacy quiz without sidecar initializes editable image controls and persists safely",
    async () => {
      await page.getByTestId("editor-exit-btn").click()
      await reopen(legacyId)
      await expect(title()).toHaveValue("Legacy source question")
      await page.getByTestId("answer-mode-0-image").click()
      await expect(page.getByTestId("answer-pick-image-0")).toBeVisible()
      await page.getByTestId("answer-mode-0-text").click()
      await save()
      const legacy = JSON.parse(
        fs.readFileSync(
          path.resolve(".config/quizz", `${legacyId}.json`),
          "utf8",
        ),
      )
      expect(legacy.questions[0].answers).toEqual(["Yes", "No"])
      await reopen(legacyId)
      await page.getByTestId("studio-tab-launch").click()
      await expect(page.getByTestId("studio-launch-btn")).toBeEnabled()
    },
  )

  await check(
    "Failed metadata disables editing and saving; explicit retry recovers",
    async () => {
      await page.getByTestId("editor-exit-btn").click()
      const routePattern = `**/api/extensions/quizzes/${legacyId}`

      await page.route(routePattern, (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"error":"synthetic metadata failure"}',
        }),
      )
      await reopen(legacyId)
      await expect(page.getByTestId("studio-load-state")).toContainText(
        "Failed to reload quiz",
      )
      await expect(page.getByTestId("editor-save-btn")).toBeDisabled()
      await expect(page.getByTestId("studio-card-type-bar")).toHaveCount(0)
      await page.unroute(routePattern)
      await page
        .getByRole("button", { name: "Reload Server Version", exact: true })
        .click()
      await expect(page.getByTestId("studio-load-state")).toHaveCount(0)
      await expect(title()).toHaveValue("Legacy source question")
      await expect(page.getByTestId("editor-save-btn")).toBeEnabled()
    },
  )
  await check(
    "Exit and browser Back preserve unsaved edits until confirmed",
    async () => {
      await title().fill("Unsaved navigation proof")
      await page.getByTestId("editor-exit-btn").click()
      await expect(page.getByRole("alertdialog")).toBeVisible()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: t("common:cancel"), exact: true })
        .click()
      await expect(title()).toHaveValue("Unsaved navigation proof")
      const back = page.goBack({ timeout: 1500 }).catch(() => null)
      await expect(page.getByRole("alertdialog")).toBeVisible()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: t("common:cancel"), exact: true })
        .click()
      await back
      await expect(title()).toHaveValue("Unsaved navigation proof")
      await page.getByTestId("editor-exit-btn").click()
      await page.getByTestId("editor-discard-exit").click()
      await page.waitForURL("**/manager/config")
      await reopen(legacyId)
      await expect(title()).toHaveValue("Legacy source question")
    },
  )
  await check(
    "Authored question-to-scene conversion cancels safely and replaces only the selected duplicate",
    async () => {
      originalLegacyQuestionId = await page.evaluate(async (id) => {
        const r = await fetch("/api/extensions/quizzes/" + id, {
          headers: { Authorization: "Bearer " + localStorage.getItem("token") },
        })

        return (await r.json()).extras.questionIds[0]
      }, legacyId)
      await page
        .getByTestId("editor-question-card-0")
        .getByRole("button", {
          name: t("quizz:question.duplicateQuestion"),
          exact: true,
        })
        .click()
      await title().fill("Disposable authored question")
      await page.getByTestId("toggle-kind-transition").click()
      await expect(page.getByRole("alertdialog")).toBeVisible()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: t("common:cancel"), exact: true })
        .click()
      await expect(title()).toHaveValue("Disposable authored question")
      await page.getByTestId("toggle-kind-transition").click()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Convert to Scene", exact: true })
        .click()
      await expect(page.getByTestId("editor-question-card-1")).toHaveCount(0)
      await expect(page.getByTestId("editor-question-card-0")).toContainText(
        "Legacy source question",
      )
      await expect(page.locator('[data-scene-kind="transition"]')).toHaveCount(
        1,
      )
    },
  )
  await check(
    "Timeline keyboard reorder supports Space, arrows and Enter",
    async () => {
      const scene = page.locator('[data-scene-kind="transition"]')
      const wrapper = scene.locator("..")
      await wrapper.focus()
      await wrapper.press("Space")
      await expect(wrapper).toHaveAttribute("aria-pressed", "true")
      await page.evaluate(
        () =>
          new Promise((resolveObservation) => {
            requestAnimationFrame(() =>
              requestAnimationFrame(resolveObservation),
            )
          }),
      )
      await wrapper.press("ArrowUp")
      await expect(
        page.getByText("Card moved to position 1.", { exact: true }),
      ).toBeAttached()
      await wrapper.press("Enter")
      await expect
        .poll(() =>
          page
            .getByTestId("editor-timeline")
            .locator(
              '[data-testid^="editor-question-card-"], [data-testid="editor-scene-card"]',
            )
            .first()
            .getAttribute("data-scene-kind"),
        )
        .toBe("transition")
    },
  )
  await check(
    "Media library confirms associated-image deletion and remains usable",
    async () => {
      await page.getByTestId("editor-question-card-0").click()
      await page
        .getByRole("button", { name: t("quizz:media.library"), exact: true })
        .click()
      const dialog = page.getByRole("dialog"),
        name = `discard-proof-${Date.now()}`

      await dialog.locator('input[type="file"]').setInputFiles({
        name: `${name}.png`,
        mimeType: "image/png",
        buffer: png,
      })
      const item = dialog.getByTitle(new RegExp(`^${name}-.+\\.png$`))
      await item.waitFor()
      await item
        .locator("..")
        .getByRole("button", { name: t("quizz:media.delete"), exact: true })
        .click()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: t("common:delete"), exact: true })
        .click()
      await expect(page.getByTestId("media-delete-in-use-banner")).toBeVisible()
      await page.getByTestId("media-confirm-force-delete").click()
      await expect(item).toHaveCount(0)
      await expect(dialog).toBeVisible()
      await dialog
        .getByRole("button", { name: t("common:close"), exact: true })
        .click()
      await expect(title()).toHaveValue("Legacy source question")
    },
  )

  await check(
    "Converted and keyboard-reordered timeline persists with the original question identity",
    async () => {
      await save()
      await reopen(legacyId)
      const snapshot = await page.evaluate(async (id) => {
        const r = await fetch("/api/extensions/quizzes/" + id, {
          headers: { Authorization: "Bearer " + localStorage.getItem("token") },
        })

        return r.json()
      }, legacyId)
      expect(snapshot.extras.timeline.map((i) => i.kind)).toEqual([
        "transition",
        "question",
      ])
      expect(snapshot.extras.questionIds).toEqual([originalLegacyQuestionId])
      expect(snapshot.extras.timeline[1].questionId).toBe(
        originalLegacyQuestionId,
      )
      await page.getByTestId("editor-question-card-0").click()
      await expect(title()).toHaveValue("Legacy source question")
    },
  )

  expect(errors).toEqual([])
  fs.writeFileSync(
    path.join(out, "result.json"),
    JSON.stringify(
      { ok: true, subject, legacyId, checks, errors, httpErrors },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ ok: true, checks, errors, httpErrors }))
} catch (error) {
  await page
    .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
    .catch(() => {
      /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
    })
  fs.writeFileSync(
    path.join(out, "result.json"),
    JSON.stringify(
      {
        ok: false,
        subject,
        legacyId,
        checks,
        errors,
        httpErrors,
        error: String(error),
        url: page.url(),
        body: (await page.locator("body").innerText()).slice(-5000),
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      ok: false,
      checks,
      errors,
      httpErrors,
      error: String(error),
    }),
  )
  process.exitCode = 1
} finally {
  await browser.close()
}
