import { readFileSync } from "node:fs"

const runId = process.env.TDS_PACKAGE_QA_RUN ?? ""

if (!/^[a-zA-Z0-9-]{1,64}$/u.test(runId)) {
  throw new Error("Start the bounded operator broker with a fresh QA run ID")
}

const ready = JSON.parse(
  readFileSync(`/evidence/phase-12-broker-${runId}-ready.json`, "utf8"),
)
const now = Date.now() / 1000

if (
  ready.runId !== runId ||
  ready.image !==
    "sha256:aea88c60c29d5160dfe5ae822179da4233ed882c3979b4d592f6cd86902e05c5" ||
  ready.startedAt > now ||
  ready.expiresAt <= now ||
  now - ready.startedAt > 1800
) {
  throw new Error("Isolated package broker readiness expired or mismatched")
}

console.log("Bounded isolated package broker ready", runId)
