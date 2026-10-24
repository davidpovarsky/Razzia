# Handoff template, verification gates and change control

Every role writes its own handoff at docs/extensions/orchestration/handoffs/<role>/WAVE1.md. Do not edit a central ledger or another role's handoff.
Required fields:

- Role; worktree absolute path; branch; baseline hash; final commit hash; UTC timestamp.
- Scope and changed paths; explicit statement of no shared upstream edits.
- Public contract exports, schema versions, fixtures and usage examples; unresolved decisions with severity and owner.
- Tests executed (exact command, exit code, counts) and tests NOT run; no claims from old baseline as current evidence.
- Security/privacy and backward-compatibility concerns; expected next reviewer; ready/not-ready with reasons.
- Any RFC for upstream change: H-ID, path/symbol, no-hook alternatives tried, minimal proposed patch, risk, test plan. NEVER apply without approval.
- Git status before/after, diff --check, no secrets.

## QA gate checklist

1. No unowned paths in commit: git show --name-only --format= HEAD.
2. No accidental upstream diff. Disabled extension yields original behavior, original quiz data intact.
3. Pure extension tests pass; relevant unit/integration and type checks pass; no mocks claiming production Yemot verification.
4. Versioned schema validation, idempotent handlers, race/replay, auth, disconnect/reconnect, partial save, locale fallback.
5. Cross-platform Windows path/CRLF and accessibility check. Avoid exposing raw caller phone number.
6. 217 original unit tests and 46 original browser E2E were green at G0; rerun and record ACTUAL counts after integration. E2E requires 3000/3001 exclusively.
7. 8 locales; no untranslated keys or English hard-coded in user-facing components.
8. Owner approval required for hook, integration, network exposure, push, merge or paid service.

## Handoff state labels

DRAFT = not ready; REVIEW = code complete but not independently verified; ACCEPTED = reviewed and tested on integration branch; BLOCKED = decision/tool/capability missing. Only Tomer marks integration state, only Roni records QA verdict; owner makes final approval.

## Resource limits

Windows ~16 GB RAM, ~45 GB free at planning. Only one Playwright browser suite at a time, one full build at a time, one local game dev server on ports 3000/3001. Each agent can do lightweight independent tests. Never clean/delete other worktrees or shared caches automatically.
