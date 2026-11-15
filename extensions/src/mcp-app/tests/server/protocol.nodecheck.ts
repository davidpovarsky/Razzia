import assert from "node:assert/strict"
import test from "node:test"
import { harness } from "./fixtures.ts"

test("real SDK initialize/discovery, strict schemas and three static resources", async () => {
  const h = await harness()
  try {
    const listing = await h.client.listTools()
    assert.equal(listing.tools.length, 8)
    const linked = listing.tools.filter(
      (tool) =>
        tool._meta?.ui &&
        typeof tool._meta.ui === "object" &&
        "resourceUri" in tool._meta.ui,
    )
    assert.deepEqual(
      linked.map((tool) => tool.name),
      ["preview_game"],
    )
    for (const tool of listing.tools) {
      assert.equal(tool.inputSchema.additionalProperties, false)
      assert.ok(tool.outputSchema)
      assert.ok(tool._meta?.securitySchemes)
    }
    const resources = await h.client.listResources()
    assert.equal(resources.resources.length, 3)
    const resource = await h.client.readResource({
      uri: "ui://tadazz/quiz-preview/v1.html",
    })
    assert.equal(resource.contents[0]?.mimeType, "text/html;profile=mcp-app")
    assert.equal(JSON.stringify(resource).includes(h.account.accountId), false)
  } finally {
    await h.close()
  }
})
