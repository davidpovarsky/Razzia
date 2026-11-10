# Non-negotiable engineering policy

## Current Tadazz platform initiative

For the 10 November design-system initiative, the
[scoped mandate](plans/TADAZZ_DESIGN_SYSTEM_UI_UNIFICATION_AGENT_PROMPT_2026-11-10.md)
and [policy](plans/TDS_POLICY.md) take precedence over historical visual and
multi-agent rules. Site/Studio/host platform controls use the Tadazz design
system; the original editor is frozen byte-for-byte and visually/behaviorally.
Do not import platform tokens/components into it. Preserve show-theme styling
and cinematic/audio/timer ownership. All upstream edits require a separately
approved exact seam; historical P0 ownership exceptions do not authorize them.
Use one isolated primary session and update the existing Asana phase description
after verification and commit. The owner explicitly authorized these Asana
updates, not push/merge/deployment or production changes.

## Ownership

- UPSTREAM: existing tracked files in packages/, docs/, docker/, .github/ and root, as of baseline 5161eb7022144ee26d46a5f94cdbc714ec8b560d.
- DOWNSTREAM: extensions/, docs/extensions/, AGENTS.md, GEMINI.md and project-specific agent guidance.
- Never copy, rewrite, relocate or reformat upstream modules. No unrelated dependency bumps or mass formatting.
- If no supported extension point exists, first propose an adapter, composition, wrapper or registry injection. Only then request a tiny upstream hook.
- Before editing a hook, add path, precise lines, necessity, alternatives, tests, and expected merge risk to UPSTREAM_TOUCHES.md. Obtain owner approval before changing upstream.
- No claim of zero merge conflicts. Verify against upstream/main regularly and report drift.

## Modules

- Feature-owned directories: contracts/, server/, web/, locales/, tests/ as applicable.
- Prefer one responsibility per file; target <=250 lines and explain exceptions. Never create giant registries, services or components.
- Version external interfaces; keep old quizzes playable and preserve existing answer/scoring behavior.
- No cross-feature deep imports; use public index.ts and stable contracts.
- Telephony is a replaceable independent service; no vendor names in game-core contracts.

## Design and languages

- Preserve original Razzia design in the frozen editor and legacy surfaces.
  For the scoped site/Studio/host initiative, use the governed Tadazz platform
  system while reusing compatible React, Rubik, Radix, Motion and Lucide tooling.
- All UI text uses i18next with keys and complete translations for en, fr, de, es, it, ja, tr, vi. Do not introduce Hebrew yet.
- Do not implement tablet-specific adaptation yet; preserve existing responsiveness and accessibility.

## Workflow

- One branch/worktree per scoped module; do not let multiple agents edit the same files.
- Design contract + acceptance criteria before code; test happy path, failure path, security, reconnection and legacy behavior.
- Keep secrets in ignored environment files; never print or commit keys, phone numbers tied to individuals, credentials or caller PII.
- Run appropriate checks: pnpm test, pnpm build, pnpm lint, pnpm format and relevant integration/E2E tests when available.
- QA must independently verify; preserve baseline behavior; no fake test evidence.
- No automatic pushes, merges, deployments, purchases or Asana updates. Explicit approval is required.
