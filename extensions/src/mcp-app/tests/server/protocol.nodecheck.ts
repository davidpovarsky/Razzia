import assert from "node:assert/strict"
import test from "node:test"
import { harness } from "./fixtures.ts"
import { assertCurrentToolDiscovery } from "./discovery-fixture.ts"

test("real SDK discovery keeps UI absent without an actual reviewed artifact", async () => {
  const h = await harness()

  try {
    const listing = await h.client.listTools()
    assertCurrentToolDiscovery(listing.tools)
    const linked = listing.tools.filter(
      (tool) =>
        tool._meta?.ui &&
        typeof tool._meta.ui === "object" &&
        "resourceUri" in tool._meta.ui,
    )
    assert.deepEqual(
      linked.map((tool) => tool.name),
      [],
    )
    for (const tool of listing.tools) {
      assert.equal(tool.inputSchema.additionalProperties, false)
      assert.ok(tool.outputSchema)
      assert.ok(tool._meta?.securitySchemes)
    }
    const resources = await h.client.listResources()
    assert.equal(resources.resources.length, 2)
    await assert.rejects(
      h.client.readResource({ uri: "ui://tadazz/quiz-preview/v1.html" }),
    )
  } finally {
    await h.close()
  }
})
