// Component-only synthetic consent fixture; not the account-backed F issuer.
import { createRoot } from "react-dom/client"
import { StrictMode } from "react"
import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"
import { setToken } from "@razzia/web/lib/session"
import { OAuthConsentPage } from "../../src/components/oauth-consent/OAuthConsentPage"
const locale = new URLSearchParams(location.search).get("locale") ?? "en"
if (!["en", "fr", "de", "es", "it", "ja", "tr", "vi"].includes(locale))
  throw new Error("qa:unsupported-locale")
const session = await (await fetch("/qa/session")).json()
setToken(session.token)
const instance = createInstance()
await instance.init({
  lng: locale,
  initAsync: false,
  fallbackLng: false,
  resources: { [locale]: { translation: {} } },
})
document.documentElement.lang = locale
;(window as any).__qaOAuth = Object.freeze({
  async changeSession() {
    const changed = await (await fetch("/qa/session?owner=b")).json()
    setToken(changed.token)
  },
})
createRoot(document.getElementById("root")!).render(
  <StrictMode>
  <I18nextProvider i18n={instance}>
    <OAuthConsentPage
      account={{
        id: "author-a",
        email: "synthetic-author@example.invalid",
        verified: true,
      }}
      issuerBasePath="/api/qa/oauth"
      search={location.search}
    />
  </I18nextProvider>
  </StrictMode>,
)
