import assert from "node:assert/strict"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
const root = new URL("../../../", import.meta.url)
const evidence = new URL(
  "docs/extensions/qa-evidence/mcp-widget-20261115/",
  root,
)
const dist = new URL("extensions/src/mcp-app/widget/dist/", root)
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
const html = await readFile(new URL("widget.html", dist))
const artifact = JSON.parse(
  await readFile(new URL("widget-artifact.json", dist), "utf8"),
)
assert.equal(sha(html), artifact.sha256)
assert.ok(!html.includes(Buffer.from("/qa/input-v2")))
assert.ok(!html.includes(Buffer.from("__host")))
const responseBytes = Buffer.byteLength(
  JSON.stringify({
    contents: [
      {
        uri: artifact.resourceUri,
        mimeType: artifact.mimeType,
        text: html.toString(),
        _meta: {
          ui: {
            csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
          },
        },
      },
    ],
  }),
)
assert.ok(responseBytes < 4 * 1024 * 1024)
const receipts = []
for (const name of ["entry", "fixture-entry", "host-entry"]) {
  const path = new URL(`${name}-inputs.json`, dist)
  const bytes = await readFile(path)
  const receipt = JSON.parse(bytes)
  for (const file of receipt.files) {
    assert.ok(
      !file.path.startsWith("../") || file.path.includes("/node_modules/"),
      `Foreign product source: ${file.path}`,
    )
    assert.equal(
      sha(await readFile(new URL(file.path, root))),
      file.sha256,
      `Changed source: ${file.path}`,
    )
  }
  await writeFile(new URL(`${name}-inputs.json`, evidence), bytes)
  receipts.push({ name, files: receipt.files.length, sha256: sha(bytes) })
}
const sources = []
for (const dir of [
  "extensions/src/mcp-app/widget/",
  "extensions/qa/mcp-widget/",
]) {
  for (const file of await readdir(new URL(dir, root), {
    withFileTypes: true,
  })) {
    if (!file.isFile()) {
      continue
    }

    const path = dir + file.name,
      bytes = await readFile(new URL(path, root))
    sources.push({ path, bytes: bytes.length, sha256: sha(bytes) })
  }
}
const dependencies = []
for (const path of [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "extensions/package.json",
  "packages/web/package.json",
  "extensions/src/mcp-app/package.json",
  "extensions/src/mcp-app/pnpm-lock.yaml",
]) {
  dependencies.push({ path, sha256: sha(await readFile(new URL(path, root))) })
}
const require = createRequire(new URL("extensions/package.json", root))
const { webkit } = require("@playwright/test")
const peer = execFileSync(
  "git",
  [
    "show",
    "b49e847e79fa01ba45fb9b0b5551b77433a03205:extensions/src/mcp-app/client/preview-candidate-v2.ts",
  ],
  { cwd: fileURLToPath(root) },
)
assert.equal(
  sha(peer),
  sha(
    await readFile(
      new URL("extensions/src/mcp-app/client/preview-candidate-v2.ts", root),
    ),
  ),
)
const result = {
  utc: new Date().toISOString(),
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fileURLToPath(root),
    encoding: "utf8",
  }).trim(),
  sourceState:
    "owned source hashes below are authoritative, including local WIP before its source commit",
  artifact,
  serializedResourceResponseBytes: responseBytes,
  receipts,
  sources,
  dependencies,
  peerConsumerSha256: sha(peer),
  installedSdk: JSON.parse(
    await readFile(
      new URL(
        "extensions/src/mcp-app/node_modules/@modelcontextprotocol/ext-apps/package.json",
        root,
      ),
      "utf8",
    ),
  ).version,
  webkit: {
    executablePresent: existsSync(webkit.executablePath()),
    test: "NOT_RUN; no installation/download",
  },
  oracle:
    "NOT_USED; allocated existing 6MiB server pool remains unconsumed; no compute claim/service/deployment",
  retainedProducerResult: {
    pin: "7f0d4d89e0f77be49c6543411937d977212f132f",
    sha256: sha(
      execFileSync(
        "git",
        [
          "show",
          "7f0d4d89e0f77be49c6543411937d977212f132f:docs/extensions/qa-evidence/mcp-foundation-20261115/preview-candidate/candidate-07/tool-results.json",
        ],
        { cwd: fileURLToPath(root) },
      ),
    ),
    status:
      "REUSED exact result object; widget SDK/browser assertions executed anew",
  },
}
await writeFile(
  new URL("PACKET.json", evidence),
  JSON.stringify(result, null, 2),
)
console.log(
  JSON.stringify({
    resourceBytes: html.length,
    serializedResourceResponseBytes: responseBytes,
    receipts,
    ownedSourceFiles: sources.length,
    webkit: result.webkit,
  }),
)
