// Synthetic native session/DTO component fixture only. Never real Save acceptance.
import "../../src/components/native-save-consent/csp-admission"
import "@fontsource-variable/rubik/wght.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"
import { setToken } from "@razzia/web/lib/session"
import type { Account } from "../../src/site/adapters/client"
import { NativeSaveConsentPage } from "../../src/components/native-save-consent/NativeSaveConsentPage"

const locale = sessionStorage.getItem("qa.native-save.locale") ?? "en"

if (!["en", "fr", "de", "es", "it", "ja", "tr", "vi"].includes(locale)) {
  throw new Error("qa:unsupported-locale")
}

const session = (await (await fetch("/qa/native-save/session")).json()) as {
  token: string
  account: Account
}
setToken(session.token)
const instance = createInstance()
await instance.init({
  lng: locale,
  fallbackLng: false,
  initAsync: false,
  resources: { [locale]: { translation: {} } },
})
document.documentElement.lang = locale
const mountElement = document.getElementById("root")

if (mountElement === null) {
  throw new Error("qa:missing-root-element")
}

createRoot(mountElement).render(
  <StrictMode>
    <I18nextProvider i18n={instance}>
      <NativeSaveConsentPage
        account={session.account}
        issuerBasePath="/api/qa/oauth"
        pathname={location.pathname}
        search={location.search}
        hash={location.hash}
      />
    </I18nextProvider>
  </StrictMode>,
)
