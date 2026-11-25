import fs from "node:fs"
import path from "node:path"
import { recoverCreationReservations } from "./creation-reservation"
import { withAccount } from "../../../../packages/socket/src/services/account-scope"
import {
  assertCreationFixture,
  creationExtras,
  creationInput,
  creationRegistryState,
  creationTree,
  nativeCreationComposition,
  requireCreationRecord,
} from "./creation-fixture"

const [mode, root, token, sequence, owner] = process.argv.slice(2)
assertCreationFixture(root, token)

if (process.env.CONFIG_PATH !== root) {
  throw new Error("C1 child root mismatch")
}

const write = fs.writeFileSync.bind(fs)

if (mode.startsWith("recover")) {
  if (!["1", "2"].includes(sequence)) {
    throw new Error("Bad C1 replay sequence")
  }

  let report: unknown = undefined,
    error: string | undefined = undefined
  let faultActivations = 0

  if (mode !== "recover") {
    const family = path.join(root, ".tadazz-creation-v1", "legacy-global")
    const targets: Record<string, string> = {
      "recover-base-fence-fails": path.join(root, "quizz"),
      "recover-sidecar-fence-fails": path.join(root, "extensions/quizzes"),
      "recover-active-move-fence-fails": path.join(family, "active"),
      "recover-resolved-move-fence-fails": path.join(family, "resolved"),
    }

    if (mode !== "recover-fence-fails" && !targets[mode]) {
      throw new Error("Bad C1 recovery fault")
    }

    const sync = fs.fsyncSync.bind(fs)
    fs.fsyncSync = (fd) => {
      const opened = fs.fstatSync(fd, { bigint: true })
      const target =
        targets[mode] && fs.statSync(targets[mode], { bigint: true })
      const moved =
        !mode.includes("-move-") ||
        creationRegistryState(root).resolved.length > 0

      if (
        opened.isDirectory() &&
        moved &&
        (mode === "recover-fence-fails" ||
          (target && target.dev === opened.dev && target.ino === opened.ino))
      ) {
        faultActivations += 1

        throw new Error("EIO repeated warm directory fence")
      }

      sync(fd)
    }
  }

  try {
    report = recoverCreationReservations(root)
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
    process.exitCode = 2
  }

  write(
    path.join(root, `.c1-recovery-${sequence}.json`),
    JSON.stringify({
      pid: process.pid,
      report,
      error,
      faultActivations,
      phases: creationRegistryState(root),
      state: creationTree(root),
    }),
  )
} else {
  const stop = () => {
    write(
      path.join(root, ".c1-interrupted.json"),
      JSON.stringify({
        pid: process.pid,
        mode,
        state: creationTree(root),
        phases: creationRegistryState(root),
      }),
    )
    process.kill(process.pid, "SIGKILL")
    process.exit(87)
  }
  const link = fs.linkSync.bind(fs)
  fs.linkSync = (from, to) => {
    if (mode === "before-public") {
      stop()
    }

    link(from, to)

    if (
      mode === "after-sidecar" &&
      String(to).includes(`${path.sep}extensions${path.sep}quizzes${path.sep}`)
    ) {
      stop()
    }

    if (
      mode === "before-id-return" &&
      String(to).includes(`${path.sep}quizz${path.sep}`)
    ) {
      stop()
    }
  }
  const rename = fs.renameSync.bind(fs)
  fs.renameSync = (from, to) => {
    rename(from, to)

    if (
      mode === "committed-visible" &&
      String(to).endsWith("intent.json") &&
      requireCreationRecord(JSON.parse(fs.readFileSync(to, "utf8"))).phase ===
        "committed"
    ) {
      stop()
    }
  }
  const unlink = fs.unlinkSync.bind(fs)
  fs.unlinkSync = (file) => {
    unlink(file)

    if (mode === "private-cleanup" && String(file).endsWith("base.record")) {
      stop()
    }
  }
  const removeDirectory = fs.rmdirSync.bind(fs)
  fs.rmdirSync = (directory) => {
    if (
      mode === "before-slot-removal" &&
      path.basename(path.dirname(String(directory))) === "resolved"
    ) {
      stop()
    }

    removeDirectory(directory)
  }
  const { service } = nativeCreationComposition(root)
  const create = () =>
    service.createCompositeQuiz({
      quizz: creationInput(),
      extras: creationExtras(),
    })

  if (owner) {
    await withAccount(owner, create)
  } else {
    create()
  }

  throw new Error("C1 interruption boundary not reached")
}
