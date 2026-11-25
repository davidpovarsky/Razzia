import {
  MarketingPreview,
  StudioPreview,
} from "@razzia/web/features/tadazz-site/SitePreview"
import { SiteAccountGateway } from "@razzia/web/features/tadazz-site/SiteAccountGateway"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// Separate entrypoint for publicly viewable static previews only.
// Unlike src/main.tsx, this imports NO router/game runtime, SocketProvider,
// auth bootstrap, backend client or checkout flow.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

const pathname = window.location.pathname.replace(/\/$/u, "")
const isStudio = pathname === "/site/studio"
const isLogin = pathname === "/site/login"
const isSignup = pathname === "/site/signup"
let page = <MarketingPreview />

if (isStudio) {
  page = <StudioPreview />
}

if (isSignup) {
  page = <SiteAccountGateway initialStep="register" />
}

if (isLogin) {
  page = <SiteAccountGateway initialStep="login" />
}

const target = document.getElementById("root")

if (!target) {
  throw new Error("Preview root not found")
}

createRoot(target).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>{page}</QueryClientProvider>
  </StrictMode>,
)
