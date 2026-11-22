import {
  authoredFixture,
  previewInputFixture,
} from "../../core/show-library/preview-fixtures"
import { normalizePreviewDraft } from "../../core/show-library/identity"
import { resolvePreviewPlan } from "../../core/show-library/preview-resolve"
import type { PreviewLocale } from "./i18n"

/** Source-only deterministic fixture; this is not a room, audience or vote. */
export function prepareDemoFixture(
  role: "manager" | "spectator",
  locale: PreviewLocale,
  reducedMotion: boolean,
) {
  const input = previewInputFixture(authoredFixture(5, 5))
  const draft = normalizePreviewDraft({
    ...input,
    context: { ...input.context, role, locale, reducedMotion },
  })
  const plan = resolvePreviewPlan(draft)
  return { draft, plan }
}
