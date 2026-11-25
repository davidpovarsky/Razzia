import assert from "node:assert/strict"
import { test } from "node:test"
import { sha256Hex } from "../../src/core/digest.ts"
import {
  preparePreviewUiResource,
  type PreviewUiResource,
} from "../../src/mcp-app/server/preview-resource.ts"
const html =
  '<!doctype html><html><head><base href="https://tadazz.com/"></head><body><main></main></body></html>'
const resource = (): PreviewUiResource => ({
  html,
  sha256: sha256Hex(html),
  csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
  canServe: () => true,
})
test("legacy resource keeps its exact three-field CSP; standard base is explicit and optional", () => {
  const input = resource()
  const old = preparePreviewUiResource(input)
  assert.deepEqual(Object.keys(old.csp).sort(), [
    "connectDomains",
    "frameDomains",
    "resourceDomains",
  ])
  assert.equal(old.read(), html)
  input.csp.baseUriDomains = ["https://tadazz.com"]
  input.csp.resourceDomains = ["https://tadazz.com"]
  const next = preparePreviewUiResource(input)
  assert.deepEqual(next.csp.baseUriDomains, ["https://tadazz.com"])
  assert.equal(next.read(), html)
  assert.equal(next.csp.connectDomains.length, 0)
})
test("all resource CSP lists reject wildcard, credential, non-HTTPS and non-origin entries", () => {
  for (const field of [
    "connectDomains",
    "resourceDomains",
    "frameDomains",
    "baseUriDomains",
  ] as const) {
    for (const origin of [
      "https://*.example.invalid",
      "https://bad*.invalid",
      "*",
      "http://tadazz.com",
      "https://u:p@tadazz.com",
      "https://tadazz.com/",
      "https://tadazz.com/path",
      "https://tadazz.com?key=a",
      "https://tadazz.com#f",
      "data:text/html,test",
      // oxlint-disable-next-line no-script-url -- A hostile CSP entry must be rejected, never executed.
      "javascript:alert(1)",
    ]) {
      const input = resource()
      input.csp[field] = [origin]
      assert.throws(() => preparePreviewUiResource(input))
    }
  }
})
test("base descriptor mutation and host permission revocation deny reads without private details", () => {
  const input = resource()
  input.csp.baseUriDomains = ["https://tadazz.com"]
  const prepared = preparePreviewUiResource(input)
  prepared.csp.baseUriDomains?.push("https://other.invalid")
  assert.throws(() => prepared.read(), /PREVIEW_UNAVAILABLE/u)
  const toggled = resource()
  const active = { allowed: true }
  toggled.canServe = () => active.allowed
  const fresh = preparePreviewUiResource(toggled)
  active.allowed = false
  assert.throws(() => fresh.read(), /PREVIEW_UNAVAILABLE/u)
  toggled.canServe = () => 1 as unknown as boolean
  assert.throws(() => fresh.read(), /PREVIEW_UNAVAILABLE/u)
  toggled.canServe = () => {
    throw Error("PRIVATE_DENIAL_DETAIL")
  }
  assert.throws(
    () => fresh.read(),
    (error) =>
      String(error).includes("PREVIEW_UNAVAILABLE") &&
      !String(error).includes("PRIVATE_DENIAL_DETAIL"),
  )
})
