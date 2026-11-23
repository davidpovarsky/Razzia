import { z } from "zod"
import {
  semanticPatchInputSchema,
  semanticUndoInputSchema,
  semanticStateInputSchema,
  semanticAssetsInputSchema,
  semanticMutationResultSchema,
  semanticAssetsResultSchema,
  semanticQuestionRefSchema,
} from "./semantic-edit.ts"
import { fullShowToolInputV3Schema } from "./full-show-frame.ts"
import {
  packageInputs,
  packageDataSchemas,
  packageScopes,
  packageMutations,
  packageDescriptions,
} from "./package-authoring.ts"
import {
  authoredJson,
  baseInput,
  diagnostics,
  draftData,
  locale,
  opaqueId,
  outputSchema,
  previewData,
  revision,
  digest,
} from "./schemas.ts"

const page = z.strictObject({
  ...baseInput,
  limit: z.number().int().min(1).max(20).optional(),
  cursor: z.string().min(1).max(128).optional(),
})
const selected = { ...baseInput, draftId: opaqueId }
const versioned = { ...selected, expectedRevision: revision }
const key = { idempotencyKey: opaqueId }
const refText = (max: number) => z.string().min(1).max(max)

export const inputs = {
  list_game_templates: page,
  list_themes: page,
  create_game_draft: z.strictObject({
    ...baseInput,
    authoredShowJson: authoredJson,
    locale: locale.optional(),
    ...key,
  }),
  get_game_draft: z.strictObject(selected),
  get_game_draft_summary: semanticStateInputSchema,
  apply_game_edit: semanticPatchInputSchema,
  undo_game_edit: semanticUndoInputSchema,
  list_editing_assets: semanticAssetsInputSchema,
  update_game_draft: z.strictObject({
    ...versioned,
    authoredShowJson: authoredJson,
    ...key,
  }),
  preview_game: z.strictObject({ ...versioned, locale: locale.optional() }),
  preview_show: fullShowToolInputV3Schema,
  update_game_title: z.strictObject({
    ...versioned,
    ...key,
    title: z.string().min(1).max(160),
  }),
  save_game: z.strictObject({
    ...versioned,
    ...key,
    intent: z.literal("createNew"),
  }),
  export_game: z.strictObject({
    ...versioned,
    ...key,
    format: z.enum(["tada-json", "enhanced-bundle"]),
  }),
  ...packageInputs,
}

const pageResult = <T extends z.ZodType>(item: T) =>
  z.strictObject({
    items: z.array(item).max(20),
    nextCursor: refText(128).optional(),
  })

export const dataSchemas = {
  list_game_templates: pageResult(
    z.strictObject({
      templateId: refText(64),
      version: refText(32),
      title: refText(160),
      questionCount: z.number().int().min(1).max(25),
    }),
  ),
  list_themes: pageResult(
    z.strictObject({
      themeId: refText(64),
      version: refText(32),
      title: refText(160),
      previewAvailable: z.boolean(),
      exportPermitted: z.boolean(),
    }),
  ),
  create_game_draft: draftData,
  get_game_draft_summary: semanticMutationResultSchema,
  apply_game_edit: semanticMutationResultSchema,
  undo_game_edit: semanticMutationResultSchema,
  list_editing_assets: semanticAssetsResultSchema,
  get_game_draft: draftData.extend({
    authoredShowJson: authoredJson,
    questionRefs: z.array(semanticQuestionRefSchema).min(1).max(25),
  }),
  update_game_draft: draftData,
  preview_game: previewData,
  preview_show: z.strictObject({
    draftId: opaqueId,
    revision,
    title: z.string().max(160),
    selectedChapterId: refText(128),
    chapterCount: z.number().int().min(1).max(1024),
    frameDigest: digest,
  }),
  update_game_title: semanticMutationResultSchema,
  save_game: z.strictObject({
    draftId: opaqueId,
    revision,
    quizId: refText(128),
    savedRevision: revision,
    studioUrl: z.url().max(2048),
  }),
  export_game: z.strictObject({
    exportId: opaqueId,
    draftId: opaqueId,
    revision,
    format: z.enum(["tada-json", "enhanced-bundle"]),
    downloadUrl: z.url().max(2048),
    expiresAt: z.iso.datetime(),
    sha256: digest,
    bytes: z.number().int().min(1).max(262_144),
  }),
  ...packageDataSchemas,
}

export type ToolName = keyof typeof inputs

export const toolNames = Object.freeze(Object.keys(inputs) as ToolName[])

