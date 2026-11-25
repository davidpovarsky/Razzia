import fs from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
const base = "96767de6d40b594324687e15b0f386b87dd7ef19"
const file = "packages/socket/src/services/config.ts"
const before = execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8" })
const after = fs.readFileSync(file, "utf8")
const begin = after.indexOf("/** C1 allocation only.")
const end = after.indexOf("export const saveQuizz", begin)
if (begin < 0 || end < 0) throw new Error("Missing exact additive preparer")
const original = (after.slice(0, begin) + after.slice(end)).replace('import { accountsEnabled, activeAccount } from "./account-scope"\n', "")
if (original !== before) throw new Error("Existing config/CRUD changed outside approved addition")
const fields = execFileSync("git", ["diff", base, "--numstat", "--", file], { encoding: "utf8" }).trim().split(/\s+/)
if (Number(fields[0]) > 30 || Number(fields[1]) !== 0) throw new Error("Protected preparer ceiling exceeded")
const protectedChanges = execFileSync("git", ["diff", base, "--name-only", "--", "packages"], { encoding: "utf8" }).trim().split("\n")
if (protectedChanges.length !== 1 || protectedChanges[0] !== file) throw new Error("Unleased protected changes")
const paths = [file,"extensions/src/server/storage/durable-files.ts","extensions/src/server/storage/durable-files.test.ts","extensions/src/server/storage/creation-scope.ts","extensions/src/server/storage/creation-scope.test.ts"]
const result = {
  baseCommit: base, protectedPreparerAddedLines: Number(fields[0]), protectedRemovedLines: 0,
  existingConfigCrudByteIdentical: true, apiAndStartupHooksUnchanged: true,
  publicationOrServiceWiringImplemented: false, runtimeTestsExecuted: false,
  preparedLinuxTests: 9, typecheckExecuted: false,
  files: paths.map((path) => { const bytes = fs.readFileSync(path);return {path,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")} }),
  pendingBoundary: "Null-sidecar exclusion against another writer between absence check and base hard link; manager must qualify cooperating-writer scope or extend actual shared-writer hooks",
}
console.log(JSON.stringify(result,null,2))
