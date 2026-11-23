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

type InitializedFValue = Awaited<ReturnType<typeof fixture>>
let f: InitializedFValue | undefined = undefined
function requireInitializedF(): InitializedFValue {
  if (f === undefined) {
    throw new Error("Fixture state f was read before initialization")
  }

  return f
}
type InitializedFirstIdValue = string
let firstId: InitializedFirstIdValue | undefined = undefined
function requireInitializedFirstId(): InitializedFirstIdValue {
  if (firstId === undefined) {
    throw new Error("Fixture state firstId was read before initialization")
  }

  return firstId
}
before(async () => {
  f = await fixture()
  firstId = (
    await requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF().store().create(p, createInput()),
    )
  ).draftId
  await requireInitializedF().as(requireInitializedF().sessions[1], (p) =>
    requireInitializedF().store().create(p, createInput()),
  )
})
after(() => f?.close())
test("symlink, hardlink and cross-owner DB substitutions cannot read borrowed private data", async () => {
  const own = requireInitializedF().file(
    requireInitializedF().sessions[1].owner,
  )
  const other = requireInitializedF().file(
    requireInitializedF().sessions[0].owner,
  )
  const backup = `${own}.held`
  renameSync(own, backup)

  try {
    for (const make of [
      () => symlinkSync(other, own),
      () => linkSync(other, own),
    ]) {
      make()

      try {
        const priorSnapshot = snapshot(requireInitializedF().root)
        await assert.rejects(
          requireInitializedF().as(requireInitializedF().sessions[1], (p) =>
            requireInitializedF().store().get(p, requireInitializedFirstId()),
          ),
          /DEPENDENCY_UNAVAILABLE/,
        )
        assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot)
      } finally {
        unlinkSync(own)
      }
    }
    copyFileSync(other, own)

    try {
      const priorSnapshot2 = snapshot(requireInitializedF().root)
      await assert.rejects(
        requireInitializedF().as(requireInitializedF().sessions[1], (p) =>
          requireInitializedF().store().get(p, requireInitializedFirstId()),
        ),
        /DEPENDENCY_UNAVAILABLE/,
      )
      assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot2)
    } finally {
      unlinkSync(own)
    }
  } finally {
    renameSync(backup, own)
  }
})
test("an unsafe existing ancestor is denied without creating or repairing directories", async () => {
  const own = dirname(
    requireInitializedF().file(requireInitializedF().sessions[1].owner),
  )
  const other = dirname(
    requireInitializedF().file(requireInitializedF().sessions[0].owner),
  )
  const backup = `${own}.held`

  renameSync(own, backup)

  try {
    symlinkSync(other, own, "dir")

    try {
      const priorSnapshot3 = snapshot(requireInitializedF().root)
      await assert.rejects(
        requireInitializedF().as(requireInitializedF().sessions[1], (p) =>
          requireInitializedF().store().get(p, requireInitializedFirstId()),
        ),
        /DEPENDENCY_UNAVAILABLE/,
      )
      assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot3)
    } finally {
      unlinkSync(own)
    }
  } finally {
    renameSync(backup, own)
  }
})
