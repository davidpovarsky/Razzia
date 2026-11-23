import { readFileSync } from "node:fs"
import { writeScopedPrecommit } from "./scoped-journal-fixture"
import {
  validateContext,
  type VerifiedServiceContext,
} from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"
import type { ExpectedAttempt } from "./scoped-journal-fixture"

if (process.env.PHONE_V2A_SCOPED_GRANTED !== "fixture-only")
  throw new Error("Fixture grant required")
const input = JSON.parse(
  readFileSync(process.env.PHONE_SCOPED_WRITER_INPUT!, "utf8"),
) as {
  root: string
  context: VerifiedServiceContext
  attempt: ExpectedAttempt
}
// The parent validated this private fixture input against its actual Game before
// forking. This child validates shape/expiry; it is not an auth service.
validateContext(input.context, "register")
writeScopedPrecommit(
  input.root,
  input.context,
  input.attempt,
  (candidate) => candidate === input.context,
)
process.send?.({ committed: true, fileAndDirectoryFsynced: true }, () =>
  process.disconnect?.(),
)
