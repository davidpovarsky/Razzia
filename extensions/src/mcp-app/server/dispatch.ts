import { randomUUID } from "node:crypto"
import type {
  CallToolResult,
  ServerContext,
} from "@modelcontextprotocol/server"
import { canonicalJson, hashJson, utf8Bytes } from "../contracts/canonical.ts"
import { CONTRACT_VERSION, LIMITS, jsonObject } from "../contracts/schemas.ts"
import {
  dataSchemas,
  inputs,
  outputs,
  type ToolName,
} from "../contracts/tools.ts"
import { authorize, oauthChallenge } from "./authorization.ts"
import { normalizeDraft } from "./authoring.ts"
import { renderPreview } from "./preview.ts"
import type {
  Dependencies,
  DraftRecord,
  ServerConfig,
  VerifiedPrincipal,
} from "./dependencies.ts"
import { ToolError, safeError, unavailable } from "./errors.ts"

function publicDraft(record: DraftRecord) {
  return {
    draftId: record.draftId,
    revision: record.revision,
    summary: record.summary,
  }
}
async function readDraft(
  deps: Dependencies,
  p: VerifiedPrincipal,
  id: string,
  expected?: number,
) {
  if (!deps.drafts) throw unavailable()
  const record = await deps.drafts.get(p, id)
  if (!record || record.draftId !== id) throw new ToolError("NOT_FOUND")
  if (!deps.authoring) throw unavailable()
  try {
    const checked = normalizeDraft(record.authoredShowJson, deps.authoring)
    if (checked.authoredShowJson !== record.authoredShowJson)
      throw new Error("Noncanonical stored draft")
  } catch {
    throw new ToolError("INTERNAL")
  }
  if (expected !== undefined && record.revision !== expected) {
    throw new ToolError("REVISION_CONFLICT", {
      currentRevision: record.revision,
    })
  }
  return record
}
function firstPartyUrl(value: string, config: ServerConfig) {
  const u = new URL(value)
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    u.search ||
    !config.firstPartyOrigins?.includes(u.origin)
  )
    throw new ToolError("INTERNAL")
}
export async function dispatch(
  name: ToolName,
  raw: unknown,
  context: ServerContext,
  deps: Dependencies,
  config: ServerConfig,
): Promise<CallToolResult> {
  const correlationId = randomUUID()
  try {
    if (utf8Bytes(canonicalJson(raw)) > LIMITS.request)
      throw new ToolError("VALIDATION_FAILED")
    if (!inputs[name].safeParse(raw).success)
      throw new ToolError("VALIDATION_FAILED")
    const p = await authorize(name, context, deps, config)
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
        data = publicDraft(
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
        )
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
        data = publicDraft(
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
        )
        break
      }
      case "preview_game": {
        const a = inputs[name].parse(raw)
        const record = await readDraft(deps, p, a.draftId, a.expectedRevision)
        const result = await renderPreview(deps, p, record, a.locale)
        data = result.data
        meta = result.meta
        break
      }
      case "save_game": {
        const a = inputs[name].parse(raw)
        if (!deps.storage) throw unavailable()
        const record = await readDraft(deps, p, a.draftId, a.expectedRevision)
        const saved = dataSchemas[name].parse(
          await deps.storage.createNewWithConsent(p, record, {
            idempotencyKey: a.idempotencyKey,
            inputDigest: hashJson(a),
            correlationId,
          }),
        )
        if (
          saved.draftId !== record.draftId ||
          saved.revision !== record.revision
        )
          throw new ToolError("INTERNAL")
        firstPartyUrl(saved.studioUrl, config)
        data = saved
        break
      }
      case "export_game": {
        const a = inputs[name].parse(raw)
        if (!deps.exports) throw new ToolError("EXPORT_UNAVAILABLE")
        const record = await readDraft(deps, p, a.draftId, a.expectedRevision)
        const exported = dataSchemas[name].parse(
          await deps.exports.createAuthorizedDownload(p, record, a.format, {
            idempotencyKey: a.idempotencyKey,
            inputDigest: hashJson(a),
            correlationId,
          }),
        )
        if (
          exported.draftId !== record.draftId ||
          exported.revision !== record.revision ||
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
    const failure = safeError(error)
    if (failure.consentUrl) {
      try {
        firstPartyUrl(failure.consentUrl, config)
      } catch {
        delete failure.consentUrl
        delete failure.consentRequestId
        failure.code = "INTERNAL"
        failure.messageKey = "extensions:mcp.INTERNAL"
        failure.retryable = false
      }
    }
    const structuredContent = jsonObject.parse(
      outputs[name].parse({
        contractVersion: CONTRACT_VERSION,
        ok: false,
        correlationId,
        error: failure,
      }),
    )
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: false, code: failure.code }),
        },
      ],
      structuredContent,
      ...(failure.code === "SCOPE_REQUIRED" ||
      failure.code === "ACCOUNT_UNAVAILABLE"
        ? { _meta: { "mcp/www_authenticate": [oauthChallenge(config, name)] } }
        : {}),
    }
  }
}
