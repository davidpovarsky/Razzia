# M3A source candidate and bounded dependency overlay

Status: SOURCE ONLY. No server/install/browser/functional validation grant has
been used for this stage. Existing MCP implementation tasks and HQ remain OPEN.
The approved proposal is preserved byte-for-byte in FROZEN_PROPOSAL_5684.md;
OWNERSHIP.json predates source edits. This is a new isolated first-party adapter,
not acceptance of MCP host OAuth, native saving, previews or export delivery.

## Exact source and preservation

`source-overlay-manifest.json` lists every new/changed application input and its
bytes/SHA256, the accepted129-input manifest hash, complete union input count,
additional external imports and any unresolved internal imports. Reuse accepted
60d source/dependency artifacts by immutable hash; deliver only these listed
source overlay files. Do not clone a repository, .git, docs tree, node_modules,
root dependency store or another worktree. No old-image application source or
other branch aliases may resolve application imports.

`static-source-inspection.json` records exact frozen module/protected-file
comparisons, source lease, root/isolated locks and parent Vitest discovery.
It invokes the unchanged raw freeze guard and retains stdout/stderr/exit1:
the historical TDS allowlist rejects manager-leased MCP paths. A clean protected
hash audit does not turn that raw result into PASS. The guard/baseline/allowlist
have not been edited. `static-attempts.json` retains the Windows Python shim and
UTF-8 inspector failures; neither was an application test.

## Small dependency delta — resolution NOT DONE

| Private package change | Exact pin | Reason |
| --- | --- | --- |
| dependency addition | hono4.13.13 | Actual existing manager middleware/JWT and new Hono adapter |
| dependency addition | http-status-codes2.3.0 | Actual existing middleware import |
| Node types replacement | @types/node26.6.5 | Actual existing account DB's node:sqlite options; no shim |

These match this branch's root frozen lock/catalog. Existing SDK pins, Zod,
UUID, Socket.IO, TS5.9.3, tsx4.21.0 and the original test command are unchanged.
The new package export and `test:first-party` command are isolated additions.
Private tsconfig adds only seven exact actual socket source aliases plus new
include paths. No root/global/wildcard alias is added.

The isolated lock intentionally remains the accepted60d file. It does NOT yet
describe the changed private package. A frozen install is not currently ready
and must not be reported as passing. Generate that one lock on a separately
granted server runner, preserve initial attempts and independently freeze/recheck
its resolved graph. Do not hand-splice lock resolutions or alter the root lock.

Use immutable accepted SDK/root dependency caches read-only. Build an OWN small
writable overlay for the three pins and any exact required Node-type transitive
dependency, with read-only per-package links to already verified cached SDK/root
dependencies. Prefer existing verified public artifacts/metadata from those
caches. Never copy the whole store or install the full root workspace.
If any of the three packages/metadata is absent, obtain a specific public-registry
resolution grant first; use an empty npm userconfig, scripts disabled and no
ambient private credentials. Proposed new-dependency budget: <=16MiB compressed,
<=64MiB expanded, plus tiny lock/metadata staging. Measure and stop/report before
exceeding this bound. Cache reuse must not write into accepted dependency trees.

Use only the allocated new source/evidence/fixture namespace. Proposed resources
are one network-none functional container capped0.25CPU/2GiB after dependency
prep, subject to a fresh root grant and live capacity check. No allocation or
server directory is claimed by this document. No public port, production mount,
real account, provider, key or customer configuration is permitted.

## Coherent validation after grant

1. Recheck full baseline/overlay hashes and actual Node version. Confirm the
   supplied modern Node supports actual account-db node:sqlite APIs; keep actual
   sources/options unchanged. Bind explicit exact tsconfig aliases only to the
   delivered source. Use direct existing tool executables, never an implicit
   local pnpm/install/compile command.
2. Resolve/freeze only the private lock in own staging with the minimal cache
   overlay above. Record integrity/provenance and a frozen offline reinstall
   result, independently from functional test exits.
3. Run private typecheck and the four new first-party `.nodecheck.ts` files.
   They use synthetic env/root before any actual env/auth DB imports. Tests
   exercise real manager JWT/mint/revoke/sid, two accounts, real SQLite replay,
   CAS, rollback/audit, hot journal crash, WAL/corruption, symlink/hardlink/owner
   isolation, stream cancellation and 32 admitted request lifetimes. No actual
   customer account file or secret may be read by a tool or printed.
4. Trace successful, absent and real-hot-journal GET cases for actual filesystem
   write syscalls to private draft families and native sentinels. Existing account
   verification has its own WAL/SHM reads/locks; report those separately and do
   not claim zero writes across that service or OS access-time metadata. Verify
   byte/mtime/directory snapshots too. Do not use immutable SQLite mode, GET
   repair or fixture cleanup to hide a modification. Preserve crashed/corrupt
   fixture files until evidence capture is complete.
5. Repeat the accepted41 SDK tests once at this dependency boundary: Node types,
   private package and tsconfig/source graph have changed, which is a concrete
   reason for this rerun. Preserve the original test command. Add no tests to
   parent Vitest's `src/**/*.test.ts` glob.
6. Run scoped formatter and exact source/freeze/lease checks, preserve every
   first failure and actual command exit separately from container holder stop.
   Keep the original raw TDS guard result. Hash source before/after validation,
   report OOM/running/exit state, then release the allocated runner.

## Runtime boundaries still open

`createFirstPartyApp` is async and prepares the actual existing account handle
at explicit startup, before any HTTP request. It requires an existing regular
account DB; the original account service still owns bootstrap/migration. The
server must stop admission and drain requests before closing that service.
An in-process actor closing/replacing it inside the original verifier's own
await cannot be made atomic from this downstream adapter without a separate
approved upstream seam. No such seam is added or claimed here.

Principal revalidation occurs after body await, on replay, before commit and
before private return. Distinct account and draft SQLite DBs do not make
revocation linearizable: the supplied revoke-at-COMMIT test expects committed
rows to survive while the response is denied. This is an explicit limitation,
not a rollback promise.

Save-intent HTTP409 has `ok:false`, `DEPENDENCY_UNAVAILABLE` and `PENDING_C1`.
It reserves no native ID/name/path, confers no consent, and stores native_id NULL.
Actual C1 publication and R2 logical/native root identity integration require
their accepted source and separate lease. No native getter/import is called.
Accepted SB81d5 is absent from this branch: reuse only the accepted MCP-authored
validator for drafts; pause only an eventual SB integration step for a clean
manager merge. Never copy/alias SB/R2 WIP or duplicate schemas/projection.

Actual host OAuth/client grants/private scope enforcement, accepted renderer,
save_game success, downloads, protected mounts and release remain OPEN.
