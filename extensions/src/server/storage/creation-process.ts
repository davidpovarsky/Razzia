import fs from "node:fs"
import path from "node:path"
import { fork } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createCreationProcessObserver } from "./creation-process-observer"
import { isCreationRecord, requireCreationRecord } from "./creation-fixture"
import type { recoverCreationReservations } from "./creation-reservation"

const repository = fileURLToPath(new URL("../../../../", import.meta.url))
const installed = createRequire(import.meta.url)

export type CreationRecoveryMode =
  | "recover"
  | "recover-fence-fails"
  | "recover-base-fence-fails"
  | "recover-sidecar-fence-fails"
  | "recover-active-move-fence-fails"
  | "recover-resolved-move-fence-fails"

interface CreationEvidenceState {
  pid: number
  state: Record<string, unknown>
  phases: { active: string[]; resolved: string[] }
}

interface CreationRecoveryRun extends CreationEvidenceState {
  process: {
    pid?: number
    code: number | null
    signal: string | null
    timedOut: boolean
    stderr: string
  }
  faultActivations: number
  report?: ReturnType<typeof recoverCreationReservations>
  error?: string
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === "string")
  )
}

function isCreationEvidenceState(
  value: unknown,
): value is CreationEvidenceState {
  return (
    isCreationRecord(value) &&
    typeof value.pid === "number" &&
    isCreationRecord(value.state) &&
    isCreationRecord(value.phases) &&
    isStringList(value.phases.active) &&
    isStringList(value.phases.resolved)
  )
}

function isCreationRecoveryReport(
  value: unknown,
): value is ReturnType<typeof recoverCreationReservations> {
  return (
    isCreationRecord(value) &&
    typeof value.recovered === "number" &&
    isStringList(value.unresolved) &&
    typeof value.qualified === "boolean"
  )
}

function isCreationRecoveryRun(value: unknown): value is CreationRecoveryRun {
  if (!isCreationRecord(value) || !isCreationEvidenceState(value)) {
    return false
  }

  const processResult = value.process

  return (
    !Object.hasOwn(value, "missingReceipt") &&
    isCreationRecord(processResult) &&
    (processResult.pid === undefined ||
      typeof processResult.pid === "number") &&
    (processResult.code === null || typeof processResult.code === "number") &&
    (processResult.signal === null ||
      typeof processResult.signal === "string") &&
    typeof processResult.timedOut === "boolean" &&
    typeof processResult.stderr === "string" &&
    typeof value.faultActivations === "number" &&
    (value.error === undefined || typeof value.error === "string") &&
    (value.report === undefined || isCreationRecoveryReport(value.report))
  )
}

export function assertCreationRuns(
  value: unknown,
): asserts value is [CreationRecoveryRun, CreationRecoveryRun] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(isCreationRecoveryRun)
  ) {
    throw new Error("Invalid or missing synthetic creation recovery receipt")
  }
}

export function creationRecoveryReport(run: CreationRecoveryRun) {
  if (!run.report) {
    throw new Error("Missing synthetic creation recovery report")
  }

  return run.report
}

function isCreationCheckpoint(
  value: unknown,
): value is CreationEvidenceState & { mode: string } {
  return (
    isCreationRecord(value) &&
    isCreationEvidenceState(value) &&
    typeof value.mode === "string"
  )
}

export function requireCreationCheckpoint(
  value: unknown,
): CreationEvidenceState & { mode: string } {
  if (!isCreationCheckpoint(value)) {
    throw new Error("Invalid synthetic creation interruption checkpoint")
  }

  return value
}

export function creationChild(
  ...args: [
    mode:
      | "before-public"
      | "after-sidecar"
      | "before-id-return"
      | "committed-visible"
      | "private-cleanup"
      | "before-slot-removal"
      | CreationRecoveryMode,
    root: string,
    token: string,
    sequence?: string,
    owner?: string,
  ]
) {
  const [mode, root, token, sequence, owner] = args

  return creationChildFromRequest({ mode, root, token, sequence, owner })
}

function creationChildFromRequest({
  mode,
  root,
  token,
  sequence = "",
  owner = "",
}: {
  mode:
    | "before-public"
    | "after-sidecar"
    | "before-id-return"
    | "committed-visible"
    | "private-cleanup"
    | "before-slot-removal"
    | CreationRecoveryMode
  root: string
  token: string
  sequence?: string
  owner?: string
}) {
  return new Promise<{
    pid?: number
    code: number | null
    signal: NodeJS.Signals | null
    timedOut: boolean
    stderr: string
  }>((resolve, reject) => {
    const observer = createCreationProcessObserver({
      mode,
      root,
      sequence,
      owner,
    })
    const child = fork(
      fileURLToPath(new URL("./creation-child.ts", import.meta.url)),
      [mode, root, token, sequence, owner],
      {
        cwd: repository,
        execArgv: ["--import", pathToFileURL(installed.resolve("tsx")).href],
        env: {
          ...process.env,
          CONFIG_PATH: root,
          TSX_DISABLE_CACHE: "1",
          TSX_TSCONFIG_PATH: path.join(repository, "tsconfig.json"),
        },
        stdio: ["ignore", observer ? "pipe" : "ignore", "pipe", "ipc"],
      },
    )
    observer?.attach(child)
    let timedOut = false,
      stderr = ""
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, 25000)
    child.stderr?.on("data", (data: Buffer | string) => {
      stderr = (
        stderr + (typeof data === "string" ? data : data.toString("utf8"))
      ).slice(-128000)
    })
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("close", (code, signal) => {
      clearTimeout(timer)
      resolve({ pid: child.pid, code, signal, timedOut, stderr })
    })
  })
}

export async function creationReplayTwice(
  root: string,
  token: string,
  fenceFails: boolean | CreationRecoveryMode = false,
) {
  const runs: unknown[] = []
  async function replay(sequence: string) {
    const getRecoveryMode = (): CreationRecoveryMode => {
      if (typeof fenceFails === "string") {
        return fenceFails
      }

      if (fenceFails) {
        return "recover-fence-fails"
      }

      return "recover"
    }

    const result = await creationChild(getRecoveryMode(), root, token, sequence)
    const file = path.join(root, `.c1-recovery-${sequence}.json`)
    runs.push({
      process: result,
      ...(fs.existsSync(file)
        ? requireCreationRecord(JSON.parse(fs.readFileSync(file, "utf8")))
        : { missingReceipt: true }),
    })
  }

  await replay("1")
  await replay("2")

  return runs
}

export function retainCreationReceipt(name: string, receipt: unknown) {
  if (!process.env.C1_RECEIPT_ROOT) {
    return
  }

  fs.mkdirSync(process.env.C1_RECEIPT_ROOT, { recursive: true })
  fs.writeFileSync(
    path.join(process.env.C1_RECEIPT_ROOT, `${name}.json`),
    JSON.stringify(receipt, null, 2),
  )
}
