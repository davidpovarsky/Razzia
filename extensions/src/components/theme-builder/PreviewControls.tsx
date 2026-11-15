import { Button, Select } from "../../platform-ui"
import { previewText } from "../../presentation/show-library-preview/ui-strings"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"

/** All controls stay disabled until a reviewed renderer and controller exist. */
export function PreviewControls({ locale }: { locale: PreviewLocale }) {
  const t = previewText(locale)
  return <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--tds-space-2, 0.5rem)", alignItems: "end" }}>
    <Select label={t("role")} disabled value="spectator" onChange={() => {}}>
      <option value="spectator">{t("spectator")}</option><option value="manager">{t("manager")}</option>
    </Select>
    <Select label={t("phase")} disabled value="question" onChange={() => {}}>
      {(["question", "answerCards", "voting", "voteLocked", "results"] as const).map((phase) => <option key={phase} value={phase}>{t(phase)}</option>)}
    </Select>
    <Button disabled>{t("play")}</Button><Button disabled>{t("pause")}</Button><Button disabled>{t("replay")}</Button>
  </div>
}
