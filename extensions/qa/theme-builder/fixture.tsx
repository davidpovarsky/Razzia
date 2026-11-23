import "@fontsource-variable/rubik/wght.css"
import { createRoot } from "react-dom/client"
import { ThemeBuilderShell } from "../../src/components/theme-builder/ThemeBuilderShell"
import { builderDocumentFixture } from "../../src/components/theme-builder/document.fixture"
import { createBuilderClient } from "../../src/components/theme-builder/client"
import type { PreviewLocale } from "../../src/presentation/show-library-preview/i18n"

if (location.pathname === "/studio/oauth-consent") {
  await import("./oauth-fixture")
} else {
  const params = new URLSearchParams(location.search)
  const locale = params.get("locale") ?? "en"

  if (!["en", "fr", "de", "es", "it", "ja", "tr", "vi"].includes(locale)) {
    throw new Error("qa:unsupported-locale")
  }

  const token = (await (await fetch("/qa/session")).json()) as { token: string }
  const client = createBuilderClient("tenant-a", () =>
    Promise.resolve(token.token),
  )
  const document = builderDocumentFixture()
  document.id = params.get("draft") ?? document.id
  const initial =
    params.get("load") === "true"
      ? await client.read(document.id, AbortSignal.timeout(15_000))
      : { document, revision: 0 }
  globalThis.document.documentElement.lang = locale
  const mount = globalThis.document.getElementById("root")

  if (!mount) {
    throw new Error("qa:missing-root")
  }

  createRoot(mount).render(
    <ThemeBuilderShell
      locale={locale as PreviewLocale}
      initialDocument={initial.document}
      initialRevision={initial.revision}
      client={client}
      canAuthor={params.get("readonly") !== "true"}
      tenantId="tenant-a"
      appearance={params.get("appearance") === "dark" ? "dark" : "light"}
      dir={params.get("dir") === "rtl" ? "rtl" : "ltr"}
    />,
  )
}
