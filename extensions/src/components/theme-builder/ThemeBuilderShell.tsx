import { PlatformScope } from "../../platform-ui"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"
import { PreviewPanel } from "./PreviewPanel"

/** Unrouted, unavailable shell; no persistence, publishing or editor surface. */
export function ThemeBuilderShell({ locale }: { locale: PreviewLocale }) {
  return <PlatformScope context="platform.studio"><PreviewPanel locale={locale} /></PlatformScope>
}
