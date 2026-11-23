# Native Save: durable association across the existing C1 and F owners

Sole-manager contract disposition, 15 November 2026. This routes a concrete integration blocker to existing owner B (C1/storage) and F (MCP/first-party). It creates no new agent or approval stage. No implementation or test result is claimed by this document.

## Observed gap

At accepted manager product source `f9bad23a638522d3d3f50cd16171d9d0ffd6f97c`, `creation-reservation.ts` stores the returned empty reservation capability in a process-local WeakMap. Publishing marks the private intent committed, creates the result and calls `resolveSlot`, which removes the resolved private intent before returning. `NativeCreationPort` currently exposes only `assertScope` and `create`; the inferred factory also has reserve/publish.

F's existing `createNewWithConsent` contract requires an authorized durable replay-or-new decision before reading a possibly changed current draft, bound to owner/grant/tool/idempotency key/input digest and exact selected revision. A process loss after native commit but before F records its outcome cannot be reconciled through the current public C1 seam. Neither an empty restarted capability nor a fresh create-new attempt establishes the original target/result. The existing unavailable state for native Save remains correct.

## Ownership and implementation direction

B owns the minimal additive native seam and its storage/recovery evidence. F owns first-party grant/session checks, exact-revision Save consent, the existing tenant operation ledger and consumer adapter. Neither edits the other's source. Work can proceed independently against a small shared typed proposal and isolated fixture; actual production composition remains subject to existing acceptance and authorization.

Keep existing create/reserve/publish behavior compatible. Add an optional trusted-host seam rather than making C1 depend on OAuth classes or tool-wire schemas. Before physical native publication, durably associate a bounded opaque operation binding with one collision-safe reserved native target and immutable intended content. F derives that binding from its authenticated operation tuple and exact approved snapshot; raw model arguments, caller-provided filesystem paths, callbacks and current-draft rereads do not establish authority. The owners choose the concrete types together; no new 0.1 tool schema or duplicate grant/consent database is needed.

Provide an authenticated-scope reconciliation lookup that can distinguish no established operation, reserved/in-progress, durably committed result, and retained uncertainty. Equal operation identity with changed binding/content must be rejected. A committed result must remain durably associated with that operation across process loss and successful private-intent cleanup. A persisted original outcome is distinct from the current contents of a quiz that may later have been edited/deleted. Never treat discovery of a quiz ID or an arbitrary existing file as proof of the operation's success, and never overwrite or restore later user edits.

F records its operation before crossing the seam, reauthorizes grant/session/owner and exact Save consent for the applicable new/replay rules, and durably records the returned result. Retrying the same authorized operation reconciles that same native target; it cannot generate a second target because F lost its response. Ambiguous or foreign evidence remains unresolved and preserved. This does not authorize automatic repair, customer-data migration, or weakening C1's existing cooperating-writer/fencing boundary. Keep an unambiguous recovery witness for the period in which a caller may retry; do not let successful cleanup or expiry silently erase the only cross-seam outcome.

## Focused acceptance

Use existing isolated local/private fixtures. Show process loss at the new durable binding/reservation boundary, after native commit before F outcome persistence, and after F outcome persistence before the reply, followed by real fresh-process lookup/retry. Assert one operation/target/result, no duplicate native create, no clobber, and unchanged native/sidecar sentinels. Exercise mismatched owner/grant/key/digest/revision, foreign/tampered/unresolved witnesses, lost CAS or cooperating-writer contention, grant/session revocation and changed current drafts under the existing replay policy. Preserve initial failures. No old broad suite, installation, provider, customer or production action is requested.

The two owners should surface only a concrete incompatible shared contract or ready source/evidence handoff. No repeated ACK or manager approval is required for this already scoped implementation.

## Independent F continuation

F can continue its original `export_game` delivery independently: bounded exact-revision snapshot in the existing tenant operation ledger, explicit injected export-rights policy, short-lived domain-separated encrypted download capability, and live grant/session revocation checks on delivery. Ordinary export adds no new per-export consent; native Save consent and native creation remain separate. Keep the existing 0.1 schema. Real root routing, TLS and distinct persistent key custody remain the sole manager's host-composition responsibility, not a claim that they are already deployed. G remains gated by actual usable MCP and Preview evidence.
