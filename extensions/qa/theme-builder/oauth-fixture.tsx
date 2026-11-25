// Component-only synthetic consent fixture; not the account-backed F issuer.
import { createRoot } from "react-dom/client"
import { StrictMode } from "react"
import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"
import { setToken } from "@razzia/web/lib/session"
import { OAuthConsentPage } from "../../src/components/oauth-consent/OAuthConsentPage"

declare global {
  interface Window {
    __qaOAuth: Readonly<{ changeSession(): Promise<void> }>
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

const locale = new URLSearchParams(location.search).get("locale") ?? "en"

if (!["en", "fr", "de", "es", "it", "ja", "tr", "vi"].includes(locale)) {
  throw new Error("qa:unsupported-locale")
}

const session: unknown = await (await fetch("/qa/session")).json()
setToken(requireSessionToken(session))
const instance = createInstance()
await instance.init({
  lng: locale,
  initAsync: false,
  fallbackLng: false,
  resources: { [locale]: { translation: {} } },
})
document.documentElement.lang = locale
window.__qaOAuth = Object.freeze({
  async changeSession() {
    const changed: unknown = await (await fetch("/qa/session?owner=b")).json()
    setToken(requireSessionToken(changed))
  },
})

const root = document.getElementById("root")

if (!root) {
  throw new Error("qa:missing-root")
}

createRoot(root).render(
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
