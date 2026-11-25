import "@fontsource-variable/rubik/wght.css"
import "@razzia/web/i18n"
import "@razzia/web/index.css"
import "./locales"
import { applyBranding, loadBranding } from "@razzia/web/branding"
import Button from "@razzia/web/components/Button"
import { ApplicationDirection } from "@razzia/web/components/ApplicationDirection"
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
import { StrictMode, useEffect, type ReactNode } from "react"
import { SiteLoading } from "./web/shared/SiteLoading"
import { SiteMetadata } from "./web/shared/SiteMetadata"
import { hasManagerSession } from "./adapters/client"
import {
  enterManagedClientMode,
  isManagedClientMode,
  isManagedClientRoomPath,
} from "@razzia/web/lib/managed-client-session"
import {
  browserConsentLoginHandoff,
  CONSENT_PATH,
} from "../components/oauth-consent/login-handoff"

const MarketingSite = lazyRouteComponent(
  () => import("./web/marketing/MarketingSite"),
  "MarketingSite",
)
const AccountGateway = lazyRouteComponent(
  () => import("./web/account/AccountGateway"),
  "AccountGateway",
)
const Studio = lazyRouteComponent(() => import("./web/studio/Studio"), "Studio")
const ManagedClientPortal = lazyRouteComponent(
  () => import("./web/clients/ManagedClientPortal"),
  "ManagedClientPortal",
)
const StudioPackagePreview = lazyRouteComponent(
  () => import("./web/studio/StudioPackagePreview"),
  "StudioPackagePreview",
)
const StudioPackageSaveConsent = lazyRouteComponent(
  () => import("./web/studio/StudioPackagePreview"),
  "StudioPackageSaveConsent",
)

// The generated native tree eagerly imports the editor, XLSX, show and checkout.
// Load it only for native entry paths. Site -> native links use normal navigation.
if (
  /^\/client\/?$/u.test(window.location.pathname) ||
  (isManagedClientRoomPath(window.location.pathname) &&
    new URLSearchParams(window.location.search).get("client") === "1")
) {
  enterManagedClientMode()
}

const nativeEntry = /^\/(?:manager|party|display|game)(?:\/|$)/u.test(
  window.location.pathname,
)
const branding = loadBranding()
const nativeTheme = nativeEntry ? await branding : null
const routeTree: AnyRoute = nativeEntry
  ? (await import("@razzia/web/route.gen")).routeTree
  : rootRoute

// A managed hosting session has its own library. Existing owner credentials in
// another context must never be reached through a host exit or legacy URL.
routeTree.options.beforeLoad = ({
  location,
}: {
  location: { pathname: string }
}) => {
  if (
    isManagedClientMode() &&
    /^\/(?:studio|site\/studio|manager)(?:\/|$)/u.test(location.pathname)
  ) {
    return redirect({ href: "/client", replace: true, throw: true })
  }
}

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
    browserConsentLoginHandoff().clear()
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
  "/client",
  "/studio",
  "/studio/$section",
  "/studio/package-preview/$uploadId/$revision/$gameId",
  "/studio/package-save-consent/$requestId",
  ...(import.meta.env.VITE_TADAZZ_NATIVE_CONSENT_ENABLED === "true"
    ? ["/studio/native-save-consent/$requestId" as const]
    : []),
  "/site/studio",
] as const
const routes = pages.map((path) =>
  createRoute({
    getParentRoute: () => routeTree,
    path,
    beforeLoad: ({ location }) => {
      if (
        location.pathname !== CONSENT_PATH &&
        !(
          location.pathname === "/login" &&
          new URLSearchParams(location.searchStr).get("returnTo") ===
            CONSENT_PATH
        )
      ) {
        browserConsentLoginHandoff().clear()
      }

      if (path.includes("studio")) {
        if (!hasManagerSession()) {
          browserConsentLoginHandoff().capture(location)

          return redirect({
            to: "/login",
            search: () => ({ returnTo: location.pathname }),
            replace: true,
            throw: true,
          })
        }
      }
    },
    component: (() => {
      if (path === "/client") {
        return ManagedClientPortal
      }

      if (path === "/studio/package-preview/$uploadId/$revision/$gameId") {
        return StudioPackagePreview
      }

      if (path === "/studio/package-save-consent/$requestId") {
        return StudioPackageSaveConsent
      }

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
          browserConsentLoginHandoff().clear()
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
  InnerWrap: ({ children: contents }: { children: ReactNode }) => (
    <>
      <SiteMetadata tenantName={nativeTheme?.appName} />
      {contents}
    </>
  ),
  defaultPendingComponent: SiteLoading,
  defaultPendingMs: 150,
  defaultPendingMinMs: 0,
})
const root = document.getElementById("root")

if (!root) {
  throw new Error("Root element not found")
}

if (nativeEntry) {
  applyBranding(nativeTheme)
} else {
  // Platform page titles are owned by SiteMetadata, not an optional tenant name.
  void branding.then((theme) =>
    applyBranding(theme && { ...theme, appName: undefined }),
  )
}

createRoot(root).render(
  <StrictMode>
    <ApplicationDirection>
      <PlatformControlsProvider Button={Button}>
        <RouterProvider router={router} />
        <Toaster />
      </PlatformControlsProvider>
    </ApplicationDirection>
  </StrictMode>,
)
