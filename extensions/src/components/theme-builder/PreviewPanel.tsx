import { Card } from "../../platform-ui"
import { PreviewStageHost } from "../../presentation/show-library-preview/PreviewStageHost"
import { previewText } from "../../presentation/show-library-preview/ui-strings"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"
import { PreviewControls } from "./PreviewControls"

export function PreviewPanel({ locale }: { locale: PreviewLocale }) {
  const t = previewText(locale)
  return <Card aria-label={t("title")}>
    <h2>{t("title")}</h2><p>{t("demo")}</p>
    <PreviewStageHost unavailable={t("unavailable")} />
    <PreviewControls locale={locale} />
  </Card>
}
