# Tadazz design system — sequential checkpoint

Canonical mandate: [full specification](TADAZZ_DESIGN_SYSTEM_UI_UNIFICATION_AGENT_PROMPT_2026-11-10.md).
Asana parent: `1220402777392717` (OPEN). Account verified: requested owner account.
Single primary coding session. No subagents, push, merge, deployment or production writes.

Worktree: `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110`.
Branch: `codex/tadazz-design-system-20261110`.
BASE_HEAD: `fb6c7631999f33c8fb47638a99920e450f326fbf`.

| Phase  | Task             | Status      | Evidence / next action                                        |
| ------ | ---------------- | ----------- | ------------------------------------------------------------- |
| TDS-00 | 1220402430946120 | VERIFIED | [Baseline](TDS_BASELINE.md); 1 browser scenario passed, 20 captures, 602 hashes |
| TDS-01 | 1220402455305251 | VERIFIED | [Policy](TDS_POLICY.md); 55 existing compatibility tests passed |
| TDS-02 | 1220402647256448 | NOT_STARTED | Inventory and dependency map                                  |
| TDS-03 | 1220402777623967 | NOT_STARTED | Tokens and scopes                                             |
| TDS-04 | 1220402719463680 | NOT_STARTED | Canonical React UI                                            |
| TDS-05 | 1220402777822480 | NOT_STARTED | Live catalog                                                  |
| TDS-06 | 1220402777861386 | NOT_STARTED | Site / Studio                                                 |
| TDS-07 | 1220402729693747 | NOT_STARTED | Stage / join                                                  |
| TDS-08 | 1220402719392041 | NOT_STARTED | Host controls / modals                                        |
| TDS-09 | 1220402539686302 | NOT_STARTED | Roster / packages                                             |
| TDS-10 | 1220402539658409 | NOT_STARTED | Platform motion                                               |
| TDS-11 | 1220402430879047 | NOT_STARTED | Naming compatibility                                          |
| TDS-12 | 1220402539686110 | NOT_STARTED | Full QA / handoff / release gate                              |

Run `node extensions/qa/tds-boundary.mjs` at every checkpoint. The guard rejects
all `packages/**` and editor modifications and paths outside the locked allowlist.
It hashes 602 protected files, including all graphical site assets. Permission
for an upstream seam must be explicit and recorded before changing this guard.
An untouched source tree alone is insufficient: editor production-bundle visual
and behavior checks are separately required.

Session checkpoint: dependencies installed with frozen lockfile, no lock changes.
TDS-00 verified in isolated remote container `tadazz-design-system-qa-20261110`
(2 CPUs / 4 GiB / 768 PIDs / no published ports or production storage).
No application implementation yet. TDS-02 is the next exact action.

TDS-00 evidence commit: `10c41075b67c129222e0fd13e231482091ec14ae`.
Checkpoint follow-up removes trailing whitespace from copied QA logs (their
messages/results are unchanged), records the local guard output and Asana sync.
Initial staged whitespace check flagged only those copied log spaces; the
follow-up check passes. The raw server logs remain in the isolated QA directory.

TDS-01 BASE_HEAD: `1209626d651e6858a17c339a05ae86462c257738`.
Changed AGENTS.md, GEMINI.md and WORKING_RULES.md with current scoped precedence;
added TDS_POLICY.md (brand/locales, naming, compatibility classes and freeze).
PASS: 55 existing authored JSON/XLSX/preflight/theme round-trip/branding tests
across 5 files in the isolated remote container; report
`qa-evidence/design-system-20261110/phase-01-contracts.json`.
PASS: 602-file boundary guard / `git diff --check`.
Only guidance/evidence changes in this phase; production rendering code remains
byte-identical, including every editor dependency. No new visual comparison
claimed for this documentation-only phase. Next: source inventory/dependency map.
