import {
  isQuizExtrasV2,
  type AnyQuizExtras,
  type PublicFullShowData,
} from "../../core/index"
import type { RosterEntry } from "./roster/types"

function directoryScene(extras: AnyQuizExtras | null) {
  if (!extras || !isQuizExtrasV2(extras)) {
    return undefined
  }

  const scene = Object.values(extras.scenes).find(
    (item) =>
      item.kind === "animation" && item.preset === "representative-directory",
  )

  return scene?.kind === "animation" ? scene : undefined
}

/** Public projection only. Explicit roster table identity wins over old name matching. */
export function buildFullShowDirectory(
  extras: AnyQuizExtras | null,
  entries: readonly RosterEntry[],
): PublicFullShowData {
  const directory = directoryScene(extras)
  const authored = directory?.seatingPlan
    ? (directory.representatives ?? [])
    : []
  const connectedTables = new Set<number>()
  const normalize = (name: string) =>
    name.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-GB")
  entries.forEach((entry, index) => {
    if (entry.status !== "connected") {
      return
    }

    if (entry.tableNumber !== undefined || authored.length === 0) {
      connectedTables.add(entry.tableNumber ?? index + 1)

      return
    }

    for (const seat of authored) {
      if (normalize(seat.name) === normalize(entry.displayName)) {
        connectedTables.add(seat.table)
      }
    }
  })

  return {
    isLive: true,
    dialNumber: directory?.dialNumber,
    ...(directory?.seatingPlan === true ? { seatingPlan: true } : {}),
    connectedTables: [...connectedTables],
    representatives:
      authored.length > 0
        ? authored
        : entries.map((entry, index) => ({
            table: entry.tableNumber ?? index + 1,
            name: entry.displayName,
          })),
  }
}

/** Keep the current ten-question lobby rule; old seating metadata is an explicit opt-in. */
export function buildLobbyDirectory(
  extras: AnyQuizExtras | null,
  getLive?: () => PublicFullShowData | undefined,
): PublicFullShowData | null {
  if (!extras || !isQuizExtrasV2(extras)) {
    return null
  }

  const directory = directoryScene(extras)

  if (
    !directory ||
    (!directory.seatingPlan &&
      (extras.questionIds.length !== 10 ||
        extras.roster.participants.length === 0))
  ) {
    return null
  }

  const live = getLive?.()
  const authored = directory.seatingPlan
    ? (directory.representatives ?? [])
    : []
  const fallback =
    authored.length > 0
      ? authored
      : extras.roster.participants.map((rep, index) => ({
          table: rep.tableNumber ?? index + 1,
          name: rep.displayName,
        }))
  const representatives = live?.representatives?.length
    ? live.representatives
    : fallback

  if (!representatives.length) {
    return null
  }

  return {
    isLive: live?.isLive ?? false,
    ...(directory.seatingPlan === true ? { seatingPlan: true } : {}),
    representatives,
    connectedTables: live?.connectedTables ?? [],
    dialNumber: live?.dialNumber ?? directory.dialNumber,
  }
}
