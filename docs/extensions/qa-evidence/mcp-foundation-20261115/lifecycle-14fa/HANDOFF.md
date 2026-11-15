# MCP lifecycle / private runner correction — 15 November 2026

Ready for independent exact-commit re-review. This is the commit containing this
handoff, following reviewed module `14faea86a7c22a16cb4ff5391e4e3c70aaea62ec`
and accepted documentation-only precision `d46a0cacfc52c42d96034c1f9a529275bf8b2a6c`.
Neither original source snapshot nor its125-input/27-test receipts were rewritten.
Copied independent report SHA256:
`6700ff33fb8a8cb3a024b1d960f6cad3e2e4d77203190126d9cb2b5aa523a217`.
Its cancellation finding was source-based; do not describe a prior runtime failure
or customer incident as observed. New focused runtime witnesses are recorded here.

## Request lifetimes

- `request-boundary.ts` owns distinct, bounded per-connection operations. Admission
  occupies a slot before asynchronous ingress/verification/limiter work. Cancellation
  retires authority but retains occupied work until its promise actually settles.
  A valid forwarded tool also remains accounted for until its handler settles.
- `connection.ts` translates each incoming SDK request to a unique internal ID and
  restores the original client ID on outgoing responses and related transport
  options. Notifications/cancellation are translated to that same owning operation.
  External client IDs and all business/data/wire payload IDs remain unchanged.
  Other SDK request responses cannot accidentally complete a tool's lifetime.
- Cancellation during admission prevents later dispatch. A cancellation predating
  SDK controller creation is replayed through the public notification seam when
  a queued callback obtains its public context. `context.mcpReq.signal` is observed
  during execution. The factory's guarded callback finally settles handler work,
  including the SDK's reply-suppressed abort path. Cancellation adds no rollback
  semantics to an already committed legitimate operation.
- Terminal cleanup checks the owning operation identity before deleting maps.
  Retired internal IDs never repeat, so late SDK completions cannot attach to a
  newer same-client-ID operation. The32-slot bound includes unsettled cancelled
  auth/handler work; no global cache or timer forgets it.
- Close becomes terminal before awaiting the underlying transport, clears authority,
  and notifies the SDK even if the underlying close rejects. Late async admission
  success/rejection cannot dispatch/send. Rejected send/close reports fixed safe
  errors; duplicate active IDs close only their own connection.

The factory still exposes only connect/close. Public SDK Transport, cancellation
notification and context-signal APIs are used; no private SDK method, installed
source, permissive schema or root/shared setting was changed. Source provenance
and the actual installed SDK abort/suppression/finally excerpts are retained in
`preparation/sdk-public-api-provenance.json`. Previously reviewed auth-before-tool-
schema, single budget charge, strict discovery, authoritative replay API and
canonical-content/summary checks remain in place and are rerun.

## Private Node runner

All8 original Node-owned `.test.ts` files were renamed to `.nodecheck.ts` with
**identical file bytes**. `rename-before.json` and `rename-proof.json` bind paths,
sizes, SHA256s, the parent config hash and private script. The parent Vitest
`src/**/*.test.ts` intersection is0. The original private coverage is8/8; adding
one lifecycle suite makes9 private files total. Only the private package's glob
changed. Shared Vitest config, root scripts/lock and isolated lock are unchanged.
Actual final invocation: `pnpm run test`, expanding to the recorded private
`tsx --tsconfig tsconfig.json --test --test-concurrency=1 tests/server/*.nodecheck.ts`.
No broad parent suite was run merely for renaming.

## Actual final server evidence

Final source namespace: `mcp-lifecycle-96c4d3c9aa5187c1dd164876f0483bc28dc8d22b6eee4103e3202aae1b252623`.
128 exact inputs,31 module files. Manifest SHA256:
`96c4d3c9aa5187c1dd164876f0483bc28dc8d22b6eee4103e3202aae1b252623`.
All128 hashes matched after tests and local formatted restore; original8 renamed
suite hashes still match. Later reconstruction archive `lifecycle-inputs.tar.gz`:
`676249c5a6ed05ddd3b1a5e566fa81c88d25a991198a0ceb5554e2a4a9d5e3fa`.
Isolated lock remains
`dc7d7a9c51674163dd26326a9d7f6b58e5978a8eaeb24ed293aad72a5dc6befe`.

Actual final exits: frozen offline install/scripts-disabled0, TypeScript noEmit0,
private Node suite0, scoped Prettier0. **35 passed,0 failed,0 skipped,0 cancelled**.
The original27 cases reran with unchanged bytes. Eight added read-only lifecycle
witnesses cover pending-auth cancellation/capacity restoration,32 cancelled but
unsettled verifiers remaining bounded, running-handler cancellation restoring32
slots after settle, duplicate tool/public IDs, close-before-late-auth-rejection,
same-ID reauthorization, public SDK abort signal/completion behavior, rejected
send/close and another factory remaining unaffected. No real account/storage/
side-effect operation is used in these lifecycle fixtures.

Reviewer container STOPPED was verified before this replacement allocation.
Preparation and final runs each used one own0.25CPU/2GiB, UID1001, networkNONE
container; no registry access, ports, production mounts or credentials. Own earlier
public-registry offline store/cache only; actual branch source satisfies imports.
Host margin was rechecked: final pre-run MemAvailable10974MiB, with container stats
recorded, without changing other workers. Image/tooling remains pinned.
Both own containers are now stopped; final readback Running=false,OOMKilled=false.
Exit137 is explicit idle-container termination after completed checks. Allocation
released. All source/fixtures/evidence remain preserved under the QA root.

Static source preservation:602 protected files=593 unchanged+9 preexisting approved
seams;0 unexpected mismatches,0 unleased changes. Previous evidence, parent Vitest
config and root/isolated locks unchanged. Historical TDS guard still **FAIL exit1**:
31 newly leased MCP paths, `mismatches=[]`. Guard unedited and unwaived; raw output
retained. Scoped source whitespace passes. This audit is read-only source inspection,
not a functional Windows run. No full ui:check/build/lint/CI/HTTP/Inspector/real-host/
device acceptance is claimed.

MCP02/03/04/05 and HQ stay OPEN; research MCP01 stays DONE. Real HTTP/Origin/TLS,
OAuth/private operation storage/consent durability/recovery, downloads, accepted
SBport3/identityRule2 producer/renderer and actual host acceptance remain gated.
No SB schema/engine clone, provider/customer migration, push, merge or deployment.
Next: independent exact successor-SHA re-review, then manager disposition.
