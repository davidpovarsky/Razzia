// Offline analysis only: reads the four immutable retained QA receipts.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"

const directory = path.dirname(fileURLToPath(import.meta.url))
const expected = {
  "process-focused-quiz-base-write.json": "dce3c8bf41233cd4e6749d4e071657e6656c4537639427c80956b9a6ac9ad9c0",
  "process-focused-quiz-sidecar-write.json": "efb2d63daf0bc162acb88e85bbcc56867ebfdfd7aa551ae9d1820de3f7c16ad3",
  "process-full-quiz-base-write.json": "9f3bd2278c70d666741ea5a052699606c03f21e7fba503d3e896945ddfa231b2",
  "process-full-quiz-sidecar-write.json": "d564206d3fe66ef052744fca6b0a7816d953af73bb22ac73e202bb6321af3e2b",
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const analyses = Object.entries(expected).map(([name, sourceSha256]) => {
  const bytes = fs.readFileSync(path.join(directory, name))
  if (hash(bytes) !== sourceSha256) throw new Error(`Retained receipt hash mismatch: ${name}`)
  const receipt = JSON.parse(bytes.toString("utf8"))
  const before = receipt.before
  const after = receipt.recovery1.state
  const original = before.shows["show-a"]
  const recovered = after.shows["show-a"]
  const compact = JSON.stringify(original.base)
  const pretty = JSON.stringify(original.base, null, 2)
  const checks = {
    originalReceiptStillFail: receipt.state === "FAIL",
    killedBySigkill: receipt.interrupted.signal === "SIGKILL",
    distinctInterruptedAndRecoveryPid: receipt.interrupted.pid !== receipt.recovery1Process.pid,
    firstRecoverySucceeded: receipt.recovery1Process.code === 0 && receipt.recovery1.report.unresolvedCount === 0,
    fullDecodedTargetBaseStrictEqual: isDeepStrictEqual(original.base, recovered.base),
    decodedTargetBaseInsertionOrderAlsoEqual: JSON.stringify(original.base) === JSON.stringify(recovered.base),
    beforeHashExactlyCompactSerialization: hash(compact) === original.baseSha256,
    afterHashExactlyPrettyTwoSpaceSerialization: hash(pretty) === recovered.baseSha256,
    targetBaseRawBytesChanged: original.baseSha256 !== recovered.baseSha256,
    fullDecodedV2ExtrasStrictEqual: isDeepStrictEqual(original.extras, recovered.extras),
    targetSidecarRawHashUnchanged: original.sidecarSha256 === recovered.sidecarSha256,
    showBIncludingRawHashesUnchanged: isDeepStrictEqual(before.shows["show-b"], after.shows["show-b"]),
    unrelatedShowIncludingRawHashesUnchanged: isDeepStrictEqual(before.shows.unrelated, after.shows.unrelated),
    targetMediaRawHashUnchanged: before.mediaSha256 === after.mediaSha256,
    unrelatedMediaRawHashUnchanged: before.unrelatedMediaSha256 === after.unrelatedMediaSha256,
    journalsClearedAfterFirstRecovery: after.journals.length === 0,
    secondReplayWasNotReached: !Object.hasOwn(receipt, "recovery2"),
  }
  if (Object.values(checks).some((value) => value !== true)) throw new Error(`Diagnosis failed: ${name}: ${JSON.stringify(checks)}`)
  return {
    name, sourceSha256, checks,
    boundary: receipt.boundary,
    pids: { interrupted: receipt.interrupted.pid, firstRecovery: receipt.recovery1Process.pid },
    targetBase: {
      beforeSha256: original.baseSha256, afterSha256: recovered.baseSha256,
      compactBytes: Buffer.byteLength(compact), prettyBytes: Buffer.byteLength(pretty),
      compactNewlines: compact.split("\n").length - 1, prettyNewlines: pretty.split("\n").length - 1,
      completeTopLevelKeys: Object.keys(original.base),
    },
    completeV2TopLevelKeys: Object.keys(original.extras),
  }
})
process.stdout.write(JSON.stringify({
  kind: "offline-receipt-analysis-no-test-execution",
  reviewedCommit: "e58350423727ba1c5aadf4164a2b09ee25745839",
  sourceRoot: "/home/ubuntu/tadazz-hq-qa-20261115/evidence/recovery-required-e58350423727ba1c5aadf4164a2b09ee25745839/",
  result: "All four retained V2 failures are exactly compact-to-two-space JSON serialization changes of the target base; complete decoded base and V2 sidecar data are equal. Second replay remains untested in these receipts.",
  analyses,
}, null, 2) + "\n")