export const scopes: Readonly<Record<ToolName, readonly string[]>> = {
  list_game_templates: ["tadazz.catalog.read"],
  list_themes: ["tadazz.catalog.read"],
  create_game_draft: ["tadazz.drafts.write"],
  get_game_draft: ["tadazz.drafts.read"],
  get_game_draft_summary: ["tadazz.drafts.read"],
  apply_game_edit: ["tadazz.drafts.read", "tadazz.drafts.write"],
  undo_game_edit: ["tadazz.drafts.read", "tadazz.drafts.write"],
  list_editing_assets: ["tadazz.drafts.read"],
  update_game_draft: ["tadazz.drafts.read", "tadazz.drafts.write"],
  preview_game: ["tadazz.drafts.read"],
  preview_show: ["tadazz.drafts.read"],
  update_game_title: ["tadazz.drafts.read", "tadazz.drafts.write"],
  save_game: ["tadazz.drafts.read", "tadazz.library.write"],
  export_game: ["tadazz.drafts.read", "tadazz.exports.read"],
  ...packageScopes,
}

// Raw authored JSON is model-only; the UI receives selected frames and bounded summaries.
export const widgetTools = new Set<ToolName>([
  "list_themes",
  "get_game_draft_summary",
  "apply_game_edit",
  "undo_game_edit",
  "list_editing_assets",
  "preview_game",
  "preview_show",
  "update_game_title",
  "save_game",
])

export const mutations = new Set<ToolName>([
  "create_game_draft",
  "apply_game_edit",
  "undo_game_edit",
  "update_game_draft",
  "update_game_title",
  "save_game",
  "export_game",
  ...packageMutations,
])

export const destructiveTools = new Set<ToolName>(["delete_package_draft"])

export const outputs = Object.fromEntries(
  toolNames.map((name) => [name, outputSchema(dataSchemas[name])]),
) as Record<ToolName, ReturnType<typeof outputSchema>>

export const descriptions: Readonly<Record<ToolName, string>> = {
  list_game_templates:
    "List authorized trusted templates. Candidate presence is not renderer availability.",
  list_themes:
    "List authorized exact theme versions. Preview readiness requires an accepted compiled adapter.",
  create_game_draft:
    'Create a private validated draft, not a library game. authoredShowJson encodes tada-show version 1 with title and keyed quiz/survey cards; settings must be empty. Example: {"format":"tada-show","version":1,"title":"Demo","cards":[{"key":"q1","kind":"quiz","question":"Pick A","answers":[{"text":"A"},{"text":"B"}],"correctAnswers":[1],"timeSeconds":20}],"settings":[]}.',
  get_game_draft_summary:
    "Read only your draft summary and current revision without exposing authored card data.",
  get_game_draft:
    "Read your bounded canonical draft, revision and ordered questionRefs. For a request such as edit question 3, use the entry whose questionNumber is 3 and pass its publicQuestionId to apply_game_edit; never invent or hash an ID. This full-source tool is model-only.",
  update_game_draft:
    "Replace the same draft at expectedRevision. Preserve other card keys/content. Existing protected native settings are preserved server-side; use apply_game_edit for approved theme/audio/appearance changes.",
  preview_game:
    "Display an interactive demo only when the accepted shared SB renderer exists; otherwise report unavailable. No real votes or rooms.",
  preview_show:
    "Open the native full-show demo for your exact draft revision. The interactive view retrieves only the selected chapter; no live room or real votes. If your host cannot render an MCP App, use the returned bounded text summary and continue edits in chat; save_game saves the exact revision directly when requested. Use this versioned tool for the installed full-show widget. selectionVersion=3, context={mode:demo,role:spectator,locale:en,reducedMotion:false,join:unavailable-demo,actions:synthetic-only}.",
  apply_game_edit:
    "Apply one bounded semantic edit to your exact draft revision with a stable idempotencyKey. Supports title, selected question text, approved background, native theme, voting music/volume and five answer pictures. For question-specific edits, first read get_game_draft questionRefs to resolve the requested questionNumber. Discover exact asset refs with list_editing_assets; never invent question IDs, asset IDs, hashes or URLs. An acknowledged revision is still a private draft, not a library save.",
  undo_game_edit:
    "Undo one acknowledged semantic edit using its opaque undoOperationId and exact current revision. Creates a new revision. Reuse the same idempotencyKey for retries; refresh summary to discover the current authorized undo after reconnect.",
  list_editing_assets:
    "List reviewed built-in assets permitted for your exact current draft theme, purpose and revision. Use returned opaque refs in apply_game_edit. Listing does not grant export rights, authorize customer uploads, or start audio.",
  update_game_title:
    "Change only a private draft title at the exact expectedRevision, preserving every card and all other content. This does not save the draft to the library.",
  save_game:
    "Save the exact draft revision as a new private account game using your active library-write authorization and durable safe storage. No separate save approval page; no overwrite. Reuse the same idempotencyKey for retries.",
  export_game:
    "Export your exact revision after scope/ownership/rights checks. No new per-export consent; delivery may be unavailable.",
  ...packageDescriptions,
}

export { diagnostics }
