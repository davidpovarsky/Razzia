// Own-source archive and immutable foreign dependency hashes. Never writes F files
// or copies its DTO implementations into E's product tree.
import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
const producer = "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-mcp-20261115"
const commit = "5cba04f399d10c597f4cd6dc1cbfbb2b77041d58"
const paths = ["extensions/src/mcp-app/contracts/native-save.ts", "extensions/src/mcp-app/contracts/schemas.ts"]
const inputs = paths.map(path => {
  const canonical = execFileSync("git", ["-C", producer, "show", `${commit}:${path}`])
  const bytes = readFileSync(`${producer}/${path}`)
  if (!canonical.equals(bytes)) throw new Error(`Foreign source changed: ${path}`)
  return { path, producerPath: `${producer}/${path}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }
})
writeFileSync("docs/extensions/qa-evidence/show-ui-20261115/native-save22-foreign-inputs.json", JSON.stringify({ producerCommit: commit, inputs, meaning: "F's unchanged committed pure DTO files, only read-only canonical-path aliases in isolated QA; no F product file authored/copied into E repository." }, null, 2))
