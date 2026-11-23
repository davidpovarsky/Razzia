# Lane F formatter and remote HTTP batch — 15 November 2026

Source commits on codex/tadazz-hq-mcp-20261115:

- 5685f65: exactly eight formatter-only files. TypeScript5.9.3/Prettier3.9.10
  canonical AST equality; other152 predecessor inputs unchanged. Full private
  TypeScript PASS at matching160-input formatted snapshot. Fresh first-party
  34/34 PASS, separate genuine ad895 initialize/GET200/PUT200 witness PASS,
  scoped format12paths PASS. SDK41 was reused against matching inputs/runtime.
- a7e698b1416d2cbb2385d1441be3e49d6b3b152d: authenticated stateless HTTP
  service and explicit signed-access-token verifier. Final165 source inputs
  match the local worktree exactly after applying five AST-equal formatter
  outputs. TypeScript PASS and private SDK tests53/53 PASS,0fail/skip/cancel.
  This reruns the original41 and adds12 token/HTTP cases.

The HTTP adapter uses the official SDK createMcpHandler, modern protocol
negotiation and stateless legacy fallback, sharing the existing eight schemas,
registrations and dispatcher. It adds protected-resource metadata, exact
HTTPS/Host/Origin checks, streamed body bounds, OAuth challenges, scoped verified
authority and bounded cancellation accounting. The JWT verifier accepts the
explicit Tadazz at+jwt profile with configured public keys and live grant/account
callbacks. No root dependency/importer/lock or upstream file changed.

## Executed, reused and incomplete

Final immutable evidence under runtime-01/server-receipts:

- 15-accepted-format.json/.log: five TypeScript AST-equivalence comparisons.
- 16-accepted-typecheck.json/.log: direct pinned Node/TypeScript invocation0.
- 17-accepted-sdk-tests.json/.log: direct pinned Node/tsx invocation53PASS.
- accepted-formatted-input-manifest.json SHA256
  b32bfa99d245f6aab1d9a813882138a235962e81378dda58df1d216b32c4b471.
- final-source-dependency-check.json: all165 source hashes plus12 actual
  dependency versions/package hashes and entry hashes, unchanged private lock.
- 03-typecheck.json/.log: exact160-input formatter successor TypeScript0.
- first-party34-compat-format-reuse.json and sdk41-reuse.json explain matching
  reuse separately. Fresh34/compat/format receipts are in ../server-receipts.

The cancellation witness now waits until all32 real verifier callbacks have
entered before aborting, yields an event-loop turn, then proves the next request
is denied while verification remains unsettled. No physical host installation,
Inspector UI, browser widget, real OAuth issuer or private account grant is
claimed from these protocol tests. HTTP test persistence uses a clearly
test-only memory repository; it is not durable account storage acceptance.

The service still requires actual OAuth authorization-code/PKCE issuance,
refresh/revocation/consent/account bridge and a real tenant DraftRepository.
Native save/download and the actual executable D/E Preview remain unavailable.
The UI resource is the preexisting honest empty placeholder. G is NOT ready to
start from this batch. Original MCP02/03/04/05 source GIDs remain OPEN:
1220539638955304,1220539632251971,1220539611695147,1220539638962739.
Completed research was not reopened. No widget/renderer/clock/schema duplication.

## Preserved failures and source custody

The initial disk admission failed before creating a remote path/container. It
is retained as transport-attempt01-provisioning-failure.json. After manager
reconciled the idle integration reservation, the512MiB formatter container ran:
AST8/34/compat/format passed, TypeScript exited137/OOM. The exact same formatted
snapshot then passed full TypeScript at1024MiB; the old OOM remains unchanged.

Remote candidate attempts08/11/14 each retained52PASS/1FAIL. The first exposed
cancellation400/401 classification. Temporary additional lifetime checks denied
a legitimate request and were removed. The final passing source includes the
correct cancellation mapping and the stronger genuinely pending verifier test.
All attempts and their separate RAM source roots were preserved through final
verification. Original ad895 producer snapshots were never formatted/modified.

An intermediate pnpm run in a second RAM root unexpectedly invoked pnpm's
automatic pre-run dependency check: it reported already-up-to-date and an
ignored-esbuild-build error before running the script. That log is retained.
Final accepted commands invoke pinned Node/TypeScript/tsx directly; they do not
run pnpm, install, resolve, approve builds or use a network. The actual final
package versions/entry hashes and frozen private lock were verified afterward.

Both owned containers are terminal/PID0 and compute claims released. The second
container's natural exit1 belongs to its immutable initial52/53 dispatcher,
not the separately verified final candidate53/53; terminal.json says this
explicitly. Neither exit was relabeled green. Final container OOMKilled=false.
Conservative cumulative disk accounting6377472B includes two retained2MiB Docker
allowances. All source/evidence/failed receipts are retained; no cleanup occurred.
Production, QA pair, metadata keeper/RAM volume and backups were untouched.

## Usable dependency provenance for manager parent TypeScript

Do not add source/type stubs for missing MCP modules. The actual retained union
descriptor is:

`/home/ubuntu/tadazz-hq-qa-20261115/fixtures/integrator-root-85e-20261115-public-union/descriptor.json`

Its validated index is runtime-v12/v11/index.db under that fixture, SHA256
ab1feb01feab44b1d2dc7c58eb6299dd24919753dd25dc16893cd5451dcdee89.
Metadata inventory459 files is SHA256
6f2126891ed74af76c8b6644a25e0faec29e438d248107010d808bbd49649c80.
Mount metadata RAM volume integrator-root-85e-20261115-metadata-ram READONLY;
its existing keeper remains manager-owned. Hydration receipt:
`/home/ubuntu/tadazz-hq-qa-20261115/evidence/integrator-root-85e-20261115/metadata-vite-repair/hydration-receipt.json`.

Public CAFS body roots, mounted READONLY:

- fixtures/sb3-assets-755faf0f2e2719e20f9711231a0bf84da95b6b4a3a618e2a07827ffd78cf8aa9/pnpm-store/v11
- fixtures/mcp-send-ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9/pnpm-store/v11

The existing source helper materializes an own RAM index copy and CAFS symlinks,
with metadata symlinked read-only, then performs one frozen/offline/scripts-off
isolated bootstrap. Exact mounts/image/index/inventory/commands are in launch.json,
readonly-mounts.json, cache-pin.json and01-frozen-bootstrap.json. The pinned
private lock SHA256 is
e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838.
SDK server/client/core2.4.0 and ext-apps2.1.0 are real installed packages.
No new package is requested for this batch.

The fixture dependencies existed only in its owned RAM and are gone on terminal
exit; no new keeper/service was left running. Manager can reuse the same retained
cache/metadata recipe for its exact integrated source/lock and combine it with
the genuine existing full-root dependency donor. This is provenance for SDK
hydration, not a claimed passing combined parent TypeScript run.

Full runtime receipt archive SHA256
2a94ecdc584ba66019743281c673c157dbd229d7a67e314e046e376f9b1e1d87.
The original formatter archive is also retained locally, SHA256
d9900919ae20d8cead9e64c4dba168ab052947e687e5332d203af73a9b1d4e19.
