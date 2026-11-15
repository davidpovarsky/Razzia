import fs from "node:fs"
import path from "node:path"
import { fork } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const repository = fileURLToPath(new URL("../../../../", import.meta.url))
const installed = createRequire(import.meta.url)
export type CreationRecoveryMode =
  | "recover"
  | "recover-fence-fails"
  | "recover-base-fence-fails"
  | "recover-sidecar-fence-fails"
  | "recover-active-move-fence-fails"
  | "recover-resolved-move-fence-fails"
export function creationChild(
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
  sequence = "",
  owner = "",
) {
  return new Promise<{
    pid?: number
    code: number | null
    signal: NodeJS.Signals | null
    timedOut: boolean
    stderr: string
  }>((resolve, reject) => {
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
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      },
    )
    let timedOut = false,
      stderr = ""
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, 25000)
    child.stderr?.on("data", (data) => {
      stderr = (stderr + data).slice(-128000)
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
  const runs = []
  for (const sequence of ["1", "2"]) {
    const result = await creationChild(
      typeof fenceFails === "string"
        ? fenceFails
        : fenceFails
          ? "recover-fence-fails"
          : "recover",
      root,
      token,
      sequence,
    )
    const file = path.join(root, `.c1-recovery-${sequence}.json`)
    runs.push({
      process: result,
      ...(fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, "utf8"))
        : { missingReceipt: true }),
    })
  }
  return runs
}
export function retainCreationReceipt(name: string, receipt: unknown) {
  if (!process.env.C1_RECEIPT_ROOT) return
  fs.mkdirSync(process.env.C1_RECEIPT_ROOT, { recursive: true })
  fs.writeFileSync(
    path.join(process.env.C1_RECEIPT_ROOT, `${name}.json`),
    JSON.stringify(receipt, null, 2),
  )
}
