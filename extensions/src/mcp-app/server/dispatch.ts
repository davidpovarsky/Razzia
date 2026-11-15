import { randomUUID } from "node:crypto"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { canonicalJson, hashJson, utf8Bytes } from "../contracts/canonical.ts"
import { CONTRACT_VERSION, LIMITS, jsonObject } from "../contracts/schemas.ts"
import {
  dataSchemas,
  inputs,
  outputs,
  type ToolName,
} from "../contracts/tools.ts"
import { normalizeDraft } from "./authoring.ts"
import { renderPreview } from "./preview.ts"
import type {
  Dependencies,
  DraftRecord,
  ServerConfig,
  VerifiedPrincipal,
} from "./dependencies.ts"
import { ToolError, unavailable } from "./errors.ts"
import { checkedDraft, readDraft } from "./drafts.ts"
import { firstPartyUrl, failureResult } from "./results.ts"
import {
  PREVIEW_CANDIDATE_META_V2,
  previewCandidateV2Schema,
} from "../contracts/preview-candidate-v2.ts"

function publicDraft(record: DraftRecord) {
  return {
    draftId: record.draftId,
    revision: record.revision,
    summary: record.summary,
  }
}
export async function dispatch(
  name: ToolName,
  raw: unknown,
  p: VerifiedPrincipal,
  deps: Dependencies,
  config: ServerConfig,
): Promise<CallToolResult> {
  const correlationId = randomUUID()
  try {
    if (utf8Bytes(canonicalJson(raw)) > LIMITS.request)
      throw new ToolError("VALIDATION_FAILED")
    if (!inputs[name].safeParse(raw).success)
      throw new ToolError("VALIDATION_FAILED")
    let data: unknown
    let meta: Record<string, unknown> | undefined
    switch (name) {
      case "list_game_templates": {
        if (!deps.catalog) throw unavailable()
        const a = inputs[name].parse(raw)
        data = await deps.catalog.listTemplates(p, a)
        break
      }
      case "list_themes": {
        if (!deps.catalog) throw unavailable()
        const a = inputs[name].parse(raw)
        const listed = dataSchemas.list_themes.parse(
          await deps.catalog.listThemes(p, a),
        )
        if (!deps.preview && listed.items.some((item) => item.previewAvailable))
          throw new ToolError("INTERNAL")
        data = listed
        break
      }
      case "create_game_draft": {
        if (!deps.drafts || !deps.authoring) throw unavailable()
        const a = inputs[name].parse(raw)
        const normalized = normalizeDraft(a.authoredShowJson, deps.authoring)
        const record = checkedDraft(
          await deps.drafts.create(
            p,
            {
              ...normalized,
              ...(a.locale ? { locale: a.locale } : {}),
            },
            {
              idempotencyKey: a.idempotencyKey,
              correlationId,
              inputDigest: hashJson({
                ...a,
                authoredShowJson: normalized.authoredShowJson,
              }),
            },
          ),
          deps,
        )
        if (
          record.revision !== 1 ||
          record.authoredShowJson !== normalized.authoredShowJson
        )
          throw new ToolError("INTERNAL")
        data = publicDraft(record)
        break
      }
      case "get_game_draft": {
        const a = inputs[name].parse(raw)
        const record = await readDraft(deps, p, a.draftId)
        if (utf8Bytes(record.authoredShowJson) > LIMITS.authored)
          throw new ToolError("INTERNAL")
        data = {
          ...publicDraft(record),
          authoredShowJson: record.authoredShowJson,
        }
        break
      }
      case "update_game_draft": {
        if (!deps.drafts || !deps.authoring) throw unavailable()
        const a = inputs[name].parse(raw)
        const normalized = normalizeDraft(a.authoredShowJson, deps.authoring)
        const record = checkedDraft(
          await deps.drafts.replace(
            p,
            a.draftId,
            a.expectedRevision,
            normalized,
            {
              idempotencyKey: a.idempotencyKey,
              correlationId,
              inputDigest: hashJson({
                ...a,
                authoredShowJson: normalized.authoredShowJson,
              }),
            },
          ),
          deps,
        )
        if (
          record.draftId !== a.draftId ||
          record.revision !== a.expectedRevision + 1 ||
          record.authoredShowJson !== normalized.authoredShowJson
        )
          throw new ToolError("INTERNAL")
        data = publicDraft(record)
        break
      }
      case "preview_game": {
        const a = inputs[name].parse(raw)
        const record = await readDraft(deps, p, a.draftId, a.expectedRevision)
        if (!deps.preview && deps.previewCandidateV2) {
          const candidate = previewCandidateV2Schema.parse(
            await deps.previewCandidateV2.render(p, record, a.locale),
          )
          if (
            candidate.draftId !== record.draftId ||
            candidate.revision !== record.revision ||
            utf8Bytes(JSON.stringify(candidate)) > LIMITS.preview
          )
            throw new ToolError("PREVIEW_UNAVAILABLE")
          const failure = failureResult(
            name,
            new ToolError("PREVIEW_UNAVAILABLE"),
            config,
            correlationId,
          )
          const result = {
            ...failure,
            _meta: { [PREVIEW_CANDIDATE_META_V2]: candidate },
          }
          if (utf8Bytes(JSON.stringify(result)) > LIMITS.response)
            throw new ToolError("PREVIEW_UNAVAILABLE")
          return result
        }
        const result = await renderPreview(deps, p, record, a.locale)
        data = result.data
        meta = result.meta
        break
      }
      case "save_game": {
        const a = inputs[name].parse(raw)
        if (!deps.storage) throw unavailable()
        const saved = dataSchemas[name].parse(
          await deps.storage.createNewWithConsent(
            p,
            { draftId: a.draftId, expectedRevision: a.expectedRevision },
            {
              idempotencyKey: a.idempotencyKey,
              inputDigest: hashJson(a),
              correlationId,
            },
          ),
        )
        if (
          saved.draftId !== a.draftId ||
          saved.revision !== a.expectedRevision
        )
          throw new ToolError("INTERNAL")
        firstPartyUrl(saved.studioUrl, config)
        data = saved
        break
      }
      case "export_game": {
        const a = inputs[name].parse(raw)
        if (!deps.exports) throw new ToolError("EXPORT_UNAVAILABLE")
        const exported = dataSchemas[name].parse(
          await deps.exports.createAuthorizedDownload(
            p,
            { draftId: a.draftId, expectedRevision: a.expectedRevision },
            a.format,
            {
              idempotencyKey: a.idempotencyKey,
              inputDigest: hashJson(a),
              correlationId,
            },
          ),
        )
        if (
          exported.draftId !== a.draftId ||
          exported.revision !== a.expectedRevision ||
          exported.format !== a.format
        )
          throw new ToolError("INTERNAL")
        firstPartyUrl(exported.downloadUrl, config)
        data = exported
        break
      }
    }
    const structuredContent = jsonObject.parse(
      outputs[name].parse({
        contractVersion: CONTRACT_VERSION,
        ok: true,
        correlationId,
        data,
      }),
    )
    if (utf8Bytes(JSON.stringify(structuredContent)) > LIMITS.structured)
      throw new ToolError("INTERNAL")
    const result: CallToolResult = {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, tool: name }) },
      ],
      structuredContent,
      ...(meta ? { _meta: meta } : {}),
    }
    if (utf8Bytes(JSON.stringify(result)) > LIMITS.response)
      throw new ToolError("INTERNAL")
    return result
  } catch (error) {
    return failureResult(name, error, config, correlationId)
  }
}
