# Precise integration points and minimum-touch strategy

STATUS: CANDIDATES ONLY. This is a review/approval plan, not authorization to modify upstream.
Risk: LOW (additive), MED (small hook), HIGH (lifecycle/schema/state change).

| ID  | Upstream file / anchor                                                                          | Required capability                        | Preferred technique                                                                                      | Touch                 | Risk             |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------- | ---------------- |
| H01 | packages/web/src/i18n.ts:5 import.meta.glob and init                                            | extension translations                     | one additive import + resource merge before init                                                         | likely 1 hook         | LOW              |
| H02 | packages/web/src/features/quizz/contexts/quizz-editor-context.tsx:27-81, 97+                    | stable question IDs, extension editor data | separate editor sidecar context, lifecycle integration for reorder/remove/save                           | likely hooks          | HIGH             |
| H03 | packages/web/src/features/quizz/components/QuestionEditor/index.tsx                             | optional extension panels                  | single ExtensionEditorSlot component                                                                     | likely 1 hook         | MED              |
| H04 | packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorAnswers.tsx:83-116      | image answer selector and preview          | small replaceable answer content slot, preserve solution picker                                          | likely 1 hook         | MED              |
| H05 | packages/web/src/features/questions/index.ts:31-40                                              | extra question renderers                   | avoid new question type; reuse single/multi and augment visuals; registry hook only if new type approved | avoid if possible     | LOW/MED          |
| H06 | packages/common/src/validators/quizz.ts:33-88                                                   | rich question metadata                     | versioned sidecar; keep upstream schema unchanged                                                        | no touch preferred    | HIGH integration |
| H07 | packages/socket/src/services/config.ts:getQuizz/updateQuizz/deleteQuizz                         | metadata save/delete consistency           | sidecar API and lifecycle hook or external orchestration; atomicity proof                                | hook may be necessary | HIGH             |
| H08 | packages/socket/src/api/index.ts:8-16                                                           | extension HTTP routes                      | single mount /extensions with manager auth and versioned schemas                                         | 1 hook                | LOW              |
| H09 | packages/socket/src/app.ts:60,102+                                                              | extension socket events                    | avoid custom events if possible; otherwise one handler registration and validator hook                   | conditional           | MED              |
| H10 | packages/socket/src/services/game/round-manager.ts:84-109,238-266                               | leaderboard policy, interludes             | inject round-policy/timeline plan with upstream defaults                                                 | necessary hook        | HIGH             |
| H11 | packages/socket/src/services/game/round-manager.ts:269-340                                      | reveal timeline and payload                | inject typed timeline events around prepared/question/answer stages                                      | likely hook           | HIGH             |
| H12 | packages/socket/src/services/game/round-manager.ts:363-435,454+                                 | team ranking and extension results         | read-only result observer + separate team score projection                                               | likely hook           | MED              |
| H13 | packages/socket/src/services/game/index.ts:61+                                                  | extension session context                  | pass extension config to RoundManager constructor, lifecycle dispose                                     | likely hook           | MED              |
| H14 | packages/common/src/types/game/status.ts:8-82                                                   | new synchronized stage/status              | prefer separate extension event envelope; adding STATUS requires coordinated type/UI changes             | conditional           | HIGH             |
| H15 | packages/web/src/features/game/components/states/Answers.tsx:104+                               | rich answer display                        | render wrapper/slot around existing AnswerComponent                                                      | likely hook           | MED              |
| H16 | packages/web/src/features/game/components/states/Question.tsx and QuestionMedia.tsx             | image reveal                               | wrap existing media rendering with extension effect                                                      | likely hook           | MED              |
| H17 | packages/web/src/features/game/components/states/Responses.tsx                                  | image answers in reveal                    | optional extension visual renderer                                                                       | likely hook           | MED              |
| H18 | packages/web/src/features/game/components/GameWrapper.tsx:36-91                                 | interlude and team overlays                | single typed extension slot; avoid overriding upstream status rendering                                  | likely hook           | MED              |
| H19 | packages/web/src/features/game/components/GameSettingsModal/index.tsx                           | cadence/team controls                      | extension settings slot; settings persist separately                                                     | likely hook           | MED              |
| H20 | packages/web/src/features/game/components/states/Answers.tsx:53-61 and other SFX users          | custom audio                               | central cue resolver and minimal replace call sites                                                      | multiple tiny hooks   | MED              |
| H21 | packages/socket/src/api/routes/games.ts:20-38                                                   | load sidecar for active game               | extension session binding after game creation                                                            | likely hook           | MED              |
| H22 | packages/socket/src/services/auth.ts:32-79, api/routes/games.ts:79+ and handlers/game.ts:78-122 | phone participant                          | use existing authenticated HTTP join + socket event; no source changes for initial proof                 | none preferred        | LOW              |
| H23 | packages/web/src/pages/manager/quizz/$quizzId.tsx, quizz editor save action                     | save extension sidecar                     | extension API called with version checks and rollback on error                                           | hook likely           | HIGH             |
| H24 | packages/socket/src/services/config.ts:saveResult                                               | persist team/interlude results             | independent result sidecar keyed by result ID; may need result ID hook                                   | conditional           | MED              |

## Hard stop requirements

1. Prove no-hook alternative with a spike for each candidate before requesting edit.
2. Record exact patch diff and user approval in UPSTREAM_TOUCHES.md before touching any existing upstream file.
3. Prefer fewer centralized stable seams over many scattered patches, but never build a god-object registry.
4. Preserve upstream public event payloads by default; optional extension events must be versioned and separately validated.
5. Avoid editing common Question.answers or fixed question type enum merely to attach images.
6. Source line numbers are baseline anchors, not permanent addresses. Re-locate symbol before every patch after upstream updates.

## Priority spike order

A. Sidecar round-trip save/load/edit/reorder/delete with zero data loss.
B. RoundManager policy injection preserving default steps and exact timings.
C. Web UI slot proof for editor and player/presenter with original styles.
D. Telephony simulated participant via existing join-ticket and authenticated Socket.IO.
E. Locale resource registration for eight languages.
Only after spikes should an exact minimal patch set be proposed.
