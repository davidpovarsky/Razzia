// Actual E component; synthetic session and intercepted API, no root auth proof.
import "@fontsource-variable/rubik/wght.css"
import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"
import { setToken } from "@razzia/web/lib/session"
import { StudioThemeBuilder } from "../../src/components/theme-builder/StudioThemeBuilder"

declare global {
  interface Window {
    __qaBoundary: Readonly<{ account: (accountId: string) => void }>
  }
}

function requireSessionToken(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    !("token" in value) ||
    typeof value.token !== "string"
  ) {
    throw new Error("qa:invalid-session-token")
  }

  return value.token
}

const session: unknown = await (await fetch("/qa/session")).json()
setToken(requireSessionToken(session))
const i18n = createInstance()
await i18n.init({
  lng: "en",
  initAsync: false,
  fallbackLng: false,
  resources: { en: { translation: {} } },
})
function Fixture() {
  const [accountId, setAccountId] = useState("tenant-a")
  window.__qaBoundary = Object.freeze({ account: setAccountId })

  return (
    <I18nextProvider i18n={i18n}>
      <StudioThemeBuilder accountId={accountId} />
    </I18nextProvider>
  )
}

const root = document.getElementById("root")

if (!root) {
  throw new Error("qa:missing-root")
}

createRoot(root).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
)
