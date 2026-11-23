import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  ensureDurableDirectory,
  readDurableFile,
  replaceDurablePrivateRecord,
  syncOwnedFile,
  writeDurableExclusive,
} from "./durable-files"
import { creationFixtureParent } from "./creation-fixture-root"

describe.runIf(process.platform === "linux")(
  "C1 real Linux fence primitives",
  () => {
    type InitializedRootValue = string
    let root: InitializedRootValue | undefined = undefined
    function requireInitializedRoot(): InitializedRootValue {
      if (root === undefined) {
        throw new Error("Fixture state root was read before initialization")
      }

      return root
    }
    beforeEach(() => {
      root = fs.mkdtempSync(
        path.join(creationFixtureParent(), "tadazz-c1-durable-synthetic-"),
      )
    })
    afterEach(() => {
      vi.restoreAllMocks()

      if (
        path.dirname(fs.realpathSync(requireInitializedRoot())) !==
          creationFixtureParent() ||
        !path
          .basename(requireInitializedRoot())
          .startsWith("tadazz-c1-durable-synthetic-")
      ) {
        throw new Error("Refusing non-synthetic C1 cleanup")
      }

      fs.rmSync(requireInitializedRoot(), { recursive: true, force: true })
    })
    it("creates exact private bytes and refuses to replace an existing leaf", () => {
      const file = path.join(requireInitializedRoot(), "record")
      const expected = writeDurableExclusive(file, '{"payload":"complete"}')
      expect(expected.mode).toBe(0o600)
      expect(() => writeDurableExclusive(file, "replacement")).toThrow()
      expect(readDurableFile(file)).toStrictEqual(expected)
      syncOwnedFile(file, expected)
    })
    it("preserves private evidence when its first file fence fails", () => {
      const file = path.join(requireInitializedRoot(), "unfenced")
      let activations = 0
      vi.spyOn(fs, "fsyncSync").mockImplementation(() => {
        activations += 1

        throw Object.assign(new Error("EIO first private file fence"), {
          code: "EIO",
        })
      })
      expect(() => writeDurableExclusive(file, "private intent bytes")).toThrow(
        /EIO/,
      )
      expect(activations).toBe(1)
      expect(fs.readFileSync(file, "utf8")).toBe("private intent bytes")
      expect(fs.readdirSync(requireInitializedRoot())).toEqual(["unfenced"])
    })
    it("rejects linked parents and does not repair their modes or touch their target", () => {
      const real = path.join(requireInitializedRoot(), "real")
      fs.mkdirSync(real, { mode: 0o750 })
      fs.writeFileSync(path.join(real, "sentinel"), "foreign unchanged")
      const link = path.join(requireInitializedRoot(), "linked")
      fs.symlinkSync(real, link)
      const before = fs.lstatSync(real, { bigint: true })
      expect(() => ensureDurableDirectory(path.join(link, "new"))).toThrow()
      expect(() =>
        writeDurableExclusive(path.join(link, "record"), "bad"),
      ).toThrow()
      expect(fs.readdirSync(real)).toEqual(["sentinel"])
      expect(fs.readFileSync(path.join(real, "sentinel"), "utf8")).toBe(
        "foreign unchanged",
      )
      expect(fs.lstatSync(real, { bigint: true }).mode).toBe(before.mode)
    })
    it("does not adopt a same-byte replacement inode after its exclusive write", () => {
      const file = path.join(requireInitializedRoot(), "record")
      const close = fs.closeSync.bind(fs)
      let activations = 0
      vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
        close(fd)

        if (activations !== 0 || !fs.existsSync(file)) {
          return
        }

        activations += 1

        const saved = path.join(requireInitializedRoot(), "pinned-original")
        fs.renameSync(file, saved)
        fs.copyFileSync(saved, file, fs.constants.COPYFILE_EXCL)
        expect(fs.statSync(file, { bigint: true }).ino).not.toBe(
          fs.statSync(saved, { bigint: true }).ino,
        )
      })
      expect(() => writeDurableExclusive(file, "same bytes")).toThrow(
        /verification/,
      )
      expect(activations).toBe(1)
      expect(fs.readFileSync(file, "utf8")).toBe("same bytes")
      expect(
        fs.readFileSync(
          path.join(requireInitializedRoot(), "pinned-original"),
          "utf8",
        ),
      ).toBe("same bytes")
    })
    it("retains the visible new intent and last witness after rename succeeds but its directory fence fails", () => {
      const file = path.join(requireInitializedRoot(), "intent.json")
      const old = writeDurableExclusive(file, '{"phase":"staged"}')
      const witness = path.join(requireInitializedRoot(), "witness")
      const pinned = writeDurableExclusive(witness, "last owned bytes")
      const rename = fs.renameSync.bind(fs)
      const sync = fs.fsyncSync.bind(fs)
      let renamed = false
      let failures = 0
      vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
        rename(from, to)

        if (String(to) === file) {
          renamed = true
        }
      })
      vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
        if (renamed && fs.fstatSync(fd).isDirectory()) {
          failures += 1

          throw new Error("EIO visible marker directory fence")
        }

        sync(fd)
      })
      expect(() =>
        replaceDurablePrivateRecord(file, '{"phase":"committed"}', old),
      ).toThrow(/EIO/)
      expect(renamed).toBe(true)
      expect(failures).toBe(1)
      expect(fs.readFileSync(file, "utf8")).toBe('{"phase":"committed"}')
      expect(readDurableFile(witness)).toStrictEqual(pinned)
    })
  },
)
