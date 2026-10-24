# MAYA — ALL FRONTEND, EDITOR AND MULTIMEDIA (V3)

Start ONLY after Tomer bootstrap commit and coordinator's Sync-AgentBranches.ps1 have completed. Open C:/Users/DAVID/Code/Razzia-worktrees/maya in Antigravity Local Mode, branch agent/maya/wave1. Keep this SAME chat for all UI phases.

Read root AGENTS.md/GEMINI.md and docs/extensions/orchestration/00,01,10,11,12,13,14 fully. You are a coding/testing agent, NOT researcher. No browsing, subagents, design proposals, new architecture or vendor research. Verify worktree/branch/status/commit first. Write real code, tests, commits, handoff. Do not stop at a plan.

EXCLUSIVE OWNERSHIP: packages/web/src/**, extensions/src/{editor,media,presentation,locales}/**, your handoff. You MAY edit minimal upstream frontend hooks in packages/web/src/** for this plan, after logging file/symbol/reason/disabled-feature test in your handoff. NEVER edit packages/web/package.json, packages/socket/**, packages/common/**, root manifests, shared core, or telephony.

IMPLEMENT:

1. React integrated EditorEnhancementPanel: quiz-level leaderboard policy, teams, sound cues; per-question picture answers, reveal effects, interludes; existing authenticated media library picker; rich accessible preview. Composite /api/extensions/quizzes typed client with expectedRevision and visible 409 conflict handling; no data loss on reorder, duplicate, delete, import/export.
2. RichAnswerCard text/image/both, original accessible answer label and original four colours; validate alt/media URL. RevealMedia none/blur/pixelate/tiles/zoom 250..15000ms, sync by server epoch/seq, no premature reveal or animation replay after reconnect, reduced-motion fallback.
3. Lobby/team assignment and TeamLeaderboardPanel, participant team identity, manager controls, upstream/everyN/selected/categoryEnd/manual presentation; server remains authority for scores and stage.
4. Dana's work consolidated here: InterludePresenter title/image/video/countdown, auto/manual, skip exactly once, resume from server startedAt; sound/music cues start/showQuestion/answersMusic/answerPressed/revealResults/leaderboard/podium1-3, mute/volume/loop, missing asset fallback, browser autoplay restrictions, ducking vs question media, cleanup on leave.
5. All eight locales en/fr/de/es/it/ja/tr/vi under extensions/src/locales/**; web-owned i18next registration; no hard-coded user-facing English; original Rubik, Tailwind v4, Radix/Lucide/Motion and colours.
6. Implement frontend hooks in original editor, game state/presenter/player components and i18n loader under packages/web/src/**. Do not ask Tomer to own your web integration.
7. Targeted UI tests MEDIA01-03, AUDIO01-02, INT01-02, save/revision 409, image accessibility, motion, reconnect, locale parity, feature-off regression. Backend may not be ready yet: use public @razzia/extensions/core and mocked server REST/Socket.IO. Do not start competing 3000/3001 browser suites.

Make local logical commits; document exact exports, web hooks, test evidence, hashes and blockers in docs/extensions/orchestration/handoffs/maya/UI.md. No push, merge, deploy or system changes. Report code status in Hebrew; continue SAME chat for integration fixes.
