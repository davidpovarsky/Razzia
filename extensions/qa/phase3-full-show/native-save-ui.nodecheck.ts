import assert from "node:assert/strict"
import { test } from "node:test"
import {
  firstPartyOriginFromBase,
  parseFullShowSaveOutcome,
  type FullShowSaveInput,
} from "../../src/mcp-app/client/full-show-save.ts"
import { resources, locales } from "../../src/mcp-app/widget/i18n.ts"

const origin = "https://tadazz.com"
const request: FullShowSaveInput = {
  contractVersion: "0.1.0",
  draftId: "draft_A_12345678901234567890",
  expectedRevision: 7,
  idempotencyKey: "save_A_12345678901234567890",
  intent: "createNew",
}
const result = (data: unknown) => ({
  structuredContent: {
    contractVersion: "0.1.0",
    ok: true,
    correlationId: "result_A_12345678901234567890",
    data,
  },
})
const consentId = "a".repeat(54)
const consent = (
  url = `${origin}/studio/native-save-consent/${consentId}`,
) => ({
  isError: true,
  structuredContent: {
    contractVersion: "0.1.0",
    ok: false,
    correlationId: "result_A_12345678901234567890",
    error: {
      code: "CONSENT_REQUIRED",
      messageKey: "consent",
      retryable: false,
      consentRequestId: consentId,
      consentUrl: url,
    },
  },
})
const saved = {
  draftId: request.draftId,
  revision: 7,
  quizId: "q".repeat(21),
  savedRevision: 1,
  studioUrl: `${origin}/manager/quizz/${"q".repeat(21)}`,
}

test("native save accepts only bound consent and exact draft success; native library revision is independent", () => {
  assert.deepEqual(parseFullShowSaveOutcome(request, consent(), `${origin}/`), {
    kind: "consent",
    url: `${origin}/studio/native-save-consent/${consentId}`,
  })
  assert.deepEqual(
    parseFullShowSaveOutcome(request, result(saved), `${origin}/`),
    {
      kind: "saved",
      url: saved.studioUrl,
      quizId: saved.quizId,
      savedRevision: 1,
    },
  )
})

test("native save refuses attacker origins, alternate routes, query capabilities and mismatched ids", () => {
  for (const url of [
    `https://evil.test/studio/native-save-consent/${consentId}`,
    `${origin}/studio/native-save-consent/${"b".repeat(54)}`,
    `${origin}/studio/native-save-consent/${consentId}?continue=https://evil.test`,
    `https://user@tadazz.com/studio/native-save-consent/${consentId}`,
    `${origin}/oauth/authorize`,
  ]) {
    assert.throws(() =>
      parseFullShowSaveOutcome(request, consent(url), `${origin}/`),
    )
  }
  for (const data of [
    { ...saved, draftId: "foreign_12345678901234567890" },
    { ...saved, revision: 8 },
    { ...saved, studioUrl: `${origin}/manager/quizz/foreign` },
    { ...saved, quizId: "../not-a-native-id" },
  ]) {
    assert.throws(() =>
      parseFullShowSaveOutcome(request, result(data), `${origin}/`),
    )
  }
  assert.throws(() =>
    parseFullShowSaveOutcome(
      request,
      { ...result(saved), isError: true },
      `${origin}/`,
    ),
  )
})

test("native save keeps denial separate and never promotes its link to approval", () => {
  const raw = consent()
  raw.structuredContent.error.code = "CONSENT_DECLINED"
  assert.deepEqual(parseFullShowSaveOutcome(request, raw, `${origin}/`), {
    kind: "denied",
    code: "CONSENT_DECLINED",
    retryable: false,
  })
})

test("native save origin is the exact compiled HTTPS base", () => {
  assert.equal(firstPartyOriginFromBase(`${origin}/`), origin)
  for (const base of [
    "http://tadazz.com/",
    "https://user@tadazz.com/",
    "https://tadazz.com/path",
    "https://tadazz.com/?redirect=evil",
    "https://tadazz.com/#hash",
  ]) {
    assert.throws(() => firstPartyOriginFromBase(base))
  }
})

test("native action translations preserve real Unicode in all eight languages", () => {
  assert.equal(resources.fr.widget.reviewSave, "V\u00e9rifier dans Tadazz")
  assert.equal(resources.ja.widget.saveAction, "Tadazz\u306b\u4fdd\u5b58")
  assert.equal(resources.vi.widget.finishSave, "Ho\u00e0n t\u1ea5t l\u01b0u")
  for (const locale of locales) {
    for (const key of [
      "saveAction",
      "reviewSave",
      "finishSave",
      "openSavedGame",
      "demoChoose",
      "demoSelected",
      "demoCorrect",
      "demoIncorrect",
      "demoSurvey",
    ]) {
      assert(resources[locale].widget[key].length > 2)
      assert(!resources[locale].widget[key].includes("?"))
    }
  }
})
