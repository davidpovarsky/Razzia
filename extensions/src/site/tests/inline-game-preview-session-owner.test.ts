import { describe, expect, it, vi } from "vitest"
import { createPreviewCoordinator } from "../components/game-preview/coordinator"
import {
  createPreviewSessionOwner,
  type PreviewConsumerState,
} from "../components/game-preview/session-owner"
import type {
  GamePreviewProvider,
  GamePreviewSession,
  PreviewSelection,
} from "../components/game-preview/contracts"

const selection = { kind: "account-owned", quizId: "fixture-a" } as const
// No DOM renderer is used by these fail-closed tests.
const host = {} as HTMLElement

function unavailableSession() {
  const mount = vi.fn()
  const dispose = vi.fn()
  const session = {
    source: { ...selection, immutableRevision: "fixture-revision" },
    plan: { resolution: { kind: "unavailable" } },
    chapters: [],
    mount,
    dispose,
  } as unknown as GamePreviewSession

  return { session, mount, dispose }
}

describe("lazy session lifecycle (no accepted renderer fixture)", () => {
  it("rejects caller account/revision fields before any provider request", async () => {
    const open = vi.fn()
    const onState = vi.fn()
    const invalid = {
      ...selection,
      accountId: "foreign",
      immutableRevision: "caller",
    } as unknown as PreviewSelection
    const owner = createPreviewSessionOwner({
      coordinator: createPreviewCoordinator(),
      provider: { open },
      selection: invalid,
      onState,
    })
    await owner.open(host)
    expect(open).not.toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith({
      status: "unavailable",
      reason: "source-unavailable",
    })
    owner.dispose()
  })

  it("captures a validated selection so later tile-object mutation cannot switch the source", async () => {
    const selected: { kind: "account-owned"; quizId: string } = { ...selection }
    const open = vi.fn<GamePreviewProvider["open"]>().mockResolvedValue({
      status: "unavailable",
      reason: "source-unavailable",
    })
    const owner = createPreviewSessionOwner({
      coordinator: createPreviewCoordinator(),
      provider: { open },
      selection: selected,
      onState: vi.fn(),
    })
    selected.quizId = "fixture-b"
    await owner.open(host)
    expect(open).toHaveBeenCalledWith(selection, expect.any(AbortSignal))
    owner.dispose()
  })

  it("does no provider work until activation and preserves an unavailable reason", async () => {
    const open = vi.fn<GamePreviewProvider["open"]>().mockResolvedValue({
      status: "unavailable",
      reason: "access-denied",
    })
    const states: PreviewConsumerState[] = []
    const owner = createPreviewSessionOwner({
      coordinator: createPreviewCoordinator(),
      provider: { open },
      selection,
      onState: (state) => states.push(state),
    })
    expect(open).not.toHaveBeenCalled()
    expect(owner.session()).toBeNull()
    await owner.open(host)
    expect(open).toHaveBeenCalledTimes(1)
    expect(states.at(-1)).toEqual({
      status: "unavailable",
      reason: "access-denied",
    })
    owner.close()
    expect(states.at(-1)).toEqual({ status: "inactive" })
  })

  it("missing provider honestly stays unavailable without registering a stage", async () => {
    const onState = vi.fn()
    const owner = createPreviewSessionOwner({
      coordinator: createPreviewCoordinator(),
      selection,
      onState,
    })
    await owner.open(host)
    expect(onState).toHaveBeenLastCalledWith({
      status: "unavailable",
      reason: "source-unavailable",
    })
    expect(owner.session()).toBeNull()
    owner.dispose()
  })

  it("rejects an unavailable core plan, disposes it once and never mounts", async () => {
    const fixture = unavailableSession()
    const onState = vi.fn()
    const owner = createPreviewSessionOwner({
      coordinator: createPreviewCoordinator(),
      selection,
      provider: {
        open: () =>
          Promise.resolve({ status: "ready", session: fixture.session }),
      },
      onState,
    })
    await owner.open(host)
    expect(fixture.mount).not.toHaveBeenCalled()
    expect(fixture.dispose).toHaveBeenCalledTimes(1)
    expect(onState).toHaveBeenLastCalledWith({
      status: "unavailable",
      reason: "renderer-unavailable",
    })
    owner.close()
    await Promise.resolve()
    expect(fixture.dispose).toHaveBeenCalledTimes(1)
  })

  it("an aborted late session is disposed without replacing another card's UI", async () => {
    const pending =
      Promise.withResolvers<Awaited<ReturnType<GamePreviewProvider["open"]>>>()
    const fixture = unavailableSession()
    const coordinator = createPreviewCoordinator()
    const onState = vi.fn()
    const signals: AbortSignal[] = []
    const owner = createPreviewSessionOwner({
      coordinator,
      selection,
      provider: {
        open: (_selection, incoming) => {
          signals.push(incoming)

          return pending.promise
        },
      },
      onState,
    })
    const opening = owner.open(host)
    await Promise.resolve()
    await Promise.resolve()
    const other = coordinator.claim(vi.fn())
    expect(signals[0]?.aborted).toBe(true)
    expect(onState).toHaveBeenLastCalledWith({ status: "inactive" })
    pending.resolve({ status: "ready", session: fixture.session })
    await opening
    expect(fixture.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.mount).not.toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith({ status: "inactive" })
    other.release()
  })

  it("a falsy cleanup rejection also fails closed before another lease is admitted", async () => {
    const fixture = unavailableSession()
    fixture.dispose.mockRejectedValue(undefined)
    const coordinator = createPreviewCoordinator()
    const owner = createPreviewSessionOwner({
      coordinator,
      selection,
      provider: {
        open: () =>
          Promise.resolve({ status: "ready", session: fixture.session }),
      },
      onState: vi.fn(),
    })
    await owner.open(host)
    const next = coordinator.claim(vi.fn())
    expect(await next.ready()).toBe(false)
    expect(fixture.mount).not.toHaveBeenCalled()
    next.release()
  })

  it("does not expose provider diagnostics and ignores new opens after unmount", async () => {
    const open = vi
      .fn<GamePreviewProvider["open"]>()
      .mockRejectedValue(new Error("fixture-private-path-and-token"))
    const onState = vi.fn()
    const owner = createPreviewSessionOwner({
      coordinator: createPreviewCoordinator(),
      provider: { open },
      selection,
      onState,
    })
    await owner.open(host)
    expect(onState).toHaveBeenLastCalledWith({
      status: "unavailable",
      reason: "playback-unavailable",
    })
    expect(JSON.stringify(onState.mock.calls)).not.toContain(
      "private-path-and-token",
    )
    owner.dispose()
    await owner.open(host)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("drops unexpected provider fields and never displays a private diagnostic as a reason", async () => {
    const onState = vi.fn()
    const open = vi.fn().mockResolvedValue({
      status: "unavailable",
      reason: "fixture-private-token",
      privateMetadata: "fixture-private-title",
    })
    const owner = createPreviewSessionOwner({
      coordinator: createPreviewCoordinator(),
      provider: { open },
      selection,
      onState,
    })
    await owner.open(host)
    expect(onState).toHaveBeenLastCalledWith({
      status: "unavailable",
      reason: "source-unavailable",
    })
    expect(JSON.stringify(onState.mock.calls)).not.toContain("fixture-private")
    owner.dispose()
  })

  it("disposes a late provider result after playback failure during source resolution", async () => {
    const pending =
      Promise.withResolvers<Awaited<ReturnType<GamePreviewProvider["open"]>>>()
    const fixture = unavailableSession(),
      onState = vi.fn()
    const owner = createPreviewSessionOwner({
      coordinator: createPreviewCoordinator(),
      selection,
      provider: { open: () => pending.promise },
      onState,
    })
    const opening = owner.open(host)
    await Promise.resolve()
    await Promise.resolve()
    await owner.fail()
    pending.resolve({ status: "ready", session: fixture.session })
    await opening
    expect(fixture.mount).not.toHaveBeenCalled()
    expect(fixture.dispose).toHaveBeenCalledTimes(1)
    expect(onState).toHaveBeenLastCalledWith({
      status: "unavailable",
      reason: "playback-unavailable",
    })
    owner.dispose()
  })
})
