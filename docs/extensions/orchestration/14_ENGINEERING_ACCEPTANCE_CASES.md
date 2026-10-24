# EXECUTABLE ACCEPTANCE CASES — not mere checklists

Base existing: 217/217 Vitest, 46/46 Playwright Chromium on 2026-10-24 Windows Node24.22.1. Run extension unit tests and all baseline on final integrated branch, not on simultaneously active dev host.
Prerequisite: Tomer bootstrap extension workspace and pnpm install; no feature agent runs commands that terminate dev server or occupy 3000/3001 without coordinated exclusive window.

| ID | Behaviour and concrete fixture | Expected observable result | Owner |
| CORE01 | Read old quiz with no sidecar | legacy API/game unchanged, no sidecar auto-created | Eitan |
| CORE02 | Save enriched quiz + reorder question 2->1 | stable IDs/media associations follow question, no swapped answers | Eitan |
| CORE03 | Duplicate question with same text, remove middle | unique fresh ID, surviving attachments correct, no orphans | Eitan |
| CORE04 | two clients save expectedRevision=4 concurrently | first wins, second 409, intact files | Eitan |
| CORE05 | power-loss injection between staged base and extras write | journal recovery restores consistent pair; no silent partial update | Eitan |
| CORE06 | legacy JSON and enhanced bundle export/import | both accepted, bundle metadata preserved and new IDs remapped | Eitan |
| GAME01 | upstream leader policy on category run A,A,B | no board between same category, final podium preserved | Yael |
| GAME02 | everyN=2 across 5 questions | leaderboard after q2,q4 only, not q5 | Yael |
| GAME03 | selected IDs; manual post-result | exact selected or manager requested stages, no double board | Yael |
| GAME04 | survey mode with teams configured | no scored leaderboard, original survey unchanged | Yael |
| TEAM01 | 3 teams, 8 players, auto round-robin | counts 3/3/2 by deterministic order | Yael |
| TEAM02 | two teams 50 points tie; reconnect changes socket ID | stable team membership by clientId; tie name then ID; no double count | Yael |
| TEAM03 | disconnected and kicked members | disconnected keeps earned score, kicked removed before next projection | Yael |
| MEDIA01 | image-only answer i=0 with alt and picture | picture renders; underlying accessible answer string preserved | Maya |
| MEDIA02 | image answer missing alt or URL with javascript: | Zod rejects, image not rendered | Maya/Eitan |
| MEDIA03 | reveal blur/tiles/pixelate/zoom after manager trigger | synchronized stage, no premature display or replay on refresh | Maya/Tomer |
| AUDIO01 | custom cue mute/volume=0 and default fallback | no sound when muted; missing asset never freezes game | Dana |
| AUDIO02 | question audio/video and looped game music | only permitted track audible, no overlap on stage exit | Dana |
| INT01 | title/image/video/countdown interlude with auto/manual | exact position after results before next question, skip once | Dana/Tomer |
| INT02 | disconnect/reconnect mid-interlude | current stage snapshot, timer not reset or doubled | Dana/Tomer |
| PHONE01 | simulator joins via /auth/session -> /games/join -> socket login | manager sees phone participant as standard player | Noam/Tomer |
| PHONE02 | digit 1..4 accepted during SELECT_ANSWER only | answerKeys index 0..3, single answer and server scoring | Noam |
| PHONE03 | replay, duplicate, stale epoch and late timestamp | no extra points or extra answers | Noam |
| PHONE04 | survey,multi,estimation,>4 choices | explicit unsupported PSTN UX, web clients unaffected | Noam |
| PHONE05 | fake hangup, rapid reconnect, invalid PIN, wrong room | no orphan sessions, no cross-room submits | Noam/Roni |
| PHONE06 | 100 mock concurrent participants | no crash, counted results, report p50/p95 durations and failure rate, threshold only after baseline | Roni |
| SEC01 | unauth manager/extension route and command | 401/403; no state update | Roni/Tomer |
| SEC02 | mock HMAC incorrect/replay/out-of-window | 401/409 or drop, no event forwarded | Noam/Roni |
| L10N01 | 8 locales x extension namespaces | no missing keys; original namespaces remain unaffected | Tomer/Roni |
| UI01 | manager create/edit/play, phone bot + iPhone/iPad on Wi-Fi | screenshots/recordings and actual join/score outcome | Maya/Tomer/Roni |
| REG01 | extensions disabled and old Razzia game | unchanged DOM/state/scoring where expected; 217 + 46 baseline pass | Tomer/Roni |
| GIT01 | 7 role commit paths disjoint, no accidental upstream changes | ownership script PASS; diff --check clean | Tomer |

All cases require real evidence (command, exit code, assertion, output). Do not mark phone carrier/Yemot UK number verified from mock run. When browser tests are run, ensure dev server on 3000/3001 is stopped and test fixtures use packages/e2e/.config ONLY.
