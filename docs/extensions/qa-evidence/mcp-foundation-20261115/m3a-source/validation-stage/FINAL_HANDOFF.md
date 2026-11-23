# M3A private functional stage verified — external gates open

Product source: ad8955327a56213b3a437379fcc7ccc6e05a261a.
Final server attempt06 naturally exited0, OOMKilled false.
Earlier source2ba proposal/README/NOT_RUN receipts retain their historical
source-only status; this is the current private-stage checkpoint.

| Check | Actual result |
| --- | --- |
| Normal offline private lock generation | exit0, supply-chain policy passed |
| Frozen offline install/reinstall | exit0 / exit0 |
| Full private TypeScript check | exit0 |
| New first-party suite | 26/26, zero failures/skips/cancellations |
| Existing SDK suite | 41/41 actual attempt03; verified reuse in final |
| Scoped format on exact final source | exit0 |
| HTTP GET absent / regular / hot journal | 404 / 200 / 503, observations exit0 |
| Exact source check | 150 inputs, zero unexpected changes |
| Source/lease audit | 602 protected files preserved; 29 frozen legacy files |
| Unmodified raw TDS guard | exit1: 46 leased allowlist denials, mismatches[] |

Read [verified-stage-summary.json](verified-stage-summary.json) and
[verify-results.py](verify-results.py) for independent receipt/hash assertions.
Final26/typecheck/format all ran on the exact final byte manifest.
SDK41 ran once at this changed dependency boundary. Reuse verified the same
generated private lock, runtime image/Node24.22.2/pnpm12.18.0/cache pins,
unchanged SDK/server/contracts/legacy tests/core/common sources and unchanged
private package/tsconfig. The changed first-party header and synthetic crash
fixture do not enter that SDK runtime graph. Original test command preserved.

## Identity

- Final150-input manifest:
  d758084a11829061530a123dfdc6e371396b348196392dd8b8893b8e33303d4c.
- Thin24-file overlay:118,122 bytes;44,172-byte source archive:
  fb0febd5df8b394273a6e04a7bf6a3760f85bc932c11d8c805a515332af0ec91.
- Final source+runner archive:
  14dd56b85edb4e0118f0cb5e5256e4d03491c9c0166e8dc6aef8c16ab48dc2e2.
- Actual pnpm-generated private lock, imported byte-for-byte:
  e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838.
- Actual SDK41 log:
  ecf07bc1a5bd7b195268635b0002fa4d104130a22ee95400ba977bd34e196e9a.

Hono4.13.13, http-status-codes2.3.0 and Node-types26.6.5 now resolve in the
private lock. SDK2.4.0/ext-apps2.1.0 pins remain unchanged. Root lock, policy and
integrity checks are unchanged. The approved private scripts-disabled policy
remained in force. No registry/pull/full-root/store clone or stale-image app
import occurred. All150 application inputs were regular files in own RAM.

## GET evidence and limits

All three actual HTTP GET cases had identical byte/mtime/directory snapshots,
zero observed kernel mutation notifications, three positive-control events each
and no observer error/overflow. The real crashed SQLite DB/journal were captured
before teardown under server-receipts/attempt-06/get-hot-journal-preserved.

**Strace was absent; syscall no-write proof is unavailable.** Notifications and
snapshots are precise observable evidence, not a global/syscall zero-write
assertion. Existing account-auth WAL/SHM and OS access times are excluded.
No immutable SQLite mode, GET repair or native getter was introduced.
The account runtime must drain requests before closing its prepared handle.
Separate account/draft DBs do not make revocation linearizable: committed rows
may remain while the postcommit authority check denies the private response.

## Retained failures

Attempt01 lacked the abbreviated mirror view; fixed only an owned read-only
link to the same genuine metadata. Attempt02's harness file-size cap limited
dependency files; replaced with bounded stdout capture. Attempt03 had two
Headers iterable typing errors and25/26 tests; fixed with standard forEach
and synthetic-only child temp-directory values, preserving strict path/journal
guards. SDK41 passed there. Attempt04 had TC0/new26/GET0 but one formatter wrap
failed. Existing server formatter supplied the wrap; final attempt06 passed
all checks on those exact bytes. Preflight/formatter bootstrap errors are
retained separately in [attempt-history.json](attempt-history.json).
No functional project check ran on Windows.

## Resource release and remaining scope

All six own containers are stopped and retained, network-none,0.25CPU/2GiB,
root filesystem read-only, no mapped ports, OOMKilled false. Final own tmpfs
use155,594,752B stayed below256MiB; peak memory649,551,872B stayed below2GiB.
Own source/evidence4,366,336B + container directories290,816B +2MiB layer
allowance = conservative6,754,304B, below64MiB. No cap expansion/reserve breach.
Shared435,142,656B metadata remained read-only, counted once, keeper left running.
Cache index ab1feb01feab44b1d2dc7c58eb6299dd24919753dd25dc16893cd5451dcdee89
remained unchanged. See [allocation-release.json](server-receipts/allocation-release.json).

HQ and all four MCP02–05 tasks were read back OPEN. HQ stage notes appended,
exactly read back, prior notes preserved; unrelated/research tasks untouched.
This validates the isolated first-party draft adapter only. Host OAuth/private
client grants, accepted renderer, native consent/reservation/publication,
R2 read/import, actual downloads, protected mounts and release remain OPEN.
Save preparation remains HTTP409/ok:false/PENDING_C1, native_id NULL.
No protected hook, SB/R2 WIP, customer config/secret/provider, customer-data
migration, push/merge/deploy or editor change occurred.
