import type { ExtensionStateEnvelope } from "@razzia/extensions/core"
import { createContext, useContext, type PropsWithChildren } from "react"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"

export const ExtensionStateContext =
  createContext<ExtensionStateEnvelope | null>(null)

export const useExtensionState = (): ExtensionStateEnvelope | null => {
  const contextValue = useContext(ExtensionStateContext)
  const storeValue = useManagerStore((s) => s.extensionState)

  return contextValue ?? storeValue ?? null
}

export const ExtensionStateProvider = ({
  value,
  children,
}: PropsWithChildren<{ value: ExtensionStateEnvelope | null }>) => (
  <ExtensionStateContext.Provider value={value}>
    {children}
  </ExtensionStateContext.Provider>
)
