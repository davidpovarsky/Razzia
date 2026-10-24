# RAZZIA PRODUCT EXECUTION SPEC — LOCKED v2 (2026-10-24)

This document supersedes earlier DESIGN and OPEN DECISIONS documents for implementation. Source audit was performed by ChatGPT against the clone at commit 5161eb7; research sources are in 11_RESEARCH_VERIFIED.md. Agents DO NOT research, select technologies or redesign architecture; they IMPLEMENT and TEST these decisions. Technical problems are reported as blockers with a failing test, not delegated as research.

## Release target

UK-focused single-computer, free local-first live quiz platform retaining upstream Razzia 4.0.1 behaviour with extensions disabled. Admin/edit/host on Windows browser; players on iPhone/iPad via same Wi-Fi; telephone users via fully offline simulated DTMF adapter. No paid phone number, Yemot account, public hosting, public tunnels or server purchase. Existing en/fr/de/es/it/ja/tr/vi supported. No Hebrew, RTL project, native app or tablet-specific UI now.

## Quiz/data decisions

- Preserve upstream Quizz and Question structures and their Zod validators unchanged where possible. Base question.answers remains a nonempty string array; answer indices/solutions unchanged. Rich data stored in dedicated sidecar config/extensions/quizzes/<quizId>.json, not injected into legacy JSON. A quiz always works with sidecar absent.
- Each extension quiz has schemaVersion=1, revision positive integer, baseDigest SHA256 over canonical validated base quiz, and questionIds[] with UUIDs in current order. Persist stable identities during reorder, insert, duplicate, remove; do NOT treat React useFieldArray's ephemeral field.id as durable. On mismatch with base digest, show conflict and never silently rebind metadata.
- Single composite authenticated save endpoint for base quiz plus sidecar with staged backup/journal, crash recovery and revision conflict 409. Invalid payload 400; non-manager 403 or 401 per existing middleware. Failures must not silently lose either document. Legacy upstream save/import/export still work.
- Export/import formats: legacy Razzia JSON preserved; enhanced export is versioned bundle {bundleVersion:1,quizz,extensions}. Enhanced import validates both, generates new quiz ID and fresh stable question IDs, remaps per-question metadata, supports old JSON. Do not overwrite existing IDs on import. UI must distinguish Legacy export from Export with enhancements.

## Leaderboard decisions

- Policy modes: upstream (DEFAULT: exact current skip on last question or same-category next), everyN (N=1..100), selected (questionIds set), categoryEnd, manual.
- Never interpose leaderboard after final question (final podium remains). Survey never adds scoring leaderboard.
- For non-default modes, display only after results and before next question. Manual: a manager button on post-answer results schedules an immediate leaderboard; do not interrupt a question/answer timer. Auto-advance manager controls remain effective.
- Leaderboard visual has Individual/Teams toggle when teams enabled; team scores are a pure projection from canonical individual scores, never overwrite the original per-player scoring.

## Teams decisions

- Default OFF. Configured number of teams 2..12, each stable ID, name 1..32 chars, colour token from approved palette.
- Lobby initial assignment = deterministic balanced round-robin by join order; manager may reassign any member before game starts; locked after start. No consensus/team captain mode in this release.
- Canonical scoring untouched. Team points = SUM of all current members' individual points, including disconnected (retain earned scores). Sort descending by points, ties by case-insensitive team name then team ID. Zero-member teams permitted with 0 points.
- Join/reconnect associated by player.clientId; socket.id changes on reconnect and MUST NOT be stored in team membership. Kicked users are removed from team projection.
- Manager team view; participant view shows team identity and current standing as non-blocking panel. Do not introduce unauthorised client changes to membership.

## Images and questions

- Answer content per index: display=text|image|both, media URL reference to existing media library, nonempty accessible alt text. Base answers[i] retains the accessible text label even when visually hidden in image-only display. Answer colours A-D remain upstream values.
- Four answer choices is phone DTMF v1 maximum, but web mode continues upstream answer counts and types. If quiz has >4 options, PSTN flow explicitly reports unsupported question; never silently discard answers.
- Question IMAGE reveal choices: none, blur, pixelate, tiles, zoom; default none, fixed durationMs 250..15000, manual/automatic trigger. Effect runs on presenter view, optionally player view if configured; synced to authoritative server game/question epochs, never CSS-only local guesses. Preserves alt text and image accessibility.

## Interludes and audio

- Interludes inserted AFTER results/optional leaderboard and BEFORE next question; allowed title, image, countdown, video; duration 1..30 seconds or manual advance. On reconnect send current stage snapshot, not a new animation event; manual 'next' skips with one transition only. No interlude after final question in v1.
- SFX per quiz with cue IDs start, showQuestion, answersMusic, answerPressed, revealResults, leaderboard, podium1/2/3. Defaults reuse upstream assets; configurable uploaded media refs, volume 0..1, mute, loop music only. Music ducks/does not compete with question audio/video. Browser autoplay restrictions respected; missing/corrupt asset falls back to silence or default, never blocks play.
- Editor must provide clear integrated sections without replacing upstream form. Video/audio/attachments handled via existing authenticated media API.

## Telephony decisions

- Provider-neutral adapter interface; Yemot adapter targets documented type=api and read loops but remains DISABLED for live use until verified account and real phone testing.
- Offline MockProvider generates synthetic sessions and key events, a browser/localhost keypad simulator exercises real authenticated Socket.IO participation. Dummy caller IDs only. User-friendly telephone room PIN is same existing 6-digit game invite code; phone player names generated as "Phone 001", etc.; no voice identity capture.
- Single-choice 1..4 maps to answerKeys [0..3]. 0/*/# are menu/control or ignored as per simulator. Multi-choice, estimation and >4 options: explicitly unsupported in v1 PSTN and informative voice/simulator state, while game web players continue normally.
- Only first valid answer per (gameId,questionEpoch,participant) accepted. Reject duplicate/replayed/stale/out-of-window responses. Server receipt time is authoritative for score (no trust in provider clock). Disconnected members rejoin by session token if possible.
- 100 simulated concurrent phone participants target baseline with resource metrics; realistic UK PSTN latency/concurrency remains not verified.
- No direct public webhook endpoint or actual Yemot traffic for local-only stage. An unsigned User-Agent is NOT authentication.

## Validation and release

- Original 217 unit tests and 46 E2E were green at local baseline. Each coding owner adds focused extension tests; optional Roni audits after integration; Tomer runs exact build/lint/format + browser suite serially on Windows, after coordinating main dev server.
- One commit per deliverable; exclusive file ownership per 13_FILE_OWNERSHIP.md; no research tasks, no unclear 'choose architecture' steps.
- Changes to upstream packages/** by Tomer only, minimal enumerated hooks with regression tests. No unrelated reformats/restructure.
- Feature flags OFF by default, old Razzia unchanged without sidecar. Only final local green integration may be demonstrated to user.
