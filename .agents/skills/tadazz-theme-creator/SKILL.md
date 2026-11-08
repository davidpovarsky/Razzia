---
name: tadazz-theme-creator
description: Author and validate complete TADAZZ client show themes against this repository's live manifest, renderer and audio contracts. Use for theme packages and customer theme creation, not ordinary quiz editing or isolated backgrounds.
---

Use the current repository contracts, not a copied handoff schema. Read [the contract map](references/live-contract.md), then the client's brief, authorized assets and rights. Preserve Classic's canonical choreography and the editor's existing design.

Classify the request: declarative themes reference already trusted renderer IDs; new React/CSS/motion requires source review and CI through the code-backed lane. Never execute customer JavaScript, TSX, HTML or an archive. A custom palette using the Classic renderer is a declarative variant, not proof of a new complete visual system.

Storyboard all 15 visual slots and 16 audio events, including explicit silence. Obtain concept approval when the request requires it; existing authorization remains valid. Use only theme-owned finite variant lists. Do not invent files, licenses or completed installations. Preserve scoped edits on theme changes and keep legacy choices archived.

Start with `assets/theme-template/client-brief.example.json`. From the repository root, scaffold a draft using `pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts scaffold <new-directory> <theme-id>`. The starter deliberately uses existing Classic assets; it is not an installed customer theme. Replace rights/provenance and licensed media as appropriate.

Include complete name, description and variant text in all eight manifest locale maps. Validate using `scripts/validate_theme.py <manifest.json> <asset-root>` and run the runtime/browser/audio checks described in [QA and review](references/qa-security.md). The validator never downloads assets. Source-controlled Classic can be checked with the explicitly trusted repository flag; never use that flag to approve customer assets.

Use [the installation workflow](references/installation.md) for authenticated private upload, native preview, remote browser/audio QA, assigned independent review, staging, immutable publication and rollback. The installer requires account mode and an explicit server feature flag; source availability does not mean it is deployed or enabled. Honor existing authorization and the requested environment. Never invent approval evidence or use a synthetic QA account as proof of human licensing/content review.

Deliver the package, actual evidence, remaining manual checks and exact installed/review/published state. A static pass is not installation. Keep Classic as the only bundled production theme; synthetic independence fixtures belong exclusively to tests.
