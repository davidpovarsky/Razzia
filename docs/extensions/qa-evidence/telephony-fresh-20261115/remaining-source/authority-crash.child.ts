import assert from "node:assert/strict"
import { closeSync, fsyncSync, openSync, writeSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { deriveServiceId } from "../../../../../extensions/src/server/phone-lifecycle-v2/auth/credential-codec"
import { authorityPath, owner, provision, room } from "./actual-auth-backend"

const action = process.env.PHONE_REMAINING_CRASH_ACTION
const edge = process.env.PHONE_REMAINING_CRASH_EDGE
assert.ok(action === "initialize" || action === "issue" || action === "rotate")
assert.ok(edge === "before" || edge === "after")
const output = resolve(process.env.PHONE_REMAINING_CRASH_OUTPUT ?? "/invalid")
assert.ok(output.startsWith(process.env.PHONE_REMAINING_FIXTURES! + "/"))
const r = await room(await owner())
let address = {
  owner: r.subject.user.id,
  game: r.game.gameId,
  provider: r.issue.provider,
  service: deriveServiceId(
    r.subject.user.id,
    r.game.gameId,
    r.issue.provider,
    r.issue.requestId,
  ),
  version: 1,
}
let prior: ReturnType<typeof r.reader.readCurrent>
if (action === "issue")
  await r.factory.initializeAuthority(r.subject.token, r.game.gameId)
if (action === "rotate") {
  const initial = await provision(r)
  address = initial.address
  prior = r.reader.readCurrent(address)
  assert.equal(prior?.state, "ACTIVE")
}
function crashAtObservedCommit() {
  const witness =
    JSON.stringify({
      action,
      edge,
      observed:
        edge === "after"
          ? "actual COMMIT returned"
          : "actual COMMIT about to enter",
      root: r.root,
      authority_file: authorityPath(r),
      address,
      prior,
      verified_account: true,
      actual_session: true,
      owning_native_game: true,
    }) + "\n"
  const fd = openSync(output, "wx", 0o600)
  try {
    writeSync(fd, witness)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  const directory = openSync(dirname(output), "r")
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
  process.kill(process.pid, "SIGKILL")
  throw new Error("Expected self SIGKILL did not terminate the owning process")
}
const original = DatabaseSync.prototype.exec
DatabaseSync.prototype.exec = function (this: DatabaseSync, sql: string) {
  if (sql === "COMMIT" && edge === "before") crashAtObservedCommit()
  const result = original.call(this, sql)
  if (sql === "COMMIT" && edge === "after") crashAtObservedCommit()
  return result
}
if (action === "initialize")
  await r.factory.initializeAuthority(r.subject.token, r.game.gameId)
else if (action === "issue") await r.factory.issue(r.subject.token, r.issue)
else
  await r.factory.rotate(
    r.subject.token,
    {
      game: address.game,
      provider: address.provider,
      service: address.service,
    },
    { requestId: "controlled-crash-rotation", expectedVersion: 1 },
  )
throw new Error(
  "Owning operation escaped the selected real commit crash window",
)
