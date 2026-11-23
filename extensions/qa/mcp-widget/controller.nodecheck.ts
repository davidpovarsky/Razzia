import { test } from "node:test"
import assert from "node:assert/strict"
import {
  draftTitle,
  withDraftTitle,
} from "../../src/mcp-app/widget/draft-fields.ts"
import {
  WidgetController,
  parseResult,
} from "../../src/mcp-app/widget/controller.ts"
import { dataSchemas } from "../../src/mcp-app/contracts/tools.ts"
import {
  resources,
  locales,
  createWidgetI18n,
} from "../../src/mcp-app/widget/i18n.ts"
const id = "widget_draft_A_123456789012"
const other = "widget_draft_B_123456789012"
const summary = {
  title: "Private example",
  cardCount: 1,
  questionCount: 1,
  themeId: "tadazz-classic",
  themeVersion: "1.0.0",
  diagnostics: [],
}
const result = (data: unknown) => ({
  structuredContent: {
    contractVersion: "0.1.0",
    ok: true,
    correlationId: "widget_result_123456789012",
    data,
  },
})
const draft = (revision = 1, draftId = id) =>
  result({
    draftId,
    revision,
    summary,
    authoredShowJson: '{"title":"Original"}',
    questionRefs: [
      {
        questionNumber: 1,
        publicQuestionId: `preview-question-${"a".repeat(64)}`,
      },
    ],
  })
const ack = (revision = 2, draftId = id) =>
  result({ draftId, revision, summary })
const preview = (revision = 1, draftId = id) =>
  result({
    draftId,
    revision,
    summary,
    previewVersion: 1,
    rendererStatus: "unavailable",
    projectionDigest: "a".repeat(64),
    sbRegistryVersion: null,
  })
