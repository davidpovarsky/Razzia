# Exclusive file ownership and interfaces

Root docs/extensions/*.md, AGENTS.md, GEMINI.md, package.json, pnpm-lock.yaml, vite/vitest config, .github/, packages/** and integration scripts are CONTROLLED. Feature agents READ ONLY unless Tomer has owner-approved minimal hook RFC. No one edits shared contracts in place from feature worktrees.
Eitan: extensions/core/contracts/**, extensions/core/prototypes/**, docs/extensions/orchestration/handoffs/eitan/**, RFCs under handoffs/eitan; design-only public API/metadata/registry proposals. May prototype inside own area, not modify upstream.
Noam: extensions/telephony/simulator/**, extensions/telephony/contracts/** only after Eitan contract signoff (until then keep exploratory code in extensions/telephony/simulator/spikes/**), docs/extensions/orchestration/handoffs/noam/**. Game-engine implementation postponed until G1 and new ownership allocation.
Maya: extensions/editor/prototypes/**, extensions/design-system/**, extensions/image-answers/prototypes/**, docs/extensions/orchestration/handoffs/maya/**. Must not edit packages/web/**, locales, or Eitan contracts.
Roni: extensions/tests/**, docs/extensions/orchestration/handoffs/roni/**. Independent QA test design and optional runnable tests for isolated modules. Never change production code to make tests pass.
Tomer: docs/extensions/orchestration/handoffs/tomer/**, scripts/orchestration/**, integration branch and approved upstream hooks AFTER owner G2. Exclusively owns shared upstream integration and lockfile/dependencies; no auto merge.
Yael: docs/extensions/orchestration/handoffs/yael/**, extensions/telephony/providers/yemot/research/** (mock fixtures/docs ONLY). No live provider code until API verified and owner approves.
Dana: docs/extensions/orchestration/handoffs/dana/**, extensions/telephony/security/**, extensions/core/security/**; tests of verification/nonce/replay in owned area only. Never embed real credentials.
All eight i18n locales: en, fr, de, es, it, ja, tr, vi. Locale key ownership after G1: extensions/<feature>/locales/{en,fr,de,es,it,ja,tr,vi}. No editing upstream locale files. English copy must be UK-first; translations must be reviewed.
Only public index.ts contracts across feature boundaries; no deep imports into other agent modules. Do not invent hooks in upstream before G2.
Future waves will reassign EXCLUSIVE implementation ownership via new task manifests committed by Tomer before starting. Do not extrapolate initial ownership into permission to edit new directories.
No shared progress/status markdown written by several agents. Each agent writes ONLY own handoff file; Tomer compiles index.
