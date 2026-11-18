# Full show scene localization — 2026-11-18

Actual Hebrew preview QA exposed remaining English stage captions. The Hebrew agent owns shared StageIdentity/types/useTadazzLabels. This slice owns only FullShowScenes.tsx plus a fullShow dictionary subtree in all nine extension locales and focused localization verification.

Translate every fixed caption, default story role, phone instruction, readiness state, fallback choice, status, and accessible label. Reuse existing tadazzShow labels when semantically identical. Use the current I18nextProvider already present in live/isolated preview roots; preserve English canonical defaults for existing SSR callers. Keep authored titles, names, artwork, phone numbers, server timing, vote counts, winner choice, animations and asset paths unchanged. Telephone keypad and phone strings stay LTR; mixed-script data receives bidi isolation. Decorative curtains use empty alt text.

Run existing full-show scene behavior/source-parity tests and nine-locale parity, plus a focused real Hebrew SSR check under an isolated i18n provider. Root/QA agent owns live screenshots across themes. No edit to sibling-owned tadazz-v4 components.tsx/types.ts or the base label hook.
