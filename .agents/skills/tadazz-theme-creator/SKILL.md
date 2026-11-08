---
name: tadazz-theme-creator
description: Author and validate complete TADAZZ client show themes against this repository's live manifest, renderer and audio contracts. Use for theme packages and customer theme creation, not ordinary quiz editing or isolated backgrounds.
---

Use the current repository contracts, not a copied handoff schema. Read [the contract map](references/live-contract.md), then the client's brief, authorized assets and rights. Preserve Classic's canonical choreography and the editor's existing design.

Classify the request: declarative themes reference already trusted renderer IDs; new React/CSS/motion requires source review and CI through the code-backed lane. Never execute customer JavaScript, TSX, HTML or an archive. A custom palette using the Classic renderer is a declarative variant, not proof of a new complete visual system.

Storyboard all 15 visual slots and 16 audio events, including explicit silence. Obtain concept approval when the request requires it; existing authorization remains valid. Use only theme-owned finite variant lists. Do not invent files, licenses or completed installations. Preserve scoped edits on theme changes and keep legacy choices archived.

Start with `assets/theme-template/client-brief.example.json`. From the repository root, scaffold a draft using `pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts scaffold <new-directory> <theme-id>`. The starter deliberately uses existing Classic assets; it is not an installed customer theme. Replace rights/provenance and licensed media as appropriate.

Validate using `scripts/validate_theme.py <manifest.json> <asset-root>` and run the runtime/browser/audio checks described in [QA and review](references/qa-security.md). The validator never downloads assets. Source-controlled Classic can be checked with the explicitly trusted repository flag; never use that flag to approve customer assets.

Deliver the draft, evidence, limits and review status. A static pass does not authorize registry registration, tenant installation or publication. No live installer/API is currently exposed. Follow the repository's explicit publication authorization rules.
