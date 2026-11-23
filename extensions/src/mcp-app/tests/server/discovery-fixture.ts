import assert from "node:assert/strict"
import type { Client } from "@modelcontextprotocol/client"
type DiscoveredTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number]

const expected = [
  ["list_game_templates", ["tadazz.catalog.read"], false, false],
  ["list_themes", ["tadazz.catalog.read"], false, true],
  ["create_game_draft", ["tadazz.drafts.write"], true, false],
  ["get_game_draft", ["tadazz.drafts.read"], false, false],
  ["get_game_draft_summary", ["tadazz.drafts.read"], false, true],
  [
    "apply_game_edit",
    ["tadazz.drafts.read", "tadazz.drafts.write"],
    true,
    true,
  ],
  ["undo_game_edit", ["tadazz.drafts.read", "tadazz.drafts.write"], true, true],
  ["list_editing_assets", ["tadazz.drafts.read"], false, true],
  [
    "update_game_draft",
    ["tadazz.drafts.read", "tadazz.drafts.write"],
    true,
    false,
  ],
  ["preview_game", ["tadazz.drafts.read"], false, true],
  ["preview_show", ["tadazz.drafts.read"], false, true],
  [
    "update_game_title",
    ["tadazz.drafts.read", "tadazz.drafts.write"],
    true,
    true,
  ],
  ["save_game", ["tadazz.drafts.read", "tadazz.library.write"], true, true],
  ["export_game", ["tadazz.drafts.read", "tadazz.exports.read"], true, false],
  ["get_authoring_capabilities", ["tadazz.catalog.read"], false, false],
  ["list_packages", ["tadazz.drafts.read"], false, false],
  ["begin_package_upload", ["tadazz.drafts.write"], true, false],
  ["write_package_upload_chunk", ["tadazz.drafts.write"], true, false],
  ["complete_package_upload", ["tadazz.drafts.write"], true, false],
  ["get_package_status", ["tadazz.drafts.read"], false, false],
  ["build_package", ["tadazz.drafts.read", "tadazz.drafts.write"], true, false],
  ["preview_package", ["tadazz.drafts.read"], false, false],
  [
    "delete_package_draft",
    ["tadazz.drafts.read", "tadazz.drafts.write"],
    true,
    false,
  ],
  [
    "install_package",
    ["tadazz.drafts.read", "tadazz.library.write"],
    true,
    false,
  ],
  [
    "export_package",
    ["tadazz.drafts.read", "tadazz.exports.read"],
    true,
    false,
  ],
] as const

function record(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value))

  return value as Record<string, unknown>
}

/** Independent acceptance table: do not derive expected names/scopes from the implementation. */
export function assertCurrentToolDiscovery(
  tools: readonly DiscoveredTool[],
): void {
  assert.deepEqual(
    tools.map((tool) => tool.name).sort((a, b) => a.localeCompare(b)),
    expected.map(([name]) => name).sort((a, b) => a.localeCompare(b)),
  )
  for (const tool of tools) {
    const entry = expected.find(([name]) => name === tool.name)
    assert(entry)
    const [, scopes, mutates, appVisible] = entry
    assert.equal(tool.inputSchema.type, "object")
    assert.equal(tool.inputSchema.additionalProperties, false)
    assert.equal(
      record(record(tool.inputSchema.properties).contractVersion).const,
      "0.1.0",
    )
    assert(tool.outputSchema)
    const alternatives = tool.outputSchema.anyOf
    assert(Array.isArray(alternatives))
    assert.equal(alternatives.length, 2)
    assert.deepEqual(
      alternatives
        .map((alternative: unknown) => {
          const branch = record(alternative)
          assert.equal(branch.type, "object")
          assert.equal(branch.additionalProperties, false)
          const properties = record(branch.properties)
          assert.equal(record(properties.contractVersion).const, "0.1.0")

          const success = record(properties.ok).const
          assert.equal(typeof success, "boolean")
          assert(typeof success === "boolean")

          return success
        })
        .sort((a, b) => Number(a) - Number(b)),
      [false, true],
    )
    assert.deepEqual(tool.annotations, {
      readOnlyHint: !mutates,
      destructiveHint: tool.name === "delete_package_draft",
      idempotentHint: tool.name !== "update_game_title",
      openWorldHint: false,
    })
    const metadata = record(tool._meta)
    assert.deepEqual(metadata.securitySchemes, [{ type: "oauth2", scopes }])
    const ui = record(metadata.ui)
    assert.deepEqual(ui.visibility, appVisible ? ["model", "app"] : ["model"])
    assert.equal(ui.resourceUri, undefined)
  }
}
