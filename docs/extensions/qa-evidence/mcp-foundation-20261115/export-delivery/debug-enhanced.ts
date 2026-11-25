import { normalizeDraft } from "./local-overlay-02/extensions/src/mcp-app/server/authoring.ts"
import { createExportBody } from "./local-overlay-02/extensions/src/mcp-app/first-party/oauth-export.ts"
import { show, policy } from "./local-overlay-02/extensions/src/mcp-app/tests/first-party/fixtures.ts"
import { authoredShowToNativeBundleDraft } from "@razzia/extensions/core"
const draft = { ...normalizeDraft(JSON.stringify(show()), policy), draftId: "a".repeat(32), revision: 1 }
try {
  console.log(JSON.stringify({ bodyBytes: Buffer.byteLength(createExportBody(draft, "enhanced-bundle")) }))
} catch (error) {
  console.log(JSON.stringify({ name: error.name, message: error.message }))
  const converted = authoredShowToNativeBundleDraft(JSON.parse(draft.authoredShowJson))
  const missing: string[] = []
  function walk(value: unknown, path: string) {
    if (value === undefined) { missing.push(path); return }
    if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) walk(child, path + "/" + key)
  }
  walk(converted.bundleDraft, "")
  console.log(JSON.stringify({ converted: converted.ok, undefinedPaths: missing.slice(0, 12) }))
}
