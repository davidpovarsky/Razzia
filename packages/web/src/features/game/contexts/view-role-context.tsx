import { createContext, useContext } from "react"

export type ViewRole = "player" | "spectator" | "manager"

export const ViewRoleContext = createContext<ViewRole>("player")

export const useViewRole = (): ViewRole => useContext(ViewRoleContext)
