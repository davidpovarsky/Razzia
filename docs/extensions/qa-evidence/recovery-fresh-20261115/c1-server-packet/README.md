# C1 revised A — exact prospective server packet

**NOT RUN. Allocation RESERVED; execution NOT authorized.** Independent follow-up must approve revised source, then HQ must admit this exact packet against fresh resource measurements. `admission.example.json` is deliberately false. No upload, remote query, container, install, pull, port, customer/config/secret read or production mount occurred while preparing this packet.

Frozen revised source: **`e1fb1b28420a62acca17ddd69f1e72b3a9d27907`**, incorporating `127c91953991407c6aa58c6d879e7d9f958dd291` (all five review corrections) and the separately owned, literally off-root lookup sentinel. Revision handoff: `../C1_A_REVISION_HANDOFF.md`. Original `4f4825e` / `00eb930` source, static receipts and 35 unexecuted cases remain preserved. This packet contains **48 prepared cases, no passes**. The official source guard remains 1; R2 remains 813 PASS / 6 FAIL.

## Frozen input and smallest overlay

| Input | Exact value |
| --- | --- |
| New source payload | 19 changed runtime/test/helper files, **141,571 bytes**; zero unchanged source bytes copied |
| `overlay.tar.gz` | **34,242 bytes**, SHA-256 `2d89ba70f0d023dc5871fd2bed12a0c8994840bbe3d9049435120839c042ecf2` |
| Existing effective R2 manifest | `d67a1041f7c43392ad83d4e6812e597fa05a391683766ab6a46112a2c67b2f54` |
| Effective merged graph | 1,287 exact source inputs + 2 original freeze-policy auxiliary files, verified before/after stages |
| Retained dependency/base fixture | `/home/ubuntu/tadazz-hq-qa-20261115/fixtures/recovery-r2-9593f24f287f2e404f387f6359e89453cd8a971e/work` |
| Existing R2 overlay | `/home/ubuntu/tadazz-hq-qa-20261115/source/recovery-r2-991f38f216ad265e06aec53313db8928437da248/overlay` |
| Existing pinned Node image | `sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647`, recorded R2 Node `v24.22.2` |
| Existing lockfile | `pnpm-lock.yaml` SHA-256 `f2e3f2183bc308e7e113a23f2ae901d98aade9a173c6b16019d014072684b9a0` |

`manifest.json` records every changed file's Git blob, size and SHA-256, plus inherited physical source and effective hashes. `packet-hashes.json` freezes archive, manifest, mount/command plan and executable packet scripts. `prepare-packet.mjs` was run locally for source packaging only; it reads exact Git blobs and creates a 19-file archive. It does not import app modules or run tests/builds. No full source, `.git`, docs, dependency or cache tree is cloned.

The existing base is one read-only `/work` mount, including its already-installed root/extensions/socket dependencies. The two parent directories that need new files are mounted from the tiny new namespace; **43 nested read-only passthrough mounts** restore their unchanged files and service subdirectories directly from the existing verified R2/base inputs. Empty mount targets live only in the new packet namespace. Three changed existing entry files and three inherited Media files are exact read-only file mounts. `plan.json` enumerates every source/destination and access mode. There is no prior-fixture mkdir/placeholder repair and no old container reuse, rename or deletion. Missing dependency/mount targets fail closed.

`verify-merged.cjs` checks the actual merged namespace and records critical dependency entry/package hashes and versions from the installed fixture, plus Node/SQLite identity. The retained original 1,391-file fixture is separately hash-verified before/after; no input is silently remapped to a new dependency tree. The C1 manifest reflects a runtime composition, not a claim that the entire current documentation tree was copied to the server.

## Persistent synthetic authority and writable mounts

The new source prefix is `/home/ubuntu/tadazz-hq-qa-20261115/source/recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907`. New fixture and evidence prefixes have the same suffix under `fixtures/` and `evidence/`. The runner refuses existing fixture/evidence paths, old results and existing container names.

| Host-owned new path | Container path / use |
| --- | --- |
| `fixtures/recovery-c1-<SHA>/scratch/c1` | `/scratch/c1`; explicit `C1_FIXTURE_ROOT` for every C1 filesystem/process fixture |
| `fixtures/recovery-c1-<SHA>/scratch/tmp` | `/scratch/tmp`; explicit `TMPDIR`, including existing root test setup and TSX temporary work |
| `fixtures/recovery-c1-<SHA>/scratch/home` | `/scratch/home`; synthetic HOME |
| `evidence/recovery-c1-<SHA>/receipts` | `/qa/receipts`; separate explicit `C1_RECEIPT_ROOT` |
| `fixtures/recovery-c1-<SHA>/cache-0..3` | Fresh bounded root/extensions `.vite` / `.vite-temp` mounts; no retained cache copied |

All writable fixture, tmp, HOME and receipt locations are **persistent host binds on the same device**. The profile admits existing host ext4/xfs only and records `findmnt`/device facts; unsupported/unknown storage stops qualification. There is no tmpfs/RAM substitution, `/fake`, generated docs/build output mount or writable installed dependency source. The image root and source are read-only, network none, no ports, private PID namespace, 96-PID bound, capabilities dropped, no privilege escalation, no Docker socket or host PID mount. Source startup `index.ts` is hashed but never executed as a listener.

