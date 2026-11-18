import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { readProductionFullShowArtifacts } from "../../src/mcp-app/native-host/production-artifacts.ts"
import { getNativeShowLibrary } from "../../src/core/show-library/native-library.ts"
import { preparePreviewUiResource } from "../../src/mcp-app/server/preview-resource.ts"
import type { VerifiedPrincipal } from "../../src/mcp-app/server/dependencies.ts"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const principal: VerifiedPrincipal = {
  issuer: "https://tadazz.com/oauth",
  audience: "https://tadazz.com/mcp",
  subject: "fixture",
  clientId: "fixture",
  grantId: "fixture",
  accountId: "3ec5b78a-8d68-4568-962d-64ac39d703d2",
  scopes: ["tadazz.drafts.read"],
  expiresAt: Date.now() + 600000,
  active: true,
  accountsEnabled: true,
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tadazz-widget-pins-")))
  const artifactDirectory = join(root, "mcp")
  const publicDirectory = join(root, "web")
  mkdirSync(artifactDirectory)
  mkdirSync(publicDirectory)
  const html = "<!doctype html><html><body>Static fixture</body></html>"
  const asset = "owner-approved-bundled-asset"
  const source = [
    {
      path: "extensions/src/mcp-app/widget/full-show-entry.tsx",
      sha256: hash("source"),
      bytes: 6,
    },
  ]
  const manifest = {
    resourceUri: "ui://tadazz/full-show/v3.html",
    mimeType: "text/html;profile=mcp-app",
    rendererBuildId: hash(JSON.stringify(source)),
    sha256: hash(html),
    bytes: Buffer.byteLength(html),
    origin: "https://tadazz.com",
    csp: {
      connectDomains: ["https://tadazz.com"],
      resourceDomains: ["https://tadazz.com"],
      frameDomains: [],
      baseUriDomains: ["https://tadazz.com"],
    },
    physicalSources: source,
    publicAssets: [
      {
        path: "packages/web/public/logo.svg",
        sha256: hash(asset),
        bytes: Buffer.byteLength(asset),
      },
    ],
    acceptance: "requires-native-browser-and-host-qualification",
  }
  const manifestPath = join(artifactDirectory, "full-show-artifact.json")
  const htmlPath = join(artifactDirectory, "full-show.html")
  const assetPath = join(publicDirectory, "logo.svg")
  writeFileSync(htmlPath, html)
  writeFileSync(assetPath, asset)
  const seal = () => {
    const text = JSON.stringify(manifest)
    writeFileSync(manifestPath, text)

    return {
      artifactDirectory,
      publicDirectory,
      origin: manifest.origin,
      manifestSha256: hash(text),
    }
  }

  return {
    root,
    manifest,
    manifestPath,
    htmlPath,
    assetPath,
    html,
    seal,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
test("a compiler-pinned artifact admits only qualified bundled preview", async (t) => {
  const f = fixture()
  t.after(f.cleanup)
  const result = readProductionFullShowArtifacts(f.seal())
  assert.equal(result.resource.canServe(), true)
  assert.equal(preparePreviewUiResource(result.resource).read(), f.html)
  const [family] = getNativeShowLibrary().families
  assert(family)
  await result.assertAssets(principal, family.ref, [])
  assert.throws(() =>
    result.assertAssets(principal, family.ref, [
      "https://untrusted.example/asset",
    ]),
  )
  assert.throws(() =>
    result.assertAssets(principal, { id: "unknown", version: "1.0.0" }, []),
  )
})
test("rewriting manifest and HTML cannot bypass the compiled manifest pin", (t) => {
  const f = fixture()
  t.after(f.cleanup)
  const options = f.seal()
  const replacement = "<html>replaced executable</html>"
  f.manifest.sha256 = hash(replacement)
  f.manifest.bytes = Buffer.byteLength(replacement)
  writeFileSync(f.htmlPath, replacement)
  f.seal()
  assert.throws(
    () => readProductionFullShowArtifacts(options),
    /artifact rejected/u,
  )
})
test("changed HTML or public bytes fail before preview startup", (t) => {
  for (const changed of ["html", "asset"]) {
    const f = fixture()
    t.after(f.cleanup)
    const options = f.seal()
    writeFileSync(changed === "html" ? f.htmlPath : f.assetPath, "tampered")
    assert.throws(
      () => readProductionFullShowArtifacts(options),
      /artifact rejected/u,
    )
  }
})
test("post-start asset replacement closes resource and render permission", (t) => {
  const f = fixture()
  t.after(f.cleanup)
  const result = readProductionFullShowArtifacts(f.seal())
  writeFileSync(f.assetPath, "replacement")
  assert.equal(result.resource.canServe(), false)
  assert.throws(() => preparePreviewUiResource(result.resource).read())
  const [family] = getNativeShowLibrary().families
  assert(family)
  assert.throws(() => result.assertAssets(principal, family.ref, []))
})
test("even pinned manifests reject wildcard CSP and path traversal", (t) => {
  const f = fixture()
  t.after(f.cleanup)
  f.manifest.csp.resourceDomains = ["https://*.example"]
  assert.throws(
    () => readProductionFullShowArtifacts(f.seal()),
    /artifact rejected/u,
  )
  f.manifest.csp.resourceDomains = ["https://tadazz.com"]
  f.manifest.publicAssets[0].path = "packages/web/public/../private/key"
  assert.throws(
    () => readProductionFullShowArtifacts(f.seal()),
    /artifact rejected/u,
  )
})
test("expired principals cannot exercise bundled asset permission", (t) => {
  const f = fixture()
  t.after(f.cleanup)
  const result = readProductionFullShowArtifacts(f.seal())
  const [family] = getNativeShowLibrary().families
  assert(family)
  assert.throws(() =>
    result.assertAssets(
      { ...principal, expiresAt: Date.now() - 1 },
      family.ref,
      [],
    ),
  )
})
test(
  "symlink assets are rejected before reading their target",
  { skip: process.platform === "win32" },
  (t) => {
    const f = fixture()
    t.after(f.cleanup)
    const options = f.seal()
    rmSync(f.assetPath)
    symlinkSync(f.htmlPath, f.assetPath)
    assert.throws(
      () => readProductionFullShowArtifacts(options),
      /artifact rejected/u,
    )
  },
)
