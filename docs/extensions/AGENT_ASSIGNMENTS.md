# Active Antigravity agent assignment — V3

This file supersedes the former seven-agent role roster. The old role names were adapted from Maktabah and MUST NOT bring native Swift/iOS rules into this web project.

| Active role | Scope                                                                                                            | Original responsibilities consolidated |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Tomer       | Backend, shared schemas, storage, gameplay, teams, leaderboard, API, integration, shared manifests               | Tomer + Eitan + Yael                   |
| Maya        | All web/editor UI, media, reveal, presentation, audio, i18n and frontend hooks                                   | Maya + Dana                            |
| Noam        | Provider-neutral telephony bridge, Yemot disabled adapter, local keypad simulator, security and phone load tests | Noam                                   |
| Roni        | Optional independent QA, only after integrated product exists                                                    | Roni                                   |

One persistent Antigravity conversation per active role, in the existing separate Git worktree. No new chat for each wave. Open Tomer alone first with PROMPT_TOMER_01_BOOTSTRAP.md. After bootstrap and coordinator Sync-AgentBranches.ps1, start Tomer step 2 and Maya/Noam concurrently. Roni optional after integration via Prepare-QA.ps1.

This is an IMPLEMENTATION plan. Research is complete in orchestration docs 10/11/12. Agents code, test, fix and commit; they do not re-research or choose architecture. Exact exclusive file ownership is in docs/extensions/orchestration/13_FILE_OWNERSHIP.md. No subagents unless user explicitly requests them; no Asana writes without request.
