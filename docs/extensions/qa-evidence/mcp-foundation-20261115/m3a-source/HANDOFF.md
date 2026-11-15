# M3A — source candidate ready for validation planning

Owner chat: 01a1dd19-f64c-7193-8a74-9ad7b2c66e2d.
Source base5684ec668ad06f865d07119ca6d176bca0789d5b; accepted SDK
source60d289821df631d55c91d48f4f753197d85d0041 remains unmounted/frozen.

Implemented only the approved new first-party sources/tests and isolated package/
tsconfig metadata. The async unmounted Hono adapter reuses actual manager JWT,
live account/sid and ALS middleware. Runtime binding/principal capabilities
cannot be caller-constructed. Explicit existing account runtime preparation
happens at startup; a closed prepared handle denies requests. Request ingress
has exact HTTPS Host/Origin, no forwarded trust, bounded headers/URL/body and
anonymous lifetime/rate admission. Cancellation awaits public stream settlement.

An explicit per-account SQLite draft store provides real canonical create/read/
CAS, durable session/operation/key/digest/outcome/audit transactions and replay
before fresh revision lookup. GET uses rollback-mode read-only SQLite, rejects
all journal/WAL/SHM and unsafe paths, and does not initialize/repair/native-read.
Save preparation returns HTTP409/ok:false/PENDING_C1 and native_id remains NULL.
Native/enhanced envelopes are rejected before allocation. No C1/R2/SB WIP copied.

Actual evidence for this SOURCE stage:

- Formatter3.9.10 completed for16 source/metadata files; a final test receiver
  annotation was formatted separately. This parsed/formatted source only.
- Static inspector exit0:30 frozen module files unchanged, all602 protected
  sources identical to accepted60d,593 original freeze hashes plus9 existing
  approved seams,0 unexpected/protected/unleased changes, root lock unchanged.
- Isolated accepted lock unchanged; resolution for the changed private package
  is PENDING. Original SDK pins and test command unchanged.
- Unmodified raw freeze exit1:46 leased MCP allowlist denials, mismatches[].
  Raw stdout/stderr retained. No guard/baseline/allowlist edits or false PASS.
- Four new nodecheck files have26 test declarations and zero parent Vitest glob
  intersection. All26 are NOT_RUN. Typecheck, installs, functional tests, full
  UI check, browser tests and new server jobs are NOT_RUN.
- Earlier static inspector shim/UTF-8 failures remain in static-attempts.json.
- Whitespace check exit0 with command-scoped cr-at-eol; default exit2 only
  flagged raw Windows CRLF evidence/JSON records. whitespace-check.json retains
  both results. No application source was flagged or Git config changed.
- The approved proposal copy SHA256 remains
  2f0ba0b7172ca33426a10b311b40478f853a0b60fc20749ad5c2ce0a40cabceb.

Exact source delivery:129 accepted baseline inputs +21 additional inputs =150.
Only23 overlay files/96,578 bytes are required:14 new adapter/test/doc files,
two private metadata files and seven unchanged actual socket source dependencies.
Overlay manifest SHA256:
c6741466fe6d45adaea5740f3ba625a0b5a1eee3f32de249276205e38a182b56.
No archive/remote copy/runner allocation has been created for M3A.

RUNNER_PLAN.md proposes immutable SDK/root cache reuse and only the exact Hono,
http-status-codes and Node-types delta (<=16MiB compressed/64MiB expanded new
dependencies), authoritative private lock resolution after a specific grant,
then a bounded network-none server check. No whole root/.git/docs/store clone.
The changed dependency/tsconfig boundary justifies one coherent rerun of the
accepted41 SDK cases alongside the new26 and typecheck, once granted.

Runtime limitations remain explicit: live account verification has its own
WAL/SHM behavior; private draft/native GET preservation requires actual syscall
and byte/mtime/directory proof. Separate account/draft DBs do not provide atomic
cross-DB revocation; the source test expects committed rows with a denied
response when revocation races after the precommit check. Drain requests before
closing the upstream account service. No hostile in-process/OS replacement
atomicity is claimed.

MCP02–05 and HQ remain OPEN. Host OAuth/private grants, renderer, real native
save consent/reservation/publication, R2 import/read and actual download gates
remain OPEN. No protected hooks, root/global config, customer files, secrets,
push/merge/deploy/provider changes or functional Windows execution occurred.
