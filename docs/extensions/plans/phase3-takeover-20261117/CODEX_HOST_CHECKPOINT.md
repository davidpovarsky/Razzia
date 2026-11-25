# Native host takeover checkpoint

Active conversation: `01a1e9e9-ad5b-77a3-bafe-bcedce32246a`.
Starting source: `34cfd464ac0bba432701b87f10f4f8388d665066`.
Release: **NOT_READY**.

Owner subsequently explicitly authorized ordinary safe production deployment,
remote HTTPS/MCP/OAuth routing and PRIVATE connection in the authorized ChatGPT
account. This supersedes the original no-deploy/no-connect gate only; source
qualification, safe backup/rollback and genuine account authorization still
require actual evidence. No deployment or connection has yet occurred.

## Preserved source and concurrent writer

Recovery branch `cez/1e96bb6f` remains preserved. Its latest f6fc339 diff
against d85 changes only three exact Error matchers. Linux/ext4 qualification
is NOT_RUN here: Docker unavailable, WSL denied, SSH unavailable in sandbox.
No recovery runtime acceptance is inferred from historical 7/8.

Cancelled consent worktree `cez/fd341b34` remains read-only. Its Studio change
correctly references the existing `extensions/src/components/native-save-consent`
page. No WIP acceptance is inferred.

Another conversation, `01a1e9e9-4528-72e2-ab05-2e57e5d401a7`, was discovered
writing Recovery files in this same worktree. Owner requested stopping it.
App readback reported an interrupted turn but recent commands/file changes;
the stop-message tool was denied with `requires approval, but approval policy
is never`. Its files must remain preserved and unstaged by this conversation.

## Pre-edit scope: static web fallback only

Adopt/review the cancelled WIP `native-host/static-site.ts` into this branch;
add dependency-free tests in `extensions/qa/phase3-native-host-static/`.
The WIP returns SPA HTML for `/mcp`, `/oauth/authorize` and unknown discovery
paths if it is used as a fallback without the enabled protected dispatcher.
Reproduce before repair. Reserve machine paths before static files or SPA
fallback, including configured machine path predicates. Keep this handler
unmounted until the entire native host composition is qualified. No editor,
packages, global CSS, data schema, credentials or deployment changes.

This is a local static-fallback/security component gate, not OAuth, HTTP
listener, Studio browser, installed ChatGPT, or full-show acceptance.

Additional reviewed scope: use the existing root consent-header constant on
actual consent HTML GET/HEAD responses, without changing the shared constant,
Studio/editor routing or CSS. Add a read-only bounded endpoint preflight utility
and adversarial document tests; it does not authorize or install a connector.

Git staging is BLOCKED: shared Git metadata lives at
`C:/Users/DAVID/Code/Razzia/.git/worktrees/tadazz-phase3-codex-takeover-20261117`,
outside the sandbox's writable roots. `git add` failed creating `index.lock`.
No new commit or source-SHA acceptance is claimed.

## Final local readback

The duplicate conversation's final message now confirms it stopped further
changes and preserved its work without a commit. No process was killed.
Reviewed Recovery changes include a stronger foreign-storage-ID guard than the
preserved D branch. A test-only resolver follows the existing tsconfig paths
without module doubles or production aliases. Real recovery invariants3/3 and
original caller suites52/52 pass on Windows. This does not qualify ext4 8/8.

Final host/preflight16/16, focused types/lint/configured format and three UI
checks pass. Freeze remains FAIL23. Exact commands and source hashes are in
`native-host-evidence/51e33c1f-4ce9-4010-b91f-d2bf781a7a57/receipt.json`.
Seven original Asana task descriptions were updated and independently read back
with exact note preservation and completed=false; see ASANA_TAKEOVER_READBACK.json.
No production deployment, connector connection or new commit has occurred.
See DEPLOYMENT_AND_PRIVATE_CONNECTION.md for the remaining sequence and access.
