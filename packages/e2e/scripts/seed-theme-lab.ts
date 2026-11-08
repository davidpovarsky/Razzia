/** Explicit remote-only seeding into a new isolated staging config. Never production. */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { randomUUID } from "node:crypto"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
} from "../../../extensions/src/core"
if (process.env.TADAZZ_REMOTE_QA !== "1") throw new Error("Remote staging only")
const origin = process.env.TADAZZ_LAB_URL
const password = process.env.MANAGER_PASSWORD
const receipt = process.env.TADAZZ_LAB_SEED_RECEIPT
if (
  !origin ||
  !password ||
  !receipt ||
  !/^http:\/\/127\.0\.0\.1:3288$/u.test(origin)
)
  throw new Error("Explicit isolated loopback lab required")
if (existsSync(receipt))
  throw new Error(
    "Seed receipt already exists; refusing to duplicate or overwrite games",
  )
const response = await fetch(`${origin}/api/auth/manager`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password }),
})
if (!response.ok) throw new Error(`Login failed ${response.status}`)
const { token } = (await response.json()) as { token: string }
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
}
const samples = []
for (const [id, name] of [
  ["tadazz-classic", "Classic"],
  ["tadazz-demo-cosmic", "Cosmic Night"],
  ["tadazz-demo-jade", "Jade Studio"],
]) {
  for (const mode of ["quiz", "survey"]) {
    const questions =
      mode === "quiz"
        ? [
            {
              type: "single",
              question: "Which planet is known as the Red Planet?",
              answers: ["Mars", "Venus", "Jupiter"],
              solutions: [0],
              time: 30,
              cooldown: 4,
            },
            {
              type: "single",
              question: "How many sides does a triangle have?",
              answers: ["Three", "Four", "Five", "Six"],
              solutions: [0],
              time: 30,
              cooldown: 4,
            },
            {
              type: "multi",
              question: "Which numbers are even?",
              answers: ["Two", "Three", "Four", "Five"],
              solutions: [0, 2],
              time: 30,
              cooldown: 4,
            },
          ]
        : [
            {
              type: "single",
              question: "Where would you take your next adventure?",
              answers: ["Mountains", "Ocean", "City"],
              solutions: [],
              time: 30,
              cooldown: 4,
            },
            {
              type: "single",
              question: "Which team activity would you choose?",
              answers: ["Music", "Sport", "Puzzles", "Cooking"],
              solutions: [],
              time: 30,
              cooldown: 4,
            },
            {
              type: "single",
              question: "How would you like to finish the show?",
              answers: ["Celebration", "Encore"],
              solutions: [],
              time: 30,
              cooldown: 4,
            },
          ]
    const quizz = {
      subject: `${name} — ${mode === "quiz" ? "Quick Quiz" : "Audience Picks"}`,
      gameMode: mode,
      questions,
    }
    const questionIds = questions.map(() => randomUUID())
    const extras = createDefaultQuizExtrasV2(
      "draft",
      questionIds,
      computeCanonicalBaseDigest(quizz),
    )
    extras.defaults.showTheme = { id, version: "1.0.0", overrides: {} }
    extras.scenes = {}
    extras.timeline = questionIds.map((questionId) => ({
      id: randomUUID(),
      kind: "question",
      questionId,
    }))
    const saved = await fetch(`${origin}/api/extensions/quizzes`, {
      method: "POST",
      headers,
      body: JSON.stringify({ quizz, extras }),
    })
    if (!saved.ok)
      throw new Error(`Seed failed ${saved.status}: ${await saved.text()}`)
    const { quizId } = (await saved.json()) as { quizId: string }
    samples.push({
      quizId,
      themeId: id,
      name: quizz.subject,
      mode,
      questions: questions.length,
    })
  }
}
writeFileSync(
  receipt,
  JSON.stringify({ createdAt: new Date().toISOString(), samples }, null, 2) +
    "\n",
  { mode: 0o600 },
)
console.log(`Saved ${samples.length} example games, each with three questions`)
