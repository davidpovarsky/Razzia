# S01 approved implementation and retest snapshot

Execution update: see [S01_RESULTS.md](S01_RESULTS.md) for the final measured 10PASS/5FAIL, native type-check PASS and Node-only harness filename. This plan is retained as pre-execution evidence.

Implemented only the manager-approved two hunks in `packages/socket/src/api/extensions/game-routes.ts`, from the exact reviewed S01 patch. Pre-edit authority, baseline blob and rationale are recorded in UPSTREAM_TOUCHES.md. No controller/storage/schema/global configuration source changed.

`S01_SOURCE_AUDIT.json` proves the protected diff equals the approved artifact exactly and all thirteen original actual-backend test bodies are unchanged. Two additional actual-route controls cover configured initial/current polling, a fresh different call without supplied roster, cached stale denial with no private fields or roster mutation, and valid disconnected rebind preserving earned authoritative score and stable client/roster count.

Local route Prettier check PASS; TypeScript syntax transforms of route/harness PASS with zero warnings; shell/JS syntax and eight archive safety tests PASS. Actual scoped TypeScript semantic checking and fifteen-case backend execution will run inside the assigned remote snapshot at 0.25 CPU / 1 GiB; results are not yet claimed here. The check uses real TypeScript against the route plus global/options diagnostics, not a full-project CI job. The runner continues to collect all actual cases even if type checking fails and records both exit codes separately.

Generic `tds-boundary.mjs --files-only` was executed and exited 1 solely for the separately approved API file. Its original UI freeze manifest/allowlist is unchanged. The exact S01 audit supplies the bounded manager-approved seam proof; this is not a generic freeze PASS. Preserve the raw guard receipt.

The remote runner now selects the existing image cache explicitly with copy import, uses direct installed Node/tsx, verifies all new committed inputs before/after and workspace links into /work, and retains source/type/test/exit receipts. New reserved host paths are source/phone-s01-<SHA>, fixtures/phone-s01-<SHA> and evidence/phone-s01-<SHA>. Container paths remain the harness's already validated phone-/phone-api- prefixes, mapped only to these new dedicated host paths. The safe extractor accepts this exact additional approved source namespace, never an arbitrary destination.

Expected original-case change: API02/03/06 should pass; API07/08/09/10/11 remain visible failures pending caller-correlation and lifecycle disposition. No broader green, provider proof or capacity claim is authorized. No original case/timeout/assertion was weakened. API07/08 route proposals and versioned lifecycle design will be separate unapplied review artifacts.
