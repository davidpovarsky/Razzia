import { randomUUID } from "node:crypto"
import {
  FULL_SHOW_META_V3,
  fullShowFrameV3Schema,
} from "../contracts/full-show-frame.ts"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { canonicalJson, hashJson, utf8Bytes } from "../contracts/canonical.ts"
import { CONTRACT_VERSION, LIMITS, jsonObject } from "../contracts/schemas.ts"
import {
  dataSchemas,
  inputs,
  outputs,
  type ToolName,
} from "../contracts/tools.ts"
import { normalizeDraft, normalizeStoredDraft } from "./authoring.ts"
import { preserveSemanticState, readSemanticShow } from "./semantic-state.ts"
import {
  deriveAuthoredShowPreviewIdentityMap,
  getPreviewIdentityId,
} from "../../core/show-library/identity.ts"
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
import {
  isPackageTool,
  packageDataSchemas,
  packageInputs,
} from "../contracts/package-authoring.ts"

function publicDraft(record: DraftRecord) {
  return {
    draftId: record.draftId,
    revision: record.revision,
    summary: record.summary,
  }
}

/** Model-only address directory in authored order, never sorted identity-key order. */
function modelQuestionRefs(record: DraftRecord) {
  const show = readSemanticShow(record.authoredShowJson)
  const identities = deriveAuthoredShowPreviewIdentityMap(show)

  return show.cards
    .filter((card) => card.kind === "quiz" || card.kind === "survey")
    .map((card, index) => ({
      questionNumber: index + 1,
      publicQuestionId: getPreviewIdentityId(identities, "questions", card.key),
    }))
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
    if (utf8Bytes(canonicalJson(raw)) > LIMITS.request) {
      throw new ToolError("VALIDATION_FAILED")
    }

    if (!inputs[name].safeParse(raw).success) {
      throw new ToolError("VALIDATION_FAILED")
    }

    let data: unknown
    let meta: Record<string, unknown> | undefined

    if (isPackageTool(name)) {
      if (!deps.packages) {
        throw unavailable()
      }

      const a = packageInputs[name].parse(raw)
      const result = await deps.packages.call(p, name, a)
      const packaged = packageDataSchemas[name].parse(result.data)

      if (
        ("uploadId" in a &&
          "uploadId" in packaged &&
          a.uploadId !== packaged.uploadId) ||
        ("transferId" in a &&
          "transferId" in packaged &&
          a.transferId !== packaged.transferId) ||
        ("expectedRevision" in a &&
          typeof a.expectedRevision === "number" &&
          "revision" in packaged &&
          (name === "build_package"
            ? packaged.revision < a.expectedRevision
            : a.expectedRevision !== packaged.revision)) ||
        ("gameId" in a && "gameId" in packaged && a.gameId !== packaged.gameId)
      ) {
        throw new ToolError("INTERNAL")
      }

      if (
        "totalBytes" in a &&
        "totalBytes" in packaged &&
        (packaged.totalBytes !== a.totalBytes ||
          packaged.receivedBytes > a.totalBytes)
      ) {
        throw new ToolError("INTERNAL")
      }

      if (
        name === "write_package_upload_chunk" &&
        "receivedBytes" in packaged
      ) {
        const chunk = packageInputs.write_package_upload_chunk.parse(raw)
        const padding = chunk.bytesBase64.endsWith("==")
          ? 2
          : chunk.bytesBase64.endsWith("=")
            ? 1
            : 0
        const chunkBytes = (chunk.bytesBase64.length / 4) * 3 - padding

        if (packaged.receivedBytes < chunk.offset + chunkBytes) {
          throw new ToolError("INTERNAL")
        }
      }

      if ("uploadUrl" in packaged && packaged.uploadUrl) {
        firstPartyUrl(packaged.uploadUrl, config)
      }
      if ("previewUrl" in packaged) {
        firstPartyUrl(packaged.previewUrl, config)
      }
      if ("studioUrl" in packaged && packaged.studioUrl) {
        firstPartyUrl(packaged.studioUrl, config)
      }
      if ("downloadUrl" in packaged && packaged.downloadUrl) {
        firstPartyUrl(packaged.downloadUrl, config)
      }

      data = packaged
      meta = result.meta
    } else
      switch (name) {
        case "list_game_templates": {
          if (!deps.catalog) {
            throw unavailable()
          }

          const a = inputs[name].parse(raw)
          data = await deps.catalog.listTemplates(p, a)

          break
        }

        case "list_themes": {
          if (!deps.catalog) {
            throw unavailable()
          }

          const a = inputs[name].parse(raw)
          const listed = dataSchemas.list_themes.parse(
            await deps.catalog.listThemes(p, a),
          )

          if (
            !deps.preview &&
            !deps.fullShowPreviewV3 &&
            listed.items.some((item) => item.previewAvailable)
          ) {
            throw new ToolError("INTERNAL")
          }

          data = listed

          break
        }

        case "create_game_draft": {
          if (!deps.drafts || !deps.authoring) {
            throw unavailable()
          }

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
          ) {
            throw new ToolError("INTERNAL")
          }

          data = publicDraft(record)

          break
        }

        case "get_game_draft_summary": {
          const a = inputs[name].parse(raw)
          data = deps.semanticDrafts
            ? await deps.semanticDrafts.state(p, a)
            : publicDraft(
                await readDraft(deps, p, a.draftId, a.expectedRevision),
              )

          break
        }

        case "get_game_draft": {
          const a = inputs[name].parse(raw)
          const record = await readDraft(deps, p, a.draftId)

          if (utf8Bytes(record.authoredShowJson) > LIMITS.authored) {
            throw new ToolError("INTERNAL")
          }

          data = {
            ...publicDraft(record),
            authoredShowJson: record.authoredShowJson,
            questionRefs: modelQuestionRefs(record),
          }

          break
        }

        case "apply_game_edit": {
          if (!deps.semanticDrafts) {
            throw unavailable()
          }

          data = await deps.semanticDrafts.patch(p, inputs[name].parse(raw), {
            correlationId,
          })

          break
        }

        case "undo_game_edit": {
          if (!deps.semanticDrafts) {
            throw unavailable()
          }

          data = await deps.semanticDrafts.undo(p, inputs[name].parse(raw), {
            correlationId,
          })

          break
        }

        case "list_editing_assets": {
          if (!deps.semanticDrafts) {
            throw unavailable()
          }

          data = await deps.semanticDrafts.assets(p, inputs[name].parse(raw))

          break
        }

        case "update_game_draft": {
          if (!deps.drafts || !deps.authoring) {
            throw unavailable()
          }

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

          const expected = deps.authoring.semantic
            ? normalizeStoredDraft(
                preserveSemanticState(
                  record.authoredShowJson,
                  normalized.authoredShowJson,
                  deps.authoring,
                ),
                deps.authoring,
              )
            : normalized

          if (
            record.draftId !== a.draftId ||
            record.revision !== a.expectedRevision + 1 ||
            record.authoredShowJson !== expected.authoredShowJson ||
            hashJson(record.summary) !== hashJson(expected.summary)
          ) {
            throw new ToolError("INTERNAL")
          }

          data = publicDraft(record)

          break
        }

        case "update_game_title": {
          if (deps.semanticDrafts) {
            const { title, ...input } = inputs[name].parse(raw)
            data = await deps.semanticDrafts.patch(
              p,
              { ...input, patch: { kind: "set-title", title } },
              { correlationId },
            )

            break
          }

          if (!deps.drafts || !deps.authoring) {
            throw unavailable()
          }

          const a = inputs[name].parse(raw)
          const original = await readDraft(
            deps,
            p,
            a.draftId,
            a.expectedRevision,
          )
          const normalized = normalizeDraft(
            JSON.stringify({
              ...JSON.parse(original.authoredShowJson),
              title: a.title,
            }),
            deps.authoring,
          )
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
                  contractVersion: CONTRACT_VERSION,
                  authoredShowJson: normalized.authoredShowJson,
                  idempotencyKey: a.idempotencyKey,
                  draftId: a.draftId,
                  expectedRevision: a.expectedRevision,
                }),
              },
            ),
            deps,
          )

          if (
            record.draftId !== a.draftId ||
            record.revision !== a.expectedRevision + 1 ||
            record.authoredShowJson !== normalized.authoredShowJson
          ) {
            throw new ToolError("INTERNAL")
          }

          data = publicDraft(record)

          break
        }

        case "preview_show": {
          if (!deps.fullShowPreviewV3 || !deps.fullShowUiResourceV3) {
            throw new ToolError("PREVIEW_UNAVAILABLE")
          }

          const { contractVersion: _version, ...a } = inputs[name].parse(raw)
          const frame = fullShowFrameV3Schema.parse(
            await deps.fullShowPreviewV3.render(p, a),
          )

          if (
            frame.inventory.draftId !== a.draftId ||
            frame.inventory.revision !== a.expectedRevision ||
            (a.chapterId &&
              frame.inventory.selectedChapterId !== a.chapterId) ||
            utf8Bytes(JSON.stringify(frame)) > LIMITS.preview
          ) {
            throw new ToolError("PREVIEW_UNAVAILABLE")
          }

          data = {
            draftId: a.draftId,
            revision: a.expectedRevision,
            title: frame.inventory.title,
            selectedChapterId: frame.inventory.selectedChapterId,
            chapterCount: frame.inventory.chapters.length,
            frameDigest: hashJson(frame),
          }
          meta = { [FULL_SHOW_META_V3]: frame }

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
            ) {
              throw new ToolError("PREVIEW_UNAVAILABLE")
            }

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

            if (utf8Bytes(JSON.stringify(result)) > LIMITS.response) {
              throw new ToolError("PREVIEW_UNAVAILABLE")
            }

            return result
          }

          const result = await renderPreview(deps, p, record, a.locale)
          data = result.data
          meta = result.meta

          break
        }

        case "save_game": {
          const a = inputs[name].parse(raw)

          if (!deps.storage) {
            throw unavailable()
          }

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
          ) {
            throw new ToolError("INTERNAL")
          }

          firstPartyUrl(saved.studioUrl, config)
          data = saved

          break
        }

        case "export_game": {
          const a = inputs[name].parse(raw)

          if (!deps.exports) {
            throw new ToolError("EXPORT_UNAVAILABLE")
          }

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
          ) {
            throw new ToolError("INTERNAL")
          }

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

    if (utf8Bytes(JSON.stringify(structuredContent)) > LIMITS.structured) {
      throw new ToolError("INTERNAL")
    }

    const result: CallToolResult = {
      content: [
        {
          type: "text",
          text:
            name === "preview_show"
              ? `Native demo data is ready for draft ${dataSchemas.preview_show.parse(data).draftId}, revision ${dataSchemas.preview_show.parse(data).revision}: ${dataSchemas.preview_show.parse(data).title}. There are ${dataSchemas.preview_show.parse(data).chapterCount} chapters. An MCP App capable host can display the selected chapter. If this host has no interactive view, continue with get_game_draft_summary and apply_game_edit in chat. To save the same revision, use save_game and approve the first-party Tadazz consent page; export_game requires separate asset export rights.`
              : JSON.stringify({ ok: true, tool: name }),
        },
      ],
      structuredContent,
      ...(meta ? { _meta: meta } : {}),
    }

    if (utf8Bytes(JSON.stringify(result)) > LIMITS.response) {
      throw new ToolError("INTERNAL")
    }

    return result
  } catch (error) {
    return failureResult(name, error, config, correlationId)
  }
}
