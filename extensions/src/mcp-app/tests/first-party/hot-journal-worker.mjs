import { DatabaseSync } from "node:sqlite"
import { basename, dirname, resolve, sep } from "node:path"
import { tmpdir } from "node:os"

const file = resolve(process.argv[2] ?? "")
if (
  basename(file) !== "drafts.sqlite" ||
  basename(dirname(file)) !== "mcp-first-party" ||
  !file.startsWith(resolve(tmpdir()) + sep + "tadazz-m3a-synthetic-")
)
  throw new Error("Synthetic temporary fixture path required")
const db = new DatabaseSync(file)
db.exec(
  "PRAGMA cache_size=1; PRAGMA synchronous=FULL; BEGIN IMMEDIATE; UPDATE drafts SET authored=printf('%0500000d',1)",
)
// Parent kills this process without close/rollback, producing a real hot journal.
process.stdout.write("READY\n")
setInterval(() => {}, 1000)
