import "@fontsource-variable/rubik/wght.css"
import "@razzia/web/i18n"
import "@razzia/web/index.css"
import "./locales"
import { applyBranding, loadBranding } from "@razzia/web/branding"
import Button from "@razzia/web/components/Button"
import Toaster from "@razzia/web/components/Toaster"
import { PlatformControlsProvider } from "@razzia/extensions/presentation/platform-controls"
import { socketClient } from "@razzia/web/features/game/contexts/socket-context"
import { routeTree } from "@razzia/web/route.gen"
import {
  createRoute,
  createRouter,
  RouterProvider,
  type AnyRoute,
} from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import { StrictMode, useEffect } from "react"
import { MarketingSite } from "./web/marketing/MarketingSite"
import { AccountGateway } from "./web/account/AccountGateway"
import { Studio } from "./web/studio/Studio"

// Generated routes remain unmodified. Compose with public router APIs, once,
// before creating the router. Legacy manager/editor/game children are retained.
function routeChildren(route: AnyRoute): AnyRoute[] {
  const source: unknown = route.children

  return Object.values((source ?? {}) as Record<string, AnyRoute>)
}
const children = routeChildren(routeTree)
const auth = children.find(
  (route) => "id" in route.options && route.options.id === "/(auth)",
)

if (auth) {
  auth.addChildren(
    routeChildren(auth).filter(
      (route) => !("path" in route.options) || route.options.path !== "/",
    ),
  )
}

// Preserve the legacy component at /studio/legacy, while the editor's existing
// save/exit navigation naturally returns to the account's new My Games page.
const managerConfig = children.find(
  (route) =>
    "path" in route.options && route.options.path === "/manager/config",
)
function StudioReturn() {
  useEffect(() => {
    window.location.replace(
      new URLSearchParams(window.location.search).has("packageUpload")
        ? `/studio/legacy${window.location.search}`
        : "/studio/games",
    )
  }, [])

  return null
}
managerConfig?.update({ component: StudioReturn })
const home = createRoute({
  getParentRoute: () => routeTree,
  path: "/",
  component: MarketingSite,
  beforeLoad: ({ location }) => {
    const pin = new URLSearchParams(location.searchStr).get("pin")

    if (pin) {
      window.location.replace(`/game?pin=${encodeURIComponent(pin)}`)
    }
  },
})
const pages = [
  "/site",
  "/login",
  "/signup",
  "/verify",
  "/forgot",
  "/reset",
  "/site/login",
  "/site/signup",
  "/studio",
  "/studio/$section",
  "/site/studio",
] as const
const routes = pages.map((path) =>
  createRoute({
    getParentRoute: () => routeTree,
    path,
    component: (() => {
      if (path.includes("studio")) {
        return Studio
      }

      if (path === "/site") {
        return MarketingSite
      }

      return AccountGateway
    })(),
  }),
)
const composedTree = routeTree.addChildren([...children, home, ...routes])
const router = createRouter({
  routeTree: composedTree,
  context: { socket: socketClient },
})
const root = document.getElementById("root")

if (!root) {
  throw new Error("Root element not found")
}

applyBranding(await loadBranding())
createRoot(root).render(
  <StrictMode>
    <PlatformControlsProvider Button={Button}>
      <RouterProvider router={router} />
      <Toaster />
    </PlatformControlsProvider>
  </StrictMode>,
)
