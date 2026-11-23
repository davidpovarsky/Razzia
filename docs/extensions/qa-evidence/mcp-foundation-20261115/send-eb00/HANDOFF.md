# Public send lifetime correction — 15 November 2026

Ready for independent exact-commit re-review. Correction commit is the commit
containing this handoff, after frozen `eb00cae7208d798fcabd4cb8208df341bfb10497`.
Original eb00 source/128-input/35-test evidence and earlier receipts stay unchanged.
The copied independent report SHA256 is
`2e3dfa42389968367b8794e4aec23b12a8ef320af8082887a10e9fd0fcd9a9b0`.
Its before-finding is static: an unsettled public transport send was outside the
work counter. No customer disclosure, principal substitution or live delivery
failure was demonstrated. Independent prior progress/related-ID positive evidence
is preserved in `witness.log` and reviewer stop readback in `release.txt`.

## Narrow correction

Production changes are two transport hooks in `connection.ts` and the small
`RequestLifetimes.retainSend` helper in `request-boundary.ts`. Before handing a
response or related send to `inner.send`, the guard acquires work on each distinct
owning operation. A Set deduplicates response/parent overlap. Its idempotent release
closure runs from finally after the public send promise settles; existing
identity-checked settlement remains responsible for removing only that lifetime.
Thus cancellation cannot free that wire ID or its slot while its write is pending.
Related progress writes also hold their parent, even after handler/response work
finishes. Rejection retains the existing safe terminal close of the owning
connection; another factory is unaffected. No timer, SDK patch, global cache,
protocol change or broader lifecycle redesign was added.

**The guarantee ends at public transport send completion. It does not assert
remote consumption, acknowledgement, negotiated HTTP behavior or physical
delivery.** A send already handed to the transport is not rolled back by cancel.
Existing authorization, strict discovery/schema/rate gates, ID translation,
admission/handler cancellation, authoritative replay API and draft checks remain.

## Actual controlled SDK witnesses

All35 existing cases reran; their nine `.nodecheck.ts` files are byte-identical
to eb00. Six new read-only controlled public-transport cases passed:

1. Hold32 response-write promises, cancel all32, then attempt another call:
   connection budget still denies admission without a33rd verification.
2. A normal SDK Client call uses AbortSignal while its response write is held;
   same-wire-ID reuse is denied before another verification.
3. A schema-error response and its related parent refer to one owner. The write
   holds that owner, then settles once; same-ID reuse reauthorizes as a fresh
   principal and32 subsequent calls succeed with one budget charge per call.
4. Reject a delayed write: fixed safe errors, own connection terminal, no later
   verification there, another factory still usable.
5. Hold a public request-context progress send after its handler and final response
   complete: parent remains reserved and duplicate same-ID admission is denied.
6. Settle that pending progress promise: same-ID reuse reauthorizes successfully.

These are actual SDK Client/McpServer/public Transport cases with synthetic
read-only fixtures. They make no real storage, OAuth, host or remote-read claim.
Parent Vitest intersection remains0; original private coverage9 suites/35 cases
is unchanged; adding one send suite gives10 private suites. Private package glob,
shared Vitest config, manifests, root/isolated lock and dependencies are unchanged.

## Final frozen validation and release

Final namespace `mcp-send-ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9`.
129 exact inputs,32 isolated module files. Manifest SHA256:
`ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9`.
All129 matched after tests and local formatted restore. Later reconstruction archive
`send-inputs.tar.gz` SHA256:
`b9d064818fdeb6e03ab3e8a9e7b6f0ebb1c05d4e830bb71cf0f918d65de95aa5`.
Unchanged isolated lock:
`dc7d7a9c51674163dd26326a9d7f6b58e5978a8eaeb24ed293aad72a5dc6befe`.

Actual final exits: frozen offline install/scripts-disabled0, TypeScript noEmit0,
private `pnpm run test`0, scoped Prettier0. **41 passed,0 failed,0 skipped,0 cancelled**.
Original35 plus6 new cases; final includes the strengthened normal SDK-client
abort witness. The preparation run also passed41 before that test refinement.
No broad parent suite or local functional test was run.

Reviewer stopped was verified before replacement use. Own preparation and final
containers ran sequentially at0.25CPU/2GiB, UID1001, networkNONE, no ports,
production mounts or credentials. Own prior public-registry offline cache/store
only; no registry access or full-root archive. Actual branch source supplies imports.
Host memory/disk/container margin was rechecked, with a2600MiB pre-run disk gate
to preserve the requested2GiB reserve. Final pre-run disk available3961MiB;
post-stop3801MiB. Final pre-run MemAvailable10694MiB. Other allocations unchanged.

Both own containers are stopped; final Running=false,OOMKilled=false. Exit137
is explicit idle-container termination after checks. Allocation released; remote
source/fixtures/evidence preserved. Static audit602 protected files=593 unchanged
+9 preexisting approved seams,0 unexpected mismatches,0 unleased changes and0
prior evidence edits. Raw historical TDS guard remains **FAIL exit1** for32 newly
leased MCP paths, `mismatches=[]`; no edit/waiver. Scoped source whitespace passes.

No full ui:check/build/lint/parent suite/HTTP/Inspector/OAuth/real-host/device claims.
Real HTTP/token/account/consent/durable operation store/recovery/download/renderer/
host gates remain unchanged; accepted SB producer remains pending separate review.
MCP02/03/04/05 and HQ stay OPEN; research MCP01 stays DONE. No push/merge/deploy,
provider change or customer-data action. Next: independent exact successor-SHA
re-review, then manager disposition.
