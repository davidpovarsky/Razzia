# Pre-edit correction ledger after the actual attempt03 failures

Source2ba stayed frozen until the verified cache became AVAILABLE and the root
authorized this functional stage. Attempt03 performed actual normal offline
private lock generation, frozen installation/reinstallation (all exit0), SDK41
exit0, private typecheck exit2 and new tests25/26. All original files/logs and
stopped containers are retained. No source correction is called validated yet.

Approved downstream paths/symbols to edit now:

- `first-party/ingress.ts`, `route`: replace Headers iterator/keys usage with
  the existing standard Headers.forEach API. Actual TS5.9.3 reports exactly two
  missing DOM iterable declarations under the unchanged private lib config.
  Preserve header count/byte bounds and forwarded-header rejection; no shim or
  broadened/global config. Validate full private typecheck and HTTP cases.
- `tests/first-party/store.nodecheck.ts`, synthetic crash-worker spawn: forward
  only the synthetic temporary-directory location into the otherwise empty
  child environment. Fixture root is /ram/tmp, while env{} gives the child its
  default /tmp; its strict synthetic-prefix guard exits before creating a hot
  journal. Preserve that guard, real SIGKILL and journal-magic assertions. Add
  bounded synthetic-worker stderr diagnostics. No auth/provider environment.
- Owned `get-observer.mjs`: the same synthetic child temp-directory correction
  and bounded diagnostics. No product imports/schema/engine changes.
- Private `pnpm-lock.yaml`: import ONLY the actual server-generated lock from
  attempt03, preserving its bytes/SHA. No hand-splicing; private package/source
  pins remain unchanged. Root lock, packages/**, SDK server/contracts/tests and
  actual middleware remain frozen.

The ordinary offline supply-chain check passed70 entries. Attempt02's install
failed because a harness RLIMIT_FSIZE log limit also restricted dependency files;
attempt03 replaced it with a bounded stdout capture helper and installed twice
successfully. Attempt01's missing abbreviated metadata mirror was corrected with
another read-only link to the same verified genuine response files; no registry,
shared-body/index/metadata mutation or policy bypass occurred.

SDK41 already ran once at this new dependency boundary and passed. Corrections
above do not enter its runtime source graph, change dependency pins or alter
legacy tests. Reuse its exact actual receipt only after the next frozen install
matches the same private lock and immutable cache/runtime pins; do not rerun41
without a new dependency/boundary reason. Full private TC and the new26 must run
on the corrected coherent source, plus all three GET observation cases.

The image has no usable strace. Absent/regular observations completed with kernel
notification positive controls and exact snapshots; these are not syscall proof.
The real-hot-journal observation failed before the temp-root correction and must
run on the corrected source. Auth WAL/SHM remains separate; all external gates
and Asana implementation tasks remain OPEN.
