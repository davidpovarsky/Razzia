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

/** Recognize the existing legacy lobby only from saved, complete table assignments. */
function usesSeatingPlan(
  extras: AnyQuizExtras | null,
  directory: ReturnType<typeof directoryScene>,
): boolean {
  if (directory?.seatingPlan === true) {
    return true
  }

  if (
    !extras ||
    !isQuizExtrasV2(extras) ||
    !directory ||
    directory.seatingPlan !== undefined ||
    directory.representatives !== undefined ||
    extras.defaults.lobby !== undefined ||
    extras.questionIds.length !== 10
  ) {
    return false
  }

  const { participants } = extras.roster

  return (
    participants.every(
      ({ tableNumber }) =>
        tableNumber !== undefined &&
        Number.isInteger(tableNumber) &&
        tableNumber >= 1 &&
        tableNumber <= 31,
    ) && new Set(participants.map(({ tableNumber }) => tableNumber)).size === 31
  )
}

/** Only a show that opts into a public register publishes these three fields. */
function attendanceRows(
  extras: AnyQuizExtras | null,
  entries?: readonly RosterEntry[],
): PublicFullShowData["roster"] {
  if (
    !extras ||
    !isQuizExtrasV2(extras) ||
    !extras.defaults.lobby?.showRoster
  ) {
    return undefined
  }

  // A host can attach, replace or remove the register after the room opens.
  // Live pre-registration is authoritative; guests never become register rows.
  const participants =
    entries === undefined
      ? extras.roster.participants.map((person) => ({
          ...person,
          status: "not_joined",
        }))
      : entries.filter((person) => person.preRegistered)

  return participants.slice(0, 2000).map((entry) => ({
    id: entry.rosterPlayerId,
    label: entry.displayName,
    connected: entry.status === "connected",
  }))
}

/** Public projection only. Explicit roster table identity wins over old name matching. */
export function buildFullShowDirectory(
  extras: AnyQuizExtras | null,
  entries: readonly RosterEntry[],
): PublicFullShowData {
  const directory = directoryScene(extras)
  const seatingPlan = usesSeatingPlan(extras, directory)
  const lobby =
    extras && isQuizExtrasV2(extras) ? extras.defaults.lobby : undefined
  const roster = attendanceRows(extras, entries)
  const authored = seatingPlan ? (directory?.representatives ?? []) : []
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
    dialNumber: lobby?.dialNumber ?? directory?.dialNumber,
    ...(roster ? { roster } : {}),
    ...(seatingPlan ? { seatingPlan: true } : {}),
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

/** Keep the current ten-question lobby rule and recognize its complete legacy seating data. */
export function buildLobbyDirectory(
  extras: AnyQuizExtras | null,
  getLive?: () => PublicFullShowData | undefined,
): PublicFullShowData | null {
  if (!extras || !isQuizExtrasV2(extras)) {
    return null
  }

  const directory = directoryScene(extras)
  const seatingPlan = usesSeatingPlan(extras, directory)
  const { lobby } = extras.defaults

  if (lobby) {
    const live = getLive?.()

    return {
      isLive: live?.isLive ?? false,
      joinMode: lobby.joinMode,
      dialNumber: lobby.dialNumber ?? live?.dialNumber ?? directory?.dialNumber,
      ...(lobby.instructions ? { instructions: lobby.instructions } : {}),
      ...(lobby.showRoster
        ? { roster: live?.roster ?? attendanceRows(extras) ?? [] }
        : {}),
    }
  }

  if (
    !directory ||
    (!seatingPlan &&
      (extras.questionIds.length !== 10 ||
        extras.roster.participants.length === 0))
  ) {
    return null
  }

  const live = getLive?.()
  const authored = seatingPlan ? (directory.representatives ?? []) : []
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
    ...(seatingPlan ? { seatingPlan: true } : {}),
    representatives,
    connectedTables: live?.connectedTables ?? [],
    dialNumber: live?.dialNumber ?? directory.dialNumber,
  }
}
