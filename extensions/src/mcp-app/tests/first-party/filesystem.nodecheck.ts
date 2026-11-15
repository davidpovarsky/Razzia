import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import {
  copyFileSync,
  linkSync,
  renameSync,
  symlinkSync,
  unlinkSync,
} from "node:fs"
import { dirname } from "node:path"
import { fixture, createInput, snapshot } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
let firstId: string
before(async () => {
  f = await fixture()
  firstId = (
    await f.as(f.sessions[0], (p) => f.store().create(p, createInput()))
  ).draftId
  await f.as(f.sessions[1], (p) => f.store().create(p, createInput()))
})
after(() => f?.close())
test("symlink, hardlink and cross-owner DB substitutions cannot read borrowed private data", async () => {
  const own = f.file(f.sessions[1].owner)
  const other = f.file(f.sessions[0].owner)
  const backup = own + ".held"
  renameSync(own, backup)
  try {
    for (const make of [
      () => symlinkSync(other, own),
      () => linkSync(other, own),
    ]) {
      make()
      try {
        const before = snapshot(f.root)
        await assert.rejects(
          f.as(f.sessions[1], (p) => f.store().get(p, firstId)),
          /DEPENDENCY_UNAVAILABLE/,
        )
        assert.deepEqual(snapshot(f.root), before)
      } finally {
        unlinkSync(own)
      }
    }
    copyFileSync(other, own)
    try {
      const before = snapshot(f.root)
      await assert.rejects(
        f.as(f.sessions[1], (p) => f.store().get(p, firstId)),
        /DEPENDENCY_UNAVAILABLE/,
      )
      assert.deepEqual(snapshot(f.root), before)
    } finally {
      unlinkSync(own)
    }
  } finally {
    renameSync(backup, own)
  }
})
test("an unsafe existing ancestor is denied without creating or repairing directories", async () => {
  const own = dirname(f.file(f.sessions[1].owner))
  const other = dirname(f.file(f.sessions[0].owner))
  const backup = own + ".held"
  renameSync(own, backup)
  try {
    symlinkSync(other, own, "dir")
    try {
      const before = snapshot(f.root)
      await assert.rejects(
        f.as(f.sessions[1], (p) => f.store().get(p, firstId)),
        /DEPENDENCY_UNAVAILABLE/,
      )
      assert.deepEqual(snapshot(f.root), before)
    } finally {
      unlinkSync(own)
    }
  } finally {
    renameSync(backup, own)
  }
})
