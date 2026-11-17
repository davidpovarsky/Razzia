import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const evidence = resolve(
  root,
  "docs/extensions/plans/phase3-takeover-20261117/native-host-evidence",
  randomUUID(),
)
mkdirSync(evidence, { recursive: true })
const files = [
  "extensions/src/mcp-app/native-host/static-site.ts",
  "extensions/src/site/oauth-consent-headers.ts",
  "extensions/qa/phase3-native-host-static/static-site.node.mjs",
  "extensions/qa/phase3-native-host-static/endpoint-preflight.mjs",
  "extensions/qa/phase3-native-host-static/endpoint-preflight.node.mjs",
  "extensions/qa/phase3-native-host-static/verify.mjs",
  "extensions/src/core/card-media-references.ts",
  "extensions/src/server/storage/service.ts",
  "extensions/qa/phase3-recovery/workspace-typescript.mjs",
  "extensions/qa/phase3-recovery/recovery-invariants.node.ts",
]
const hashes = () =>
  Object.fromEntries(
    files.map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(resolve(root, file)))
        .digest("hex"),
    ]),
  )
const before = hashes()
function run(label, executable, argumentsOrOptions) {
  const { args, cwd = root } = Array.isArray(argumentsOrOptions)
    ? { args: argumentsOrOptions }
    : argumentsOrOptions
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    timeout: 55000,
    maxBuffer: 4 * 1024 * 1024,
  })
  writeFileSync(
    resolve(evidence, `${label}.log`),
    `${result.stdout ?? ""}${result.stderr ?? ""}`,
    { flag: "wx" },
  )

  return {
    label,
    executable,
    args,
    cwd,
    exit: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
  }
}
const head = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
})
const results = [
  run("focused-tests", process.execPath, [
    "--experimental-strip-types",
    "--test",
    "extensions/qa/phase3-native-host-static/static-site.node.mjs",
    "extensions/qa/phase3-native-host-static/endpoint-preflight.node.mjs",
  ]),
  run("recovery-real-invariants", process.execPath, [
    "--import",
    "./extensions/qa/phase3-recovery/workspace-typescript.mjs",
    "--test",
    "extensions/qa/phase3-recovery/recovery-invariants.node.ts",
  ]),
  run("recovery-caller-regressions", process.execPath, {
    args: [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--configLoader",
      "native",
      "--maxWorkers=1",
      "--no-file-parallelism",
      "src/core/soundtrack-media-references.test.ts",
      "src/core/show-themes/roundtrip.test.ts",
      "src/core/card-appearance.test.ts",
      "src/server/storage.test.ts",
      "src/server/storage/journal-recovery.test.ts",
    ],
    cwd: resolve(root, "extensions"),
  }),
  run("static-types", process.execPath, [
    "extensions/node_modules/typescript/bin/tsc",
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--allowImportingTsExtensions",
    "--types",
    "node",
    "--typeRoots",
    "packages/socket/node_modules/@types",
    "extensions/src/mcp-app/native-host/static-site.ts",
  ]),
  run("focused-lint", process.execPath, [
    "node_modules/oxlint/bin/oxlint",
    "extensions/src/mcp-app/native-host/static-site.ts",
    "extensions/qa/phase3-native-host-static",
    "extensions/qa/phase3-recovery/workspace-typescript.mjs",
    "extensions/src/core/card-media-references.ts",
    "extensions/src/server/storage/service.ts",
  ]),
  run("configured-format", process.execPath, [
    "node_modules/prettier/bin/prettier.cjs",
    "--check",
    "extensions/src/mcp-app/native-host/static-site.ts",
    "extensions/qa/phase3-native-host-static",
    "extensions/qa/phase3-recovery/workspace-typescript.mjs",
  ]),
]
// Pnpm is unavailable here. These are the four actual ui:check constituents,
// executed independently to retain every result instead of stopping at failure.
for (const [label, args] of [
  ["ui-design", ["extensions/qa/tds-design-check.mjs"]],
  ["ui-tokens", ["extensions/qa/tds-token-registry.mjs", "--check"]],
  ["ui-catalog", ["extensions/qa/tds-catalog-check.mjs"]],
  ["ui-freeze", ["extensions/qa/tds-boundary.mjs"]],
]) {
  results.push(
    run(label, process.execPath, ["--experimental-strip-types", ...args]),
  )
}
results.push(
  run("protected-delta", "git", [
    "diff",
    "--exit-code",
    "34cfd464ac0bba432701b87f10f4f8388d665066",
    "--",
    "packages",
    "extensions/src/editor",
  ]),
)
results.push(run("whitespace", "git", ["diff", "--check"]))
const after = hashes()
const receipt = {
  createdAtUtc: new Date().toISOString(),
  runtime: {
    node: process.version,
    executable: process.execPath,
    platform: process.platform,
  },
  head: head.status === 0 ? head.stdout.trim() : null,
  sourceState: "UNCOMMITTED_WORKTREE_BYTES_NOT_A_NEW_IMMUTABLE_SHA",
  sourceHashesBefore: before,
  sourceHashesAfter: after,
  sourceUnchangedDuringChecks: JSON.stringify(before) === JSON.stringify(after),
  results,
  scopedTestExpectation:
    "16 dependency-free tests; synthetic responses, no authenticated host installation",
  releaseDecision: "NOT_READY",
  ext4Recovery: "NOT_RUN",
  independentCombinedSecurityReview: "NOT_RUN",
  productionDeployment: "NOT_RUN",
  realChatGptConnection: "NOT_RUN",
}
writeFileSync(
  resolve(evidence, "receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
  { flag: "wx" },
)
console.log(
  JSON.stringify(
    {
      evidence,
      sourceUnchangedDuringChecks: receipt.sourceUnchangedDuringChecks,
      results,
    },
    null,
    2,
  ),
)
process.exitCode =
  results.some((item) => item.exit !== 0) ||
  !receipt.sourceUnchangedDuringChecks
    ? 1
    : 0
