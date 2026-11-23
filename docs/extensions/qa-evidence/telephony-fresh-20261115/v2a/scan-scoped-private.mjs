import { readdirSync, readFileSync, writeFileSync, statfsSync } from "node:fs"
import { join } from "node:path"
const fixture = process.env.PHONE_V2A_FIXTURES,
  evidence = process.env.PHONE_V2A_EVIDENCE
if (
  !fixture?.startsWith("/fixtures/phone-v2a-") ||
  !evidence?.startsWith("/evidence/phone-v2a-")
)
  throw Error("Private fixture paths required")
const walk = (root) =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(root, entry.name))
      : entry.isFile()
        ? [join(root, entry.name)]
        : [],
  )
const privateFiles = walk(fixture),
  publicFiles = walk(evidence)
const journals = privateFiles.filter((p) => p.endsWith(".synthetic-journal"))
const capabilities = journals.map(
  (path) => JSON.parse(readFileSync(path, "utf8")).request.capability,
)
if (
  capabilities.some((c) => typeof c !== "string" || !/^[0-9a-f]{64}$/u.test(c))
)
  throw Error("Invalid restored private journal")
const databaseFiles = privateFiles.filter((p) =>
  /phone-lifecycle-v2a\.sqlite(?:-wal|-shm)?$/u.test(p),
)
for (const path of [...publicFiles, ...databaseFiles]) {
  const bytes = readFileSync(path)
  if (capabilities.some((cap) => bytes.includes(Buffer.from(cap))))
    throw Error("Raw private capability found outside private fixture custody")
}
writeFileSync(
  join(evidence, "private-capability-scan.json"),
  JSON.stringify(
    {
      status: "NO_RAW_CAPABILITIES_IN_PUBLIC_EVIDENCE_OR_SERVER_DB",
      private_journals: journals.length,
      capabilities_checked: capabilities.length,
      evidence_files: publicFiles.length,
      database_files: databaseFiles.length,
      fixture_filesystem_type: statfsSync(fixture).type,
      expected_tmpfs_type: 16914836,
      real_gateway_or_auth_proof: false,
    },
    null,
    2,
  ) + "\n",
)
