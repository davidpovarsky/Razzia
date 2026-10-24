# LOCKED FILE OWNERSHIP — FOR INDEPENDENT ANTIGRAVITY CONVERSATIONS

Do NOT edit other roles' files or run git commands targeting their branch/worktree. ALL OWNERS are coders/testers, not researchers.
Tomer integrates; shared upstream code and package workspace metadata owned ONLY by Tomer.

| Owner | EXCLUSIVE owned paths | Required implementation |
| Eitan | extensions/src/core/**, extensions/src/server/storage/**, docs/extensions/orchestration/handoffs/eitan/** | Zod schemas, stable IDs, sidecar/journal CRUD, composite save/import/export, tests |
| Noam | extensions/src/telephony/**, docs/extensions/orchestration/handoffs/noam/** | Offline DTMF/mock provider, Yemot read adapter, authenticated bridge, real Socket.IO integration tests in own fixtures |
| Maya | extensions/src/editor/**, extensions/src/media/**, docs/extensions/orchestration/handoffs/maya/** | Enhanced editor React panels, image answers, image reveal, preview and corresponding module tests |
| Yael | extensions/src/gameplay/**, docs/extensions/orchestration/handoffs/yael/** | Team assignment/scoring/leaderboard policy/teams visual data contracts + tests |
| Dana | extensions/src/presentation/**, docs/extensions/orchestration/handoffs/dana/** | Interlude timeline state machine, audio cues, client audio control and tests |
| Roni | extensions/src/testkit/**, extensions/qa/**, docs/extensions/orchestration/handoffs/roni/** | Actual runnable contract/integration/e2e/security tests, deterministic fake clock and 100-client load runner |
| Tomer | extensions/package.json, extensions/tsconfig*.json, extensions/vitest.config.ts, extensions/src/{index.ts,locales/**,integration/**}, scripts/orchestration/**, docs/extensions/orchestration/handoffs/tomer/**, and authorized patches in packages/**, pnpm-workspace.yaml, pnpm-lock.yaml | Workspace bootstrap, integration seam wiring, locale registration, actual browser run and final build/regressions |

DO NOT MODIFY: root AGENTS.md/GEMINI.md, docs/extensions/_.md, docs/extensions/orchestration/PROMPT__.md by feature agents; original packages/** by anyone other than Tomer; .git metadata manually; .env/config live data.
Shared import rule: @razzia/extensions/{core,gameplay,media,presentation,telephony,editor,testkit,locales,server}. No cross-role deep imports. Each owner creates ONLY its own public index.ts exports. Tomer writes package-level subpath exports before others implement.
A role can import other roles' versioned public contract if already merged/available; else use declared interface and implement in own subtree. Do not import uncommitted code from another worktree.
Tomer merges in dependency order Eitan -> Yael/Noam/Dana -> Maya -> Roni, only after each role's local committed deliverable and relevant tests. Parallel agents never cherry-pick directly.
Each role produces a handoff file and commits it. At integration, Tomer must fix errors in _integration-owned adapters_, not edit feature-owned code; defects in feature code go back to its owner.
Do not add new dependencies or edit root package.json in role branches. Ask Tomer (through handoff) only if specifically enumerated deps are missing. Existing dependency stack from workspace package remains fixed.
