import "@fontsource-variable/rubik/wght.css"
import { createRoot } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { catalogI18n, catalogReady } from "./i18n"
import { Catalog } from "./catalog"

void catalogReady.then(() => {
  const rootElement = document.getElementById("root")

  if (!rootElement) {
    throw new Error("Missing fixture root")
  }

  createRoot(rootElement).render(
    <I18nextProvider i18n={catalogI18n}>
      <Catalog />
    </I18nextProvider>,
  )
})