The test commands use `env -i` with the exact synthetic allowlist in `plan.json`. Root Vitest also supplies its existing fixed test JWT key. Actual API tests call the real `api.request` in process with native JWT/session middleware. Two verified synthetic account rows and generated sessions exist only in the current private fixture SQLite database; there is no signup/email flow, external auth request or provider credential. Other tests explicitly use accounts-off legacy mode. Fixture helpers verify marker/token, exact root/parent and synthetic prefix before child entry or cleanup. No real accounts/config directory, `.env`, credentials or customer data is read or mounted; unexpected legacy config/environment paths in the verified source snapshot cause refusal before mount.

## Exact four sequential commands

These are `docker exec` argument arrays in `plan.json`; the runner prefixes the synthetic allowlisted environment and exact working directory. Existing timeouts/assertions are retained; no broad suite/build or retry is scheduled.

```sh
# cwd /work/extensions — 9 cases
node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage/durable-files.test.ts src/server/storage/creation-scope.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose --reporter=json --outputFile=/qa/primitives-scope.results.json
# cwd /work/extensions — 16 cases
node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage/creation-reservation.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose --reporter=json --outputFile=/qa/reservation.results.json
# cwd /work/extensions — 12 focused independent-review cases
node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage/creation-review.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose --reporter=json --outputFile=/qa/review-regressions.results.json
# cwd /work — 11 actual native/API cases
node node_modules/vitest/vitest.mjs run --project socket packages/socket/src/services/quiz-creation-reservation.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose --reporter=json --outputFile=/qa/actual-native.results.json
```

Only after independent approval, packet transfer/hash verification and a fresh manager grant, the single host invocation is:

```sh
python3 /home/ubuntu/tadazz-hq-qa-20261115/source/recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907/server-run.py /home/ubuntu/tadazz-hq-qa-20261115/source/recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907/admission.actual.json
```

The actual admission must specify the exact source, manifest hash and SHA-256 of the final `packet-hashes.json` (binding scripts/mounts/commands too), an approved follow-up disposition, explicit execution authorization, an epoch timestamp no older than 300 seconds and each other lane's actual remaining growth. The false example cannot run the packet. Upload only the six runtime files listed in `packet-hashes.json`, that hash file, and the manager's actual admission; do not transfer a full source/archive/dependency tree. The local packagers, README and example are review aids, not needed server inputs.

## Resource reservation and failure policy

Prospective **.25 CPU / 2 GiB RAM / swap bounded to the same 2 GiB / ≤64 MiB new physical disk**. With the manager's active Integrator .5/3, MCP .25/2 and UI .25/2, the future aggregate is 1.25 CPU / 9 GiB; retained shared metadata 435 MiB is counted once by HQ. These are reservations, not measured C1 use. The last reported free disk/RAM is historical and supplies no admission.

Fresh disk admission uses `2048 + remaining MCP + remaining Integrator + remaining UI + remaining C1 + 200 future QA + 64 margin` MiB: initially **2,568 MiB**. Deduct already consumed lane growth from remaining growth; C1's uploaded inputs and staged namespace are included in actual physical allocation. The manager supplies current other-lane remaining values; the runner measures C1 using allocated blocks with inode deduplication, new container writable bytes and a conservative 2 MiB metadata allowance. Old source/dependency/shared disk is not counted again. Admission also requires at least 2,304 MiB currently available host RAM and the manager's global allocation approval. Between jobs the admitted lanes may spend their reserved growth; checks continue against the absolute 2 GiB free-disk floor and C1's 64 MiB cap rather than double-counting their growth as still unused.

Planning estimate: **6–12 minutes**, unmeasured for these new cases. Whole packet maximum 30 minutes; job bounds 120/600/900/600 seconds within that master deadline; child timeout 25 seconds, existing case-specific 70/85/140 seconds and new five-process regression cases 150 seconds. Expected new physical data is under 16 MiB (mostly fresh transform cache/receipts), an estimate only. Actual admission and every two-second sample enforce the 64 MiB cap and 2 GiB floor; raw logs have a 16 MiB per-log bound. A failed test, missing receipt, timeout, disk/cap breach or unsupported filesystem stops later jobs, preserves actual output and stops only the verified new C1 container. No unrelated runner or retained fixture is killed or removed.

## Kill ownership and acceptance receipts

Six original native kill targets are before public link, after sidecar link, after base link/before return, visible commit, private cleanup and before slot removal. Each verified synthetic child invokes `process.kill(process.pid, "SIGKILL")` on itself after root/token checks and writes its PID/mode/tree immediately beforehand. The parent creates exactly the fixed child script with `fork`, owns the returned process handle and applies its 25-second bound; no arbitrary host PID or process-name kill exists. The analysis requires checkpoint PID = that fork PID, expected mode, SIGKILL and no timeout, plus **two distinct fresh replay PIDs**, both different from the killed PID. Container PID namespaces isolate these identities from host/other-lane PIDs.

The new review matrix independently covers both public parents and both move parents, repeated EIO and empty resolved-slot cleanup; each five-process case requires the killed child, two failed fresh replays with positive targeted-fence activation, and two successful fresh replays, all PIDs distinct. The HTTP matrix checks four exact pre-intent fault/route conditions and stable error bodies. Other receipts retain foreign/newer evidence, immutable bytes/inodes, warm commit-fence failures, tenant flag replay and the honest external null-sidecar interference outcome.

`analyze-results.cjs` must see exactly 9+16+12+11 = 48 passed cases with zero failures/pending/todo, then validate the raw PID/fault/state receipts. It emits no acceptance before those files exist. Persistent synthetic process evidence does not establish hardware power-loss, arbitrary multiwriter exclusion, B implementation, F1 or production adoption. Original tasks/HQ stay open.
