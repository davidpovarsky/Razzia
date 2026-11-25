import { EVENTS } from "@razzia/common/constants"
import {
  EXTENSION_EVENTS,
  type ExtensionStateEnvelope,
  type HostPresenceSnapshot,
} from "@razzia/extensions/core"
import {
  getAuthoritativeEnvelope,
  isNewerEnvelope,
} from "@razzia/web/features/game/contexts/extension-state-context"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { fetchGameRoster } from "@razzia/web/features/manager/roster-queries"
import { useEffect, useMemo, useState } from "react"

export function useGameExtensionConnection(manager: boolean | undefined) {
  const { gameId, hostPresence, updateManager } = useManagerStore()
  const storeExtensionState = useManagerStore((s) => s.extensionState)
  const [localExtensionState, setLocalExtensionState] =
    useState<ExtensionStateEnvelope | null>(null)
  const [roomMediaReady, setRoomMediaReady] = useState(false)
  useEffect(() => {
    if (manager && gameId && !hostPresence) {
      fetchGameRoster(gameId)
        .then(({ presence }) => {
          updateManager({ hostPresence: presence })
        })
        .catch(() => undefined)
    }
  }, [manager, gameId, hostPresence, updateManager])

  // Browser <img>/<audio> elements cannot attach the manager's Bearer token.
  // Refresh the short-lived room media cookie whenever a host opens a room.
  // Remount the stage once authorized so images retried after an initial 401.
  useEffect(() => {
    if (!manager || !gameId) {
      return
    }

    let alive = true
    // oxlint-disable-next-line react/set-state-in-effect -- Revoke the previous room media readiness before the async authorization request.
    setRoomMediaReady(false)
    void fetch(`/api/games/${encodeURIComponent(gameId)}/display-media`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((response) => {
        if (alive && response.ok) {
          setRoomMediaReady(true)
        }
      })
      .catch(() => undefined)

    return () => {
      alive = false
    }
  }, [manager, gameId])

  // Single authoritative state: resolve between store and local event state by epoch/seq
  const extensionState = useMemo(() => {
    if (manager) {
      if (!storeExtensionState && !localExtensionState) {
        return null
      }

      return getAuthoritativeEnvelope(localExtensionState, storeExtensionState)
    }

    return localExtensionState
  }, [manager, storeExtensionState, localExtensionState])
  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    setLocalExtensionState((prev) => {
      const current = getAuthoritativeEnvelope(prev, storeExtensionState)

      if (isNewerEnvelope(payload, current)) {
        return payload
      }

      return prev
    })
  })

  useEvent(EVENTS.MANAGER.HOST_PRESENCE, (snapshot: HostPresenceSnapshot) => {
    if (manager) {
      updateManager({ hostPresence: snapshot })
    }
  })

  return { extensionState, roomMediaReady }
}
