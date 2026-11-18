import { Direction } from "radix-ui"
import type { PropsWithChildren } from "react"
import { useTranslation } from "react-i18next"
import { languageDirection } from "@razzia/web/language-direction"

/** Keep portals and Radix keyboard navigation aligned with the document. */
export function ApplicationDirection({ children }: PropsWithChildren) {
  const { i18n } = useTranslation()
  const dir = languageDirection(i18n.resolvedLanguage ?? i18n.language)

  return <Direction.Provider dir={dir}>{children}</Direction.Provider>
}
