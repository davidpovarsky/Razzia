import fs from "node:fs"
import path from "node:path"
import * as native from "../../../../packages/socket/src/services/config"
import { recoverStartupJournals } from "../media-library"
import { assertNativeFixture } from "./native-binding-fixture"
import { reviewBindingState } from "./review-binding-state"

const [root, token, sequence, mode] = process.argv.slice(2)
assertNativeFixture(root, token)
if (
  native.getPath() !== root ||
  process.env.TADAZZ_ACCOUNTS_ENABLED !== "false" ||
  !["1", "2"].includes(sequence)
)
  throw new Error("Unexpected review fixture scope")
let writes = 0
let deletes = 0
let report: unknown
let error: string | undefined
try {
  report = recoverStartupJournals(
    mode === "default"
      ? native.getPath
      : {
          getPath: native.getPath,
          updateQuizz: (id, data) => {
            writes++
            native.updateQuizz(id, data)
          },
          deleteQuizz: (id) => {
            deletes++
            native.deleteQuizz(id)
          },
        },
  )
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught)
  process.exitCode = 2
}
fs.writeFileSync(
  path.join(root, `.review-recovery-${sequence}.json`),
  JSON.stringify({
    pid: process.pid,
    writes,
    deletes,
    report,
    error,
    state: reviewBindingState(root),
  }),
)
