import "@fontsource-variable/rubik/wght.css"
import "@razzia/web/i18n"
import "@razzia/web/index.css"
import "./locales"
import { applyBranding, loadBranding } from "@razzia/web/branding"
import Button from "@razzia/web/components/Button"
import Toaster from "@razzia/web/components/Toaster"
import { PlatformControlsProvider } from "@razzia/extensions/presentation/platform-controls"
import { socketClient } from "@razzia/web/features/game/contexts/socket-context"
import { Route as rootRoute } from "@razzia/web/pages/__root"
import {
  createRoute,
  createRouter,
  RouterProvider,
  type AnyRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import { StrictMode, useEffect } from "react"
import { SiteLoading } from "./web/shared/SiteLoading"
import { hasManagerSession } from "./adapters/client"

const MarketingSite = lazyRouteComponent(
  () => import("./web/marketing/MarketingSite"),
  "MarketingSite",
)
const AccountGateway = lazyRouteComponent(
  () => import("./web/account/AccountGateway"),
  "AccountGateway",
)
const Studio = lazyRouteComponent(() => import("./web/studio/Studio"), "Studio")
// The generated native tree eagerly imports the editor, XLSX, show and checkout.
// Load it only for native entry paths. Site -> native links use normal navigation.
const nativeEntry = /^\/(?:manager|party|display|game)(?:\/|$)/u.test(
  window.location.pathname,
)
const branding = loadBranding()
const routeTree: AnyRoute = nativeEntry
  ? (await import("@razzia/web/route.gen")).routeTree
  : rootRoute

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
    beforeLoad: path.includes("studio")
      ? ({ location }) => {
          if (!hasManagerSession()) {
            return redirect({
              to: "/login",
              search: () => ({ returnTo: location.pathname }),
              replace: true,
              throw: true,
            })
          }
        }
      : undefined,
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
// Original manager hooks also navigate imperatively after imports. Reload those
// native entry paths into their unchanged route tree, without eagerly loading it.
const nativeBridges = nativeEntry
  ? []
  : [
      "/manager",
      "/manager/config",
      "/manager/quizz",
      "/manager/quizz/$quizzId",
      "/manager/checkout",
      "/manager/themes/$tenantId/$artifactId",
      "/game",
      "/party/$gameId",
      "/party/manager/$gameId",
      "/display/$gameId",
    ].map((path) =>
      createRoute({
        getParentRoute: () => routeTree,
        path,
        beforeLoad: ({ location }) => {
          window.location.replace(location.href)
        },
        component: SiteLoading,
      }),
    )
const composedTree = routeTree.addChildren([
  ...children,
  home,
  ...routes,
  ...nativeBridges,
])
const router = createRouter({
  routeTree: composedTree,
  context: { socket: socketClient },
  defaultPendingComponent: SiteLoading,
  defaultPendingMs: 150,
  defaultPendingMinMs: 0,
})
const root = document.getElementById("root")

if (!root) {
  throw new Error("Root element not found")
}

if (nativeEntry) {
  applyBranding(await branding)
} else {
  void branding.then(applyBranding)
}

createRoot(root).render(
  <StrictMode>
    <PlatformControlsProvider Button={Button}>
      <RouterProvider router={router} />
      <Toaster />
    </PlatformControlsProvider>
  </StrictMode>,
)
