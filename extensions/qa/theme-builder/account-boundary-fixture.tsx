// Actual E component; synthetic session and intercepted API, no root auth proof.
import "@fontsource-variable/rubik/wght.css"
import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"
import { setToken } from "@razzia/web/lib/session"
import { StudioThemeBuilder } from "../../src/components/theme-builder/StudioThemeBuilder"
const session = await (await fetch("/qa/session")).json()
setToken(session.token)
const i18n = createInstance()
await i18n.init({
  lng: "en",
  initAsync: false,
  fallbackLng: false,
  resources: { en: { translation: {} } },
})
function Fixture() {
  const [accountId, setAccountId] = useState("tenant-a")
  ;(window as any).__qaBoundary = Object.freeze({ account: setAccountId })

  return (
    <I18nextProvider i18n={i18n}>
      <StudioThemeBuilder accountId={accountId} />
    </I18nextProvider>
  )
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
)
