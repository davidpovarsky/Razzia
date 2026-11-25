# BMS package worker and runtime qualification — 20 November 2026

## Scope

The application source used for this isolated qualification was
`f276c9cbf86a72ab6fc689a113d7d33a1c0d21af`. The runtime image keeps this exact
source pin independently of any later application release.
The separately versioned worker correction is `c85690fffb0201ec09687f1ab0837c479853ec8e`.
Its only application-base difference is `scripts/qa/package-build-worker.py`.
Operator recipes and evidence in later commits do not change those immutable image pins.

This record describes isolated qualification. Production deployment requires its
own guarded deployment receipts, active-room checks, private backup and rollback.
It does not authorize installation, account save, publication or theme review.

## Reproduced input-staging failure and bounded correction

The original worker applied an 8,388,608-byte per-file write limit to both output
and media staging. The valid BMS Age of Wonder asset is 8,424,286 bytes. A real
native PackageStore upload/build request using the original pinned toolchain
failed with `TADAZZ_BUILD_REJECTED EFBIG: file too large, write`.

The worker now admits one manifest-valid media input up to 100,000,000 bytes
(`PACKAGE_LIMITS.fileBytes`) and uses a 128 MiB temporary filesystem. Media
decoding remains sequential. The independent 8,000,000-byte result/bundle limit,
768 MiB RAM, one CPU, 48 PIDs, 45-second deadline, UID 65534, dropped capabilities,
no-new-privileges, read-only root and network isolation remain in force.
No package scripts or customer code execute in the server process.

## Immutable artifacts

| Artifact                           | Pin                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------- |
| BMS source archive                 | `041e64a214f6121b3492b736956884495147be061988ed9285b3f179b89204b0`        |
| Corrected operator worker          | `b5cb4f5d9c252ca1638613f4c9e8ebe0f0f983d9c3d800ee37bbc145efb9492f`        |
| Worker image                       | `sha256:8295e3a3f00c78d0c5e0eb95679782d218db284e74dbff312d8607fb5b97140e` |
| Worker source manifest             | `354842325651a66b24d23e946f7d511197b79d4914deb559a408abed1635a44d`        |
| Current SDK source                 | `8bd9244b3016d01865a133becc74fa6a1883eb968a216f483df0b38edee6f9e2`        |
| Native accepted BMS build          | `25f6b9b8bd5bd79ddcd0510471113aeb5ef67cc410f53fd05da52ffaed20245d`        |
| Runtime image                      | `sha256:56c4e4cffc30d77e1f9828078071880590a0bb9ecc1379f66020e842e1fa2819` |
| Runtime JS                         | `cc97def60deefe4b6854a9a3bc85d5720d47d38a25671bf784593ca1ca2deb22`        |
| Runtime bootstrap                  | `c84d9df7702379667a2744d9447dc909ec8d063203eb7bd86169817e3bb0079b`        |
| Runtime source/dependency manifest | `a6e128e56af63ec6b793ffeab0be393703b419e86495a3d2b45fc28c9867a978`        |

## Build recipe

The worker image overlays 912 hash-verified files from the exact worker revision
onto the existing frozen toolchain image. The Git archive inventory is:

```text
extensions/src
extensions/qa/package-builder.ts
extensions/qa/package-media-probe.ts
extensions/qa/package-runtime-server.ts
extensions/package.json
packages/common
packages/web/package.json
packages/socket/package.json
scripts/qa/package-build-worker.py
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json
.gitignore
.prettierignore
```

Export with `git archive` from the exact revision, reject non-regular members
and traversal, hash every extracted file, and write the source manifest as
`{revision, appRevision, files}` using sorted-key compact JSON. Build using
`extensions/deployment/package-runtime/worker.Dockerfile`, `--network=none`,
`--pull=false`, and the exact source-revision, source-manifest and SDK labels.
The source archive used here is 1,746,655 bytes with SHA-256
`7b5db8d2a2a327c2e64c57f820e7a4d8543860247d3aa6e40dcf659f36ac304d`.
All 912 resulting image source files were rehashed and matched.

Run `build-runtime.cjs` inside that immutable worker image with no network,
read-only root, UID 65534, all capabilities dropped, no-new-privileges, one CPU,
512 MiB RAM, 64 PIDs and a bounded temporary filesystem. Mount only the source
manifest read-only and a fresh output directory writable. The compiler resolves
the pinned esbuild 0.28.2 from the frozen toolchain; each transitive platform
input must match the source manifest. It records all transitive dependency hashes.
Copy the checked-in bootstrap to the output and use `runtime.Dockerfile`.
Build the runtime image with no network/pull and labels:

```text
org.opencontainers.image.revision
com.tadazz.package-runtime.source-manifest-sha256
com.tadazz.package-runtime.runtime-sha256
com.tadazz.package-runtime.bootstrap-sha256
```

The runtime bundle includes 76 platform source inputs and 150 dependency inputs.
Its base is the pinned Node 24 image. Image environment contains only PATH,
NODE_VERSION and YARN_VERSION. No JWT, account credential, MCP credential or
runtime capability is baked into either image.

## Qualified runtime contract

- Entrypoint: `node /app/runtime/bootstrap.mjs`; empty command (Docker reports null).
- Working directory: `/app/runtime`; user: `0:0`.
- Read-only root, all capabilities dropped, no-new-privileges.
- 256 MiB memory and swap limit, 0.5 CPU, 64 PIDs.
- Only two read-only mounts: package store to `/runtime-store`, derived runtime
  capability file to `/run/secrets/runtime-capability`.
- The runtime capability is derived privately from the existing signing secret;
  only the derived value is mounted. It is not in Docker configuration environment.
- Environment: `TADAZZ_PACKAGE_STORE=/runtime-store`,
  `TADAZZ_PACKAGE_PARENT_ORIGIN=https://tadazz.com`,
  `TADAZZ_PACKAGE_RUNTIME_ORIGIN=https://www.tadazz.com`,
  `TADAZZ_PACKAGE_RUNTIME_PORT=3192`.
- Production listener is loopback-only 127.0.0.1:3192. Isolated qualification used
  no network and no published ports.
- The distinct existing www origin routes only /render and /health to this
  service; other www paths retain the canonical redirect. The front proxy
  strips Cookie and Authorization, strips Set-Cookie, and preserves ticket-log
  protection. No account/game/private API is exposed by this runtime.

The SQLite store uses WAL. Keep the actual native application writer initialized;
its -wal and -shm files are required by the read-only reader. Do not replace this
with a writable runtime mount, permission broadening or an immutable SQLite
connection that would ignore live WAL updates. The isolated test kept a real
PackageStore writer open, matching the application/runtime topology.

## Actual verification

The complete BMS archive was uploaded to a fresh synthetic native PackageStore.
The real sandbox worker decoded media and compiled the current SDK/theme.
Native `acceptBuild` accepted the real receipt and moved to `preview-ready`,
revision 2, with a 943,843-byte bundle. No install, review or account save occurred.

The pinned runtime served that actual build with a valid capability: HTTP 200,
821,688-byte HTML, SHA-256
`8d6a44ec6212bc0ebdf530261121734e009e4f45060999bf006e56b38d2badee`,
and an exact hash-bound sandbox CSP. Invalid tickets returned 403; wrong Host
and account API paths returned 404. No Set-Cookie was present. A write probe to
the read-only store failed with EROFS. Both owned QA containers were stopped.

Evidence is under `docs/extensions/qa-evidence/package-runtime-20261120/`.
The full private task-owned host evidence remains under
`/home/ubuntu/tadazz-package-worker-bms-c85690fffb02-20261120/`.
