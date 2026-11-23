# Optional package runtime activation in the guarded MCP operator

This is an operator-only change. The application image and application revision
remain independently pinned by the existing release arguments and stage proof.
The operator must be reviewed, committed and pinned separately from the app.

## Explicit desired configuration

The default behavior is unchanged: omitting the new flags preserves the original
package runtime environment. An original `false` stays `false`. A runtime
container is not silently exempted from the customer-mount prohibition.

Activation requires all four flags together:

```text
--package-runtime-origin https://www.tadazz.com
--expected-package-runtime-container <exact 64-hex running container ID>
--expected-package-runtime-image sha256:<exact 64-hex runtime image ID>
--expected-package-runtime-revision <independently qualified 40-hex runtime source revision>
```

The origin must be a canonical lowercase HTTPS DNS origin distinct from
`https://tadazz.com`. Credentials, a path (including a trailing slash), query,
fragment, explicit default port, noncanonical hostname and invalid port are
rejected. Accounts and the existing package installer must already be enabled.
This option does not enable either prerequisite.

The candidate receives only these three additional environment overrides:

| Variable                         | Desired value                  |
| -------------------------------- | ------------------------------ |
| `TADAZZ_PACKAGE_RUNTIME_ENABLED` | `true`                         |
| `TADAZZ_PACKAGE_RUNTIME_ORIGIN`  | The explicitly supplied origin |
| `TADAZZ_PACKAGE_PARENT_ORIGIN`   | `https://tadazz.com`           |

All other environment preservation, app image/revision pins, room checks,
running-container count, gateway identity, private config pins, app host settings,
backups and rollback behavior remain in force.

## Read-only runtime topology

Only the explicitly pinned `tadazz-package-runtime` container may mount the
following customer subtree. Every other container retains the blanket customer
mount prohibition, including read-only mounts.

| Boundary               | Required contract                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image                  | Exact immutable ID; image and container source labels both equal the explicit independently qualified runtime revision                              |
| Image metadata         | SHA-256 labels for source manifest, bundled runtime and bootstrap                                                                                   |
| Process                | User `0:0`, working directory `/app/runtime`, entrypoint `node /app/runtime/bootstrap.mjs`, no command arguments                                    |
| Package store          | `/var/lib/tadazz-release-5312660/config/extensions/packages` → `/runtime-store`, read-only, private propagation                                     |
| Derived secret         | `/var/lib/tadazz-package-runtime/runtime-capability` → `/run/secrets/runtime-capability`, read-only, private propagation                            |
| Host secret protection | Canonical nonsymlink path, root-owned file, mode `0400` or `0600`, one hard link, 64 or 65 bytes; contents are not read or printed by this operator |
| Additional mounts      | None; no Docker socket, devices, volumes-from or writable tmpfs                                                                                     |
| Privileges             | Read-only root filesystem, drop all capabilities, no-new-privileges, not privileged, no host PID/IPC/UTS namespaces                                 |
| Network                | Bridge; only `127.0.0.1:3192` → `3192/tcp`; no extra hosts or links                                                                                 |
| Resources              | 256 MiB memory and memory+swap, 0.5 CPU, 64 PIDs                                                                                                    |
| Environment            | Exact image defaults plus store, parent origin, runtime origin and port; no JWT, capability secret or arbitrary Node options                        |

The root UID is required by the existing root-owned private package database;
the two read-only mounts and other restrictions remain mandatory. The runtime
bootstrap reads the separately derived secret from its protected file.

The runtime container remains part of the exact running-container count and
unchanged-container checks. Rechecks validate its actual topology as well as its
image and startup identity. Read-only access does not permit the renderer to
change the consistent private backup.

## Required readiness and qualification

Install and qualify the separate immutable runtime image and scoped HTTPS proxy
routes before requesting app activation. This operator does not create the runtime
container, derive a secret, change a proxy, or change cookie handling.

Readiness uses bounded real GET requests with redirect following and environment
HTTP proxies disabled. It checks both the pinned local service and the external
HTTPS origin, sending the correct runtime Host header:

- `/health` must return HTTP 200 and exactly `{"status":"ok"}`.
- `/render` without a ticket must return HTTP 403 with an empty body.
- `/render?ticket=invalid` must return HTTP 403 with an empty body.
- Every response must be private/no-store, nosniff and no-referrer, deny the
  specified camera/microphone/geolocation/autoplay permissions, and set no cookie,
  redirect location or cross-origin access header.

Health alone is not image attestation. The operator separately inspects the pinned
Docker image and container, validates its source/hash labels and enforces the
read-only topology. Successful readiness is required before any app stop and is
repeated after replacement startup.

Use the same four runtime flags for preflight, `qualify-backup
--qualify-candidate`, and deploy. Baseline and resumed-old-app probes continue to
use the original policy. The isolated candidate clone receives the desired policy
and verifies its runtime environment locally with network disabled. Its receipt
binds the desired policy, runtime origin, runtime container/image/source revision identities,
external readiness results and the exact operator script SHA-256.

A receipt qualified with runtime off cannot authorize a runtime-on cutover. A
receipt from another operator script, origin, runtime container, image or runtime revision
also fails. Obtain a new restored-candidate receipt with the intended flags after
the runtime is ready, then use its independently pinned receipt path and hash for
deployment. The existing 24-hour receipt limit still applies.

The runtime revision is independent of the application `--revision`. A separately
qualified runtime may remain at an earlier revision when the application changes
only unrelated lint or build-provenance code. That reuse requires an explicit
runtime revision pin and independent evidence that the relevant runtime inputs
remain compatible; the operator never infers compatibility from health responses
or silently replaces the runtime revision with the application revision. A
missing runtime revision flag is rejected whenever activation is requested.

Rollback restarts the retained original app container with its original runtime
environment, including `false` when originally off. It retains failed containers
for inspection and preserves current customer writes; it never restores a backup
over live data. The separate read-only runtime is not mutated by app rollback.

## Local regression checks

These checks use synthetic fixtures only. They perform no real Docker calls,
network requests, deployment, credential access or customer-data access.

```bash
python3 extensions/deployment/deploy-mcp-site.py --self-test
python3 extensions/deployment/test-deploy-mcp-site-runtime.py
python3 -m py_compile extensions/deployment/deploy-mcp-site.py extensions/deployment/test-deploy-mcp-site-runtime.py
git diff --check
```

The new regression groups cover default-off preservation, explicit desired-on
configuration, origin and prerequisite rejection, exact container pins and
read-only topology, non-runtime mount/count gates, required external probes,
redirect denial, qualification binding, failure before app stop and rollback to
the original off policy. The existing guarded operator self-tests remain active.