function deferred() {
  let resolve: (value: unknown) => void = () => {
    throw new Error("qa:uninitialized-resolver")
  }
  const promise = new Promise<unknown>((r) => {
    resolve = r
  })

  return { resolve, promise }
}
test("parses strict structured result; rejects text, unknown fields and contradictory error", () => {
  assert.throws(() =>
    parseResult(dataSchemas.get_game_draft, {
      content: [{ type: "text", text: JSON.stringify(draft()) }],
    }),
  )
  assert.throws(() =>
    parseResult(dataSchemas.get_game_draft, { ...draft(), isError: true }),
  )
  const invalid = draft()
  Object.assign(invalid.structuredContent, { html: "<script>" })
  assert.throws(() => parseResult(dataSchemas.get_game_draft, invalid))
})
test("sends original tools with revision CAS; acknowledges only after server response", async () => {
  const pending = deferred()
  const calls: unknown[] = []
  const controller = new WidgetController(
    {
      async callServerTool(params) {
        await Promise.resolve()
        calls.push(params)

        return params.name === "get_game_draft" ? draft() : pending.promise
      },
    },
    () => "widget_intent_123456789012",
  )
  controller.select(id)
  await controller.refresh()
  const write = controller.update('{"title":"Edited"}')
  await Promise.resolve()
  assert.equal(controller.snapshot().status, "loading")
  assert.equal(controller.snapshot().draft?.revision, 1)
  assert.deepEqual(calls[1], {
    name: "update_game_draft",
    arguments: {
      contractVersion: "0.1.0",
      draftId: id,
      expectedRevision: 1,
      authoredShowJson: '{"title":"Edited"}',
      idempotencyKey: "widget_intent_123456789012",
    },
  })
  pending.resolve(ack())
  await write
  assert.equal(controller.snapshot().status, "acknowledged")
  assert.equal(controller.snapshot().draft?.revision, 2)
})
test("conflict retains prior content and exposes refresh requirement", async () => {
  const controller = new WidgetController({
    async callServerTool({ name }) {
      await Promise.resolve()

      return name === "get_game_draft"
        ? draft()
        : {
            structuredContent: {
              contractVersion: "0.1.0",
              ok: false,
              correlationId: "widget_result_123456789012",
              error: {
                code: "REVISION_CONFLICT",
                messageKey: "extensions:mcp.REVISION_CONFLICT",
                retryable: true,
                currentRevision: 3,
              },
            },
          }
    },
  })
  controller.select(id)
  await controller.refresh()
  await controller.update("edited")
  assert.equal(controller.snapshot().status, "conflict")
  assert.equal(controller.snapshot().currentRevision, 3)
  assert.equal(controller.snapshot().draft?.revision, 1)
})
for (const action of ["cancel", "select", "close"] as const) {
  test(`${action} ignores late acknowledgement`, async () => {
    const pending = deferred()
    const controller = new WidgetController({
      async callServerTool({ name }) {
        await Promise.resolve()

        return name === "get_game_draft" ? draft() : pending.promise
      },
    })
    controller.select(id)
    await controller.refresh()
    const update = controller.update("edited")

    if (action === "select") {
      controller.select(other)
    } else {
      controller[action]()
    }

    pending.resolve(ack())
    await update
    assert.notEqual(controller.snapshot().status, "acknowledged")
    assert.notEqual(controller.snapshot().draft?.revision, 2)
  })
}
test("out-of-order host preview cannot lower revision or switch draft", async () => {
  const controller = new WidgetController({
    async callServerTool() {
      await Promise.resolve()

      return draft(3)
    },
  })
  controller.select(id)
  await controller.refresh()
  controller.receivePreview(preview(1))
  controller.receivePreview(preview(6, other))
  assert.equal(controller.snapshot().draft?.revision, 3)
  assert.equal(controller.snapshot().preview, null)
  controller.receivePreview(preview(4))
  assert.equal(controller.snapshot().draft, null)
  assert.equal(controller.snapshot().preview?.revision, 4)
})
test("wrong response identity or revision never acknowledges write", async () => {
  for (const bad of [ack(1), ack(9), ack(2, other)]) {
    const controller = new WidgetController({
      async callServerTool({ name }) {
        await Promise.resolve()

        return name === "get_game_draft" ? draft() : bad
      },
    })
    controller.select(id)
    await controller.refresh()
    await controller.update("edited")
    assert.equal(controller.snapshot().status, "error")
    assert.equal(controller.snapshot().draft?.revision, 1)
  }
})
test("eight i18next locales have complete nonempty label sets", async () => {
  const instance = createWidgetI18n()
  const expected = Object.keys(resources.en.widget).sort()
  for (const locale of locales) {
    assert.deepEqual(Object.keys(resources[locale].widget).sort(), expected)
    await instance.changeLanguage(locale)
    for (const key of expected) {
      assert.equal(typeof resources[locale].widget[key], "string")
      assert.ok(instance.t(key, { ns: "widget" }).length > 0)
    }
  }
})
test("an edit from an older base cannot overwrite a refreshed revision", async () => {
  let reads = 0,
    writes = 0
  const controller = new WidgetController({
    async callServerTool({ name }) {
      await Promise.resolve()

      if (name === "get_game_draft") {
        reads += 1

        return draft(reads)
      }

      writes += 1

      return ack(3)
    },
  })
  controller.select(id)
  await controller.refresh()
  await controller.refresh()
  await controller.update("old unsent edit", 1)
  assert.equal(writes, 0)
  assert.equal(controller.snapshot().status, "conflict")
  assert.equal(controller.snapshot().draft?.revision, 2)
})
test("undo is a new server-acknowledged CAS write, never an optimistic rollback", async () => {
  const calls: Array<Record<string, unknown>> = []
  const pending = deferred()
  const controller = new WidgetController({
    async callServerTool({ name, arguments: args }) {
      await Promise.resolve()

      if (name === "get_game_draft") {
        return draft()
      }

      calls.push(args)

      return calls.length === 1 ? ack(2) : pending.promise
    },
  })
  controller.select(id)
  await controller.refresh()
  await controller.update("edited")
  assert.equal(controller.snapshot().undoAvailable, true)
  const undo = controller.undo()
  await Promise.resolve()
  assert.equal(calls[1]?.expectedRevision, 2)
  assert.equal(calls[1]?.authoredShowJson, '{"title":"Original"}')
  assert.equal(controller.snapshot().draft?.authoredShowJson, "edited")
  pending.resolve(ack(3))
  await undo
  assert.equal(
    controller.snapshot().draft?.authoredShowJson,
    '{"title":"Original"}',
  )
  assert.equal(controller.snapshot().undoAvailable, false)
})
test("a title edit preserves every unrelated card and setting", () => {
  const original = {
    title: "Original",
    cards: [{ key: "q1", question: "Keep me", answers: ["A", "B"] }],
    settings: [],
    note: "preserved",
  }
  const next = withDraftTitle(JSON.stringify(original), "Edited")
  assert.ok(next)
  assert.equal(draftTitle(next), "Edited")
  assert.deepEqual(JSON.parse(next), { ...original, title: "Edited" })
  assert.equal(withDraftTitle("not JSON", "Edited"), null)
})
test("oversized server structured content fails the original MCP bound", () => {
  const oversized = result({
    draftId: id,
    revision: 1,
    summary,
    authoredShowJson: "a".repeat(100000),
  })
  assert.throws(
    () => parseResult(dataSchemas.get_game_draft, oversized),
    /result-too-large/u,
  )
})
