import assert from "node:assert/strict"
import { after, test } from "node:test"
import { fork } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import type {
  ServiceAddress,
  ServiceLeaseRecord,
} from "../../../../../extensions/src/server/phone-lifecycle-v2/auth/contracts"
import { PrivateAuthorityFiles } from "../../../../../extensions/src/server/phone-lifecycle-v2/auth/private-authority-files"
import { ReadonlyServiceLeaseReader } from "../../../../../extensions/src/server/phone-lifecycle-v2/auth/authority-store"
import { close, privateRoot, record } from "./actual-auth-backend"

after(close)
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const files = (root: string) =>
  Object.fromEntries(
    readdirSync(root).map((name) => [
      name,
      hash(readFileSync(join(root, name))),
    ]),
  )
function oomKills() {
  const path = "/sys/fs/cgroup/memory.events"
  if (!existsSync(path)) return undefined
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((value) => value.startsWith("oom_kill "))
  return line ? Number(line.split(" ")[1]) : undefined
}
interface Witness {
  action: "initialize" | "issue" | "rotate"
  edge: "before" | "after"
  observed: string
  root: string
  authority_file: string
  address: ServiceAddress
  prior?: ServiceLeaseRecord
  verified_account: true
  actual_session: true
  owning_native_game: true
}
test(
  "R-CRASH-01 real authenticated initialize/issue/rotate SIGKILL preserves uncertainty and committed metadata",
  { timeout: 240000 },
  async (t) => {
    const childPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "authority-crash.child.ts",
    )
    const startOom = oomKills()
    for (const action of ["initialize", "issue", "rotate"] as const) {
      for (const edge of ["before", "after"] as const) {
        const controller = privateRoot(
          "crash-controller-" + action + "-" + edge,
        )
        const output = join(controller, "observed-commit.json")
        const child = fork(childPath, [], {
          env: {
            ...process.env,
            PHONE_REMAINING_CRASH_ACTION: action,
            PHONE_REMAINING_CRASH_EDGE: edge,
            PHONE_REMAINING_CRASH_OUTPUT: output,
          },
          execArgv: [...process.execArgv, "--max-old-space-size=384"],
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          cwd: "/work",
        })
        t.after(() => {
          if (child.exitCode === null && child.signalCode === null)
            child.kill("SIGKILL")
        })
        let transcript = ""
        for (const stream of [child.stdout, child.stderr])
          stream?.on("data", (bytes) => {
            transcript += bytes.toString()
            if (transcript.length > 131072) child.kill("SIGKILL")
          })
        const result = await new Promise<{
          code: number | null
          signal: NodeJS.Signals | null
        }>((done, reject) => {
          const timer = setTimeout(() => {
            child.kill("SIGKILL")
            reject(new Error("Crash child did not reach real commit window"))
          }, 40000)
          child.once("error", (error) => {
            clearTimeout(timer)
            reject(error)
          })
          child.once("exit", (code, signal) => {
            clearTimeout(timer)
            done({ code, signal })
          })
        })
        assert.equal(result.code, null)
        assert.equal(result.signal, "SIGKILL")
        assert.ok(
          existsSync(output),
          "Must prove the selected actual COMMIT edge before counting a kill",
        )
        assert.equal(
          /[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/u.test(
            transcript,
          ),
          false,
          "No JWT in child diagnostics",
        )
        writeFileSync(
          join(
            process.env.PHONE_REMAINING_EVIDENCE!,
            "crash-" + action + "-" + edge + ".log",
          ),
          transcript,
        )
        const witness = JSON.parse(readFileSync(output, "utf8")) as Witness
        assert.equal(witness.action, action)
        assert.equal(witness.edge, edge)
        assert.equal(witness.verified_account, true)
        assert.equal(witness.actual_session, true)
        assert.equal(witness.owning_native_game, true)
        assert.equal(
          existsSync(join(witness.root, "phone-service-authority.writer-lock")),
          true,
        )
        const before = files(witness.root)
        const reopened = new ReadonlyServiceLeaseReader(
          new PrivateAuthorityFiles(witness.root),
        )
        assert.throws(() => reopened.readCurrent(witness.address))
        assert.deepEqual(
          files(witness.root),
          before,
          "A read must not clear a crash marker or recover the database",
        )
        let metadataState: string | null = null
        if (edge === "after") {
          // Fixture-only read of a known completed COMMIT. The public reader above
          // remains denied; this is not a reconciliation/repair path.
          const db = new DatabaseSync(witness.authority_file, {
            readOnly: true,
            timeout: 1000,
          })
          try {
            assert.equal(
              (
                db
                  .prepare("SELECT count(*) AS n FROM authority_meta")
                  .get() as { n: number }
              ).n,
              1,
            )
            const rows = db.prepare("SELECT * FROM leases").all()
            if (action === "initialize") assert.equal(rows.length, 0)
            else {
              assert.equal(rows.length, 1)
              const row = rows[0]!
              assert.equal(row.state, "PENDING_DELIVERY")
              assert.equal(row.version, action === "rotate" ? 2 : 1)
              assert.match(row.capability_hash as string, /^[a-f0-9]{64}$/u)
              assert.equal("credential" in row, false)
              if (action === "rotate") {
                assert.notEqual(
                  row.capability_hash,
                  witness.prior!.capabilityHash,
                )
                assert.equal(row.issuer_sid, witness.prior!.issuerSid)
                assert.equal(row.executor_id, witness.prior!.executorId)
                assert.equal(row.expires_at, witness.prior!.expiresAt)
              }
              const controls = db
                .prepare("SELECT metadata FROM control_receipts WHERE action=?")
                .all(action)
              assert.equal(controls.length, 1)
              const metadata = JSON.parse(
                controls[0]!.metadata as string,
              ) as Record<string, unknown>
              assert.equal(
                Object.keys(metadata).some(
                  (key) =>
                    ![
                      "ok",
                      "status",
                      "service",
                      "version",
                      "state",
                      "expiresAt",
                    ].includes(key),
                ),
                false,
              )
              assert.equal(metadata.state, "PENDING_DELIVERY")
              metadataState = metadata.state as string
            }
          } finally {
            db.close()
          }
          assert.deepEqual(files(witness.root), before)
        }
        record({
          case: "R-CRASH-01",
          action,
          edge,
          actualSignal: result.signal,
          observedRealCommitEdge: true,
          markerRetained: true,
          publicReopenDenied: true,
          readDidNotRecoverOrMutate: true,
          knownCommittedMetadataState: metadataState,
          credentialResponseNeverCompleted: true,
        })
      }
    }
    const endOom = oomKills()
    if (startOom !== undefined && endOom !== undefined)
      assert.equal(endOom, startOom)
    record({
      case: "R-CRASH-01-budget",
      actualSelfKillWindows: 6,
      cgroupOomKillDelta:
        startOom === undefined || endOom === undefined
          ? null
          : endOom - startOom,
      hardwarePowerLossTested: false,
      automaticRecoveryImplemented: false,
    })
  },
)
