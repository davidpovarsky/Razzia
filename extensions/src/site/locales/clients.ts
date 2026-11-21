import i18n from "i18next"
import { useTranslation } from "react-i18next"
import { siteLanguages } from "./index"
import type english from "./clients/en.json"

const resources = import.meta.glob<{ default: Record<string, string> }>(
  "./clients/*.json",
  { eager: true },
)

for (const language of siteLanguages) {
  i18n.addResourceBundle(
    language,
    "tadazzClients",
    resources[`./clients/${language}.json`].default,
    true,
    true,
  )
}

export type ManagedClientTextKey = keyof typeof english

export function useManagedClientText() {
  const { t } = useTranslation("tadazzClients")

  return (
    key: ManagedClientTextKey,
    values: Record<string, string | number> = {},
  ) => t(key, { ...values, ns: "tadazzClients" })
}
