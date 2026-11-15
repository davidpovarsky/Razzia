# Original Media/Sidecar startup recovery — ready for independent integration review

Candidate source: `5ef867db68d6d6ab371964990cf2b93b8248a59e`.
Base of this owner-snapshot delta: `dd18d31c8a54307394e66bbeb3b347f90a12c12d`.
Lane B: `01a1dfa9-5c5a-7723-8993-110f2dfe4892`.
Source tasks remain OPEN: Media `1220109925694179`, Sidecar V2 `1220111293723790`.
Creation/import C1 `1219882508725158` was previously qualified and manager-integrated;
this handoff adds the remaining original owner-aware startup acceptance only.

## Result and authority

Ownerless startup outside request ALS missed retained tenant journals. The two
baseline failures and positive tenant controls remain in attempt3 evidence.
The approved startup composition now gets exact IDs from every row of the
canonical accounts table, including disabled/unverified rows and independent of
feature flag or session. It recovers global and known existing tenant roots using
explicit filesystem adapters, then refuses listen on unresolved journals or
unavailable/invalid/conflicting owner metadata. It never discovers owners by
scanning tenant directories. Structural absence admits legacy global recovery
only when both account metadata and the tenant namespace are absent.

The manager explicitly assigned the additive account-db export and socket
startup composition in `STARTUP_OWNER_SNAPSHOT_SEAM_LEDGER.md`, then approved a
bounded private DB/WAL copy after native probes disproved source readOnly
sidecar safety. Exactly five product/test paths changed since the delta base:

- `packages/socket/src/services/account-db.ts`
- `packages/socket/src/index.ts`
- `extensions/src/server/index.ts`
- `extensions/src/server/storage/startup-recovery.ts`
- `extensions/src/server/storage/startup-recovery.test.ts`

The original account DB bootstrap/auth/configuration/close suffix is byte-identical.
The C1 startup hook and native path resolution remain. No schema/registry,
migration, account-scope fallback, provider, customer DB or deployment operation.
The canonical account-db file exceeds the 250-line target because this approved
seam holds the source capture/WAL validation/private-process cleanup helpers
alongside preserved native auth code. The new test file also exceeds the target
to keep the synthetic native snapshot lifecycle and its 26 cases together.
No additional protected module was introduced to hide this responsibility.

## Source preservation and limits

SQLite opens only an isolated private copy. Source DB, WAL, SHM and rollback
journal use bounded read-only file descriptors and identity/content fingerprints.
DB plus any WAL are copied; SHM is fingerprinted but never copied as authority.
Source identities/content are revalidated after copying and after the query.
Known tenant root identities are admitted before the retained C1 hook.
Private SQLite reads the entire accounts table and performs integrity checking;
its temp environment is confined to its private directory. No immutable=1,
source SQLite connection, source pragma/checkpoint/chmod or source sidecar creation.

At most 16 MiB aggregate metadata, three capture attempts, 10 seconds per child,
and 16 MiB child stdout. Oversize, churn or invalid metadata blocks startup.
This bounded availability tradeoff is intentional; larger real account stores
need a separately reviewed bound adjustment. Cleanup deletes only the pinned,
canonical, token-marked private directory; unsafe cleanup identity blocks
publishing. Retry/churn tests prove all their private copies removed.

WAL verification follows the active salt/checksum chain, including a valid WAL
reset with retained older-generation tail frames. The earlier overly strict
rejection is preserved in `wal-reset-before.*`; this final candidate fixes it.
References: [SQLite WAL format](https://sqlite.org/fileformat2.html#walformat),
[read-only WAL behavior](https://sqlite.org/wal.html#read_only_databases).

## Actual qualification

Final exact source on Windows Node 24.22.1: **25 PASS / 1 Linux-only permission
SKIP**, 26 cases (`windows-owner-lint-final.*`). Final scoped types, oxlint and
Prettier all exit 0 (`types-owner-lint-final.*`, `owner-lint-final.*`,
`owner-format-lint-final.*`). No rule suppression or test skip added for lint.

Packet10, exact source above: **26/26 PASS**, Linux Node 24.22.2 / SQLite 3.53.4,
actual uid1001, pinned image `612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647`,
0.25 CPU / 2 GiB / 96 PIDs, network none, read-only source/root, persistent ext4.
Three raw before/after source proofs cover live uncheckpointed WAL, clean closed
WAL without sidecars, and recycled WAL. Each includes full bytes, mode,
mtime/ctime, and equal source directory entry lists. Retry publishes only the
latest stable owners; churn stops at three captures. Actual permission, link,
invalid owner/schema/checksum, missing metadata, both unresolved tenant journal
families, full V2/native restoration, committed Media cleanup, accounts OFF and
second replay are covered.

Packet10 evidence is `../c1-execution-wave-packet10/`: 44 downloaded files SHA
matched, 11 frozen inputs unchanged. Effective source 1290 + 2 auxiliary and
1391 retained dependency files audited before/after with zero mismatches.
Peak 35/96 PIDs, zero PID-limit events/observed zombies, 24 resource samples,
minimum free disk 2,565,623,808 bytes. Controller deliberately terminated its
idle supervisor after successful jobs (container exit137); stopped PID0,
OOMfalse. Claim released, cumulative recovery disk 23,134,208 / 67,108,864 bytes.

Packet9 independently executed the earlier 25-case candidate `43f7bfe...`:
25/25 PASS, 42 raw SHA matches, peak35/96, no events/zombies. It is superseded
for final source qualification by packet10, not relabelled as the latest source.
Both use OWNER_AUTHORIZED_SOURCE_QUALIFICATION, with no independent approval claim.

The earlier four-file local run contains **68 PASS / 1 FAIL / 1 SKIP**. Its
failure was a fixture setup order that violated the intended root-change guard;
corrected final owner tests pass above. Its three unchanged legacy test files
passed 45/45 and their 15 R2 source/helper files remain byte-identical to
`991f38f216ad265e06aec53313db8928437da248`. Existing auth regression 4/4 PASS.
These 45 and 4 results are prior scoped runs, not reruns at final source.
Original failures and all intermediate logs remain intact. No full819 rerun;
old R2/full813-6 and C1 old37/41-7 historical evidence is unchanged.

`owner-final-source-audit.json` confirms exact five-path delta, original account
suffix preservation, 15 unchanged legacy files, all 16 inherited untracked
packet4 inputs still byte-identical and untracked, and no active lane claim.
Manager independent source review/integration and aggregate acceptance remain;
neither source task is marked complete by this developer qualification.
