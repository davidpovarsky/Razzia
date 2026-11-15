import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import type { ChildProcess } from "node:child_process"

/** Node fixture observation only. No app imports, global hooks or import-time IO.
 * Disabled unless the runner supplies an exact receipt subdirectory. The raw
 * stream files and result precede the caller's checkpoint read on close/error.
 */
export function createCreationProcessObserver(context: {
  mode: string
  root: string
  sequence: string
  owner: string
}) {
  const selected = process.env.C1_PROCESS_OBSERVER_ROOT
  if (!selected) return undefined
  const receipts = process.env.C1_RECEIPT_ROOT
  if (!receipts || selected !== path.join(receipts, "process-observations"))
    throw new Error("C1 process observer must use the runner receipt subtree")
  if (fs.realpathSync(receipts) !== receipts)
    throw new Error("Linked process receipt parent")
  fs.mkdirSync(selected, { recursive: true, mode: 0o700 })
  const directory = fs.lstatSync(selected)
  if (
    directory.isSymbolicLink() ||
    !directory.isDirectory() ||
    fs.realpathSync(selected) !== selected ||
    (directory.mode & 0o077) !== 0
  )
    throw new Error("Untrusted process observation directory")
  const id = randomUUID()
  const errors: string[] = []
  const open = (name: string) =>
    fs.openSync(
      path.join(selected, `${id}.${name}`),
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    )
  const stdoutFd = open("stdout.log")
  let stderrFd: number
  try {
    stderrFd = open("stderr.log")
  } catch (error) {
    fs.closeSync(stdoutFd)
    throw error
  }
  const streams = {
    stdout: { fd: stdoutFd, bytes: 0, hash: createHash("sha256") },
    stderr: { fd: stderrFd, bytes: 0, hash: createHash("sha256") },
  }
  const failure = (error: unknown) => {
    errors.push(error instanceof Error ? error.message : String(error))
    // Observation failure is visible, never a replacement for child success.
    process.stderr.write(`C1 process observer failed: ${errors.at(-1)}\n`)
  }
  const record = (name: string, value: unknown) => {
    try {
      const fd = open(name)
      try {
        fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n")
        fs.fsyncSync(fd)
      } finally {
        fs.closeSync(fd)
      }
      const parent = fs.openSync(
        selected,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY,
      )
      try {
        fs.fsyncSync(parent)
      } finally {
        fs.closeSync(parent)
      }
    } catch (error) {
      failure(error)
    }
  }
  return {
    attach(child: ChildProcess) {
      const startedNs = process.hrtime.bigint().toString()
      for (const name of ["stdout", "stderr"] as const) {
        child[name]?.on("data", (chunk: Buffer) => {
          try {
            const bytes = Buffer.from(chunk)
            const stream = streams[name]
            let offset = 0
            while (offset < bytes.length) {
              const count = fs.writeSync(stream.fd, bytes, offset)
              if (count <= 0) throw new Error("Incomplete process capture")
              offset += count
            }
            stream.bytes += bytes.length
            stream.hash.update(bytes)
          } catch (error) {
            failure(error)
          }
        })
      }
      child.once("error", (error) => {
        const system = error as NodeJS.ErrnoException
        record("error.json", {
          id,
          context,
          pid: child.pid ?? null,
          event: "error",
          error: {
            name: error.name,
            message: error.message,
            code: system.code,
            errno: system.errno,
            syscall: system.syscall,
          },
          observedNs: process.hrtime.bigint().toString(),
          startedNs,
        })
      })
      child.once("close", (code, signal) => {
        const images = Object.fromEntries(
          Object.entries(streams).map(([name, stream]) => {
            try {
              fs.fsyncSync(stream.fd)
            } catch (error) {
              failure(error)
            }
            try {
              fs.closeSync(stream.fd)
            } catch (error) {
              failure(error)
            }
            return [
              name,
              {
                file: `${id}.${name}.log`,
                bytes: stream.bytes,
                sha256: stream.hash.digest("hex"),
              },
            ]
          }),
        )
        record("result.json", {
          id,
          context,
          pid: child.pid ?? null,
          event: "close",
          code,
          signal,
          observedNs: process.hrtime.bigint().toString(),
          startedNs,
          streams: images,
          observationErrors: errors,
        })
      })
    },
  }
}
