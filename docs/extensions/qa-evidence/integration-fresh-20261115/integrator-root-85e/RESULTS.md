# Frozen root installer: blocked on registry metadata

15 November 2026. Tested product snapshot `85e8f0d2d8dfcacccf9b36bfe899d15c74c8a0a0`, branch `codex/tadazz-hq-integration-20261115`. **The ordinary frozen offline root install exited 1. Parent TypeScript, private TypeScript and the 41-case SDK suite were not run after that incomplete install.** No installed dependency graph was substituted to obtain a pass.

The final command was:

```text
pnpm install --offline --frozen-lockfile --store-dir=/work/store --package-import-method=copy --verify-store-integrity=true --reporter=append-only
```

It recognized all seven workspace projects and reported 371 resolved, reused and added packages, with zero downloads. The unchanged supply-chain gate then failed with `ERR_PNPM_NO_OFFLINE_META` for `@babel/code-frame`. The locked manifest contains 509 package entries / 459 distinct names. A subsequent filename inventory found only 20 public registry metadata files in the existing QA image and 27 in the existing SDK fixture; 412 locked package names lack a metadata file in their combined inventory. Presence alone would still need validation against the locked version and policies. No metadata, verification provenance, timestamp or registry response was fabricated; minimum release age, integrity verification and the existing `allowBuilds` configuration were not disabled or broadened. Lifecycle completion and Docker builder parity remain unproven.

## Cache comparison and source integrity

The matching pnpm 12.18.0 primary sources were inspected; exact URLs and SHA-256 hashes are in `primary-sources.json`. In particular, [the record decoder](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/store-dir/src/msgpackr_records.rs) describes the msgpackr records format, and [the index schema](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/store-dir/src/store_index.rs) identifies per-file `checkedAt` as the last integrity-check timestamp. The read-only audit decoder rejects unknown encodings and retains all decoded fields for comparison.

- All 27 shared package rows match in every field except 1,178 exact `files.*.checkedAt` values. Their package identity/version and registry integrity match the final lock. All 27 shared aliases are identical. Exact differences are retained in `server-receipts/shared-row-comparison.json`.
- All 20,031 referenced file entries passed SHA-512 content, size and executable-mode checks against the two original caches. Source paths were validated. All 354 root row payloads were retained verbatim; 17 original SDK-only rows and their aliases were appended to a consistent, owned SQLite backup. No row payload was synthesized.
- The composed CAFS view used 17,412 symlinks in the bounded temporary filesystem, pointing only into the two read-only input caches; copied cache body bytes: zero. Package import used copying into the fresh temporary workspace, protecting original cache inodes from lifecycle writes.
- Before/after manifests of original cache file hashes, sizes, modes, modification times and inodes matched exactly. Original database hashes also matched. All 913 selected tracked source/config blobs and modes matched Git before and after, including the copied temporary workspace. The source view reused existing hardlinks with a four-file, 286,720-byte overlay; no hardlinked base file was opened for writing.

## Execution limits and retained failures

Execution used the existing QA image, Node `v24.22.2`, pnpm `12.18.0`, aarch64, network `none`, no published ports, read-only container root and cache mounts, 0.5 CPU, 3 GiB memory, and one tmpfs capped at 1 GiB. Final peak memory was 760,221,696 bytes; tmpfs use was 486,547,456 bytes, with zero OOM events. New host disk allocation was conservatively measured at 36,876,288 bytes under the 64 MiB grant; remaining free disk was 2,650,857,472 bytes, above the 2 GiB reserve. All runners are stopped and retained.

The initial runner failed before source execution because capability removal prevented UID 0 from traversing the Ubuntu-owned mode-0700 evidence directory. The next runner, using the owning UID/GID, completed the semantic cache audit but failed at pnpm's stable operation-lock directory on the read-only filesystem. The final attempt used an owned mode-0700 `XDG_RUNTIME_DIR`, preserving normal lock behavior. Both setup failures and all later logs are retained. No Windows install/build/browser or broad test run occurred. Existing freeze-guard failures remain unchanged; the guard was not rerun for this blocked installer attempt.

A small read-only index snapshot is pinned at `/home/ubuntu/tadazz-hq-qa-20261115/fixtures/integrator-root-85e-20261115-public-union/`; no cache bodies or persistent disk symlink forest were copied. Every pinned row/alias was independently checked byte-for-byte against the original root or SDK-only input. Its physical SQLite hash differs from the earlier in-container temporary database; the cause is unproven because that temporary database was not retained. The failed physical-hash assertion and subsequent logical verification are recorded explicitly. This snapshot is **not announced available to M3A** while the root consumer remains blocked.

Full raw receipts, including large before/after cache manifests and preliminary failures, remain at `/home/ubuntu/tadazz-hq-qa-20261115/evidence/integrator-root-85e-20261115/`. The compact local receipts include raw-file hashes in `server-receipts/result-summary.json`.

## Authorized public metadata hydration: capacity failure

The manager subsequently authorized one separate public metadata hydration container, after the revised 2,336 MiB startup resource gate. It mounted only the exact locked manifest, the existing public SDK metadata directory and its own evidence namespace. Its Python process cleared ambient environment/configuration, disabled proxy/auth inheritance, used normal TLS verification and accepted only HTTPS `registry.npmjs.org:443` allowlisted package metadata URLs, applying the same host/path restriction to redirects. Four request threads were allowed; no package archive, install, script, attestation or private endpoint was requested.

The pinned native `view.rs` uses the uncached fetcher, so `pnpm view` cannot populate this mirror. The inspected native `mirror/read_records.rs` explicitly accepts header JSON, a newline and a full JSON registry packument. The hydration adapter therefore retains each complete registry response byte-for-byte after the documented header line, recording genuine response ETags and genuine registry modified fields only. URLs, UTC receipt times, status, ETag, raw-response SHA-256 and mirror SHA-256 are retained per successful fetch. Nothing is invented about publication time, integrity, provenance or a policy verdict.

It reused 47 original metadata files (43,588,068 bytes) and completed 211 of 459 package mirrors before failing closed at 134,217,663 expanded bytes, just below the explicit 128 MiB ceiling. There were 248 per-package budget failures plus the stage failure. The remaining mirror was incomplete, so no archive or second offline consumer was started. Peak memory was 416,272,384 bytes; all original public metadata hashes, modes and modification times matched afterwards. The stopped container and `server-receipts/metadata-hydration/hydration-receipt.json` preserve the failure. The manager received the measured capacity blocker; no unapproved larger limit or second network process was used.

The ordinary installer requests the full metadata mirror. pnpm's separate supported filtered mirror has a different key and strips version fields; this audit does not relabel filtered data as full data or change normal installer settings to obtain a pass.

Next prerequisite: a revised bounded metadata capacity/representation decision, followed by the same normal frozen offline installer with all policies unchanged. Only a successful installer can unlock the actual parent TS7 and private SDK checks. No product acceptance, release, provider, browser, physical-device or existing guard gate is closed by this audit. HQ Asana `1220543600361181` was updated with both measured blockers and exact notes readback, remaining open on 15 November 2026.
