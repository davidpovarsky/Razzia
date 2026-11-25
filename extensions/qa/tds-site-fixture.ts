import { expect, type Page, type Locator } from "@playwright/test"
import { readFileSync } from "node:fs"
import {
  createDefaultQuizExtrasV2,
  computeCanonicalBaseDigest,
  type QuizExtrasV2,
} from "../src/core"

export async function registerSynthetic(page: Page) {
  const address = `tds-site-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.invalid`
  const password = "Synthetic-site-2026-passphrase"
  await page.goto("/signup")
  await page.getByLabel("Email address", { exact: true }).fill(address)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click()
  await expect(page.getByLabel("Six-digit code")).toBeVisible()
  const mail = JSON.parse(
    readFileSync(
      new URL("../.site-test-config/test-mail.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, { code: string }>
  await page.getByLabel("Six-digit code").fill(mail[address].code)
  await page.getByRole("button", { name: "Verify email", exact: true }).click()
  await expect(
    page.getByText("Email verified. You can now log in.", { exact: true }),
  ).toBeVisible()
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Your shows." })).toBeVisible()

  return {
    Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("token"))}`,
  }
}

export async function seedSynthetic(
  page: Page,
  headers: Record<string, string>,
  options:
    | string
    | {
        subject: string
        configure: (extras: QuizExtrasV2) => void
      } = "Studio UI example",
) {
  const subject = typeof options === "string" ? options : options.subject
  const quizz = {
    subject,
    gameMode: "quiz",
    questions: ["First fixture?", "Second fixture?"].map((question) => ({
      type: "single",
      question,
      answers: ["Yes", "No"],
      solutions: [0],
      cooldown: 3,
      time: 120,
    })),
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    quizz.questions.map(() => crypto.randomUUID()),
    computeCanonicalBaseDigest(quizz),
  )
  extras.roster.participants = [
    {
      rosterPlayerId: crypto.randomUUID(),
      displayName: "Synthetic private example",
      phoneE164: null,
    },
  ]

  if (typeof options !== "string") {
    options.configure(extras)
  }

  expect(
    (
      await page.request.post("/api/extensions/quizzes", {
        headers,
        data: { quizz, extras },
      })
    ).ok(),
  ).toBe(true)
  const list = (await (
    await page.request.get("/api/quizz", { headers })
  ).json()) as { quizz: Array<{ id: string; subject: string }> }
  const game = list.quizz.find((candidate) => candidate.subject === subject)
  expect(game).toBeTruthy()

  if (!game) {
    throw new Error("Missing saved synthetic game")
  }

  return game
}

export async function openGameActions(card: Locator) {
  await card.getByRole("button", { name: /^More actions for /u }).click()
}
