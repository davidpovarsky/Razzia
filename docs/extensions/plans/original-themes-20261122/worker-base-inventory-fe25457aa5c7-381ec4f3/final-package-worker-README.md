# Held same-candidate package-worker qualification

Preparation only. No image build, application code, decoder, package worker,
native installation, or runtime compiler has been executed by these files.
Run only after the coordinator supplies the final commit, canonical native-launch
source and receipt pins, and an explicit Oracle resource window.

## Files

- `final-package-worker-qualify.py`: Oracle-only qualification controller.
- `final-package-worker-driver.mts`: fresh synthetic fixture and native API driver.
- `final-package-worker-base-inventory.py`: optional separately authorized,
  metadata-only comparison with the pinned base; it builds no image and executes
  no application, browser, decoder, package job, or qualification.

The existing `transfer/operator-lane-run.py::verify_worker` contract remains
unchanged. This controller produces its required proof and immutable image;
it does not activate a broker, modify systemd, deploy a runtime, or read a customer
store. It reads no old package, job, database, configuration, or authentication
material. The old 4,493-byte driver was used only as a source reference.

## Required inputs

Invoke the Python controller as root on Oracle, with these arguments:

| Argument | Value |
|---|---|
| `--candidate-sha` | Final 40-character Git commit. |
| `--source-run` | Successful `tadazz-codex-<sha12>-<8hex>` native-launch run. |
| `--source-root` | Exact `/home/ubuntu/tadazz-phase2-20261116/evidence/<SOURCE_RUN>/source`. |
| `--source-tree-sha256` | Coordinator's complete frozen source/build inventory digest. |
| `--input-manifest` | Oracle path to that run's canonical input manifest. |
| `--input-manifest-sha256` | Exact SHA256 of the manifest bytes. |
| `--native-build-receipt` | Oracle path to the successful native-launch receipt. |
| `--native-build-receipt-sha256` | Exact SHA256 of the receipt bytes. |
| `--driver` | Uploaded, reviewed `final-package-worker-driver.mts` path. |
| `--driver-sha256` | Exact SHA256 of the driver bytes. |
| `--runtime-directory` | Optional fresh `<owned-operator-root>/runtime` directory. |

Without `--runtime-directory`, compilation writes to the new qualified root's
`compiled-runtime`. Copy those two files byte-for-byte into the eventual owned
operator root's `runtime` directory before the package-sequence lane. Its plan
must pin `runtime-source-manifest.json` and retain the actual runtime hash.

The complete source inventory uses the existing canonical digest algorithm:
regular files map to `{sha256,bytes}`, symlinks map to `{symlink}`, real `.git`
and `node_modules` directories are excluded, and sorted compact JSON is hashed.
The native-launch manifest's committed files are individually rehashed as well.
All four named native build checks and every reported native-launch check must
pass, and its before/after source maps must exactly equal the input manifest.

## Build and ownership

The controller creates a new root:

`/home/ubuntu/tadazz-package-worker-<sha12>-<8hex>`

It writes a full source manifest with `revision == appRevision == final SHA`,
using only the canonical source manifest's exact file hashes. A bounded read-only
container hashes every candidate path in the immutable base image. Files already
matching the final Git bytes remain inherited; only missing or changed files are
streamed directly into `docker build` under `source/`. The Dockerfile contains
only the pinned base and `COPY source/ /cleanup/` for that verified delta (no COPY
is needed for an empty delta). There is no second 197 MB source directory or
on-disk build-context tar. The full candidate manifest is unchanged. The proof
records the base-matching file count, delta file count, delta bytes, exact delta
manifest SHA256 and canonical delta digest. The only file retained under
`qualifiedRoot/source/` is the exact broker script, as required for a later,
separately authorized worker roll-forward.

The new image must have these exact labels:

- `org.opencontainers.image.revision`: final revision.
- `com.tadazz.package-worker.source-manifest-sha256`: actual manifest file hash.
- `com.tadazz.package-worker.sdk-sha256`: final SDK source hash.

After the build, a separate read-only container verifies every required source
file inside the actual image, including all inherited files. The worker image is always addressed by its
immutable `sha256:` ID after creation.

## Fresh qualification flow

1. The current committed `createPackageFixture('complete')` generates synthetic
   media and a custom React theme. The driver retains one authored game with ten
   questions, sets all ten `cooldownSeconds` values to 2, validates it with current
   package preflight, uploads it to a fresh `PackageStore`, exports it through the
   current export method, and requests its real build.
2. The exact final broker runs against only that newly created synthetic store.
   Its existing worker uses 1 CPU / 768 MiB / 48 PIDs / 45 seconds, no network, a read-only
   root, an unprivileged UID, and only its owned input/output mounts. Qualification
   requires a real custom-runtime bundle plus matching source/output digests
   and the worker's actual `mediaValidated` result.
3. The driver accepts that real build, requires `preview-ready`, privately
   installs its one game together with its exact referenced sandboxed theme,
   requires `installed`, verifies that the saved native extras select that
   installed custom theme, and verifies all ten native
   questions still have cooldown 2. It reads the installed tenant's private
   synthetic media through `PackageStore.readMedia`, compares every byte hash,
   and runs the current real ffprobe/ffmpeg decoder. It exports the installed
   game, decodes its media again, and requires all ten re-exported cooldowns of 2 seconds.
4. A fresh copy changes exactly one question to cooldown 1. Current native
   preflight must reject `cooldownSeconds`. The real worker processes that same
   invalid package in an explicitly synthetic negative job; it must report
   `BUILD_REJECTED` with the actual cooldown field in its diagnostic and produce
   no bundle. A worker timeout or unrelated infrastructure error does not pass.
5. The final `build-runtime.cjs` compiles trusted current platform code inside
   the newly qualified image. Its source inputs must all match the final native
   manifest, both source revisions must equal the final commit, the compiler
   must be `esbuild@0.28.2`, and the recorded runtime digest must match the bytes.

## Bounds and evidence

The controller requires 3 GiB host available memory and at least 2 GiB Docker disk
headroom (or four times source bytes, whichever is greater). Trusted fixture,
decoder and compiler containers run sequentially with 1 CPU / 2 GiB, a read-only
root, no network, limited PIDs and bounded `/tmp`. The Docker context stream is
covered by a 360-second watchdog. Every actual container is checked for stopped
state and OOM, and any interrupted broker child is cleaned up only if all its
bind sources are inside this exact root's owned temporary directory.

`matching-worker-proof.json` is written only after source/artifact/driver pins
and cleanup are checked. Its `ok` is false on any failure. The positive proof
contains the unchanged operator contract, explicit media/native/re-export
observations, compiled runtime pins, and `productionChanged:false`,
`customerStorageAccessed:false`, `activationPerformed:false`.

The generated packages, native configuration, database, jobs and raw process
logs stay within this owned Oracle root. Deliver only bounded proof/manifests,
driver/controller source hashes and selected sanitized logs. A qualification
pass is not activation or an operator E2E result.

## Optional base metadata read

The separate metadata helper is also held until explicitly authorized. Keep it
beside the reviewed qualifier file and supply `--qualifier-source-sha256`, the
candidate/source-run/source-root values, and the input manifest path/hash. It
does not require or claim a successful native build because it performs only a
read-only cache comparison. It verifies the source inputs before and after,
hashes the same complete candidate path set inside the pinned base, and writes
an exact base inventory and delta estimate under a fresh sibling folder,
`/home/ubuntu/tadazz-worker-base-inventory-<sha12>-<8hex>`, outside the archived
preflight root and canonical source tree.
It uses 1 CPU / 768 MiB with no network and only one read-only manifest mount;
no candidate source bytes are copied. Its receipt is explicitly diagnostic,
not release-qualified, and `qualificationPerformed` remains false.

The full qualification re-reads the base against its successful final manifest.
The optional estimate cannot substitute for final image verification or any
package, native acceptance, decoder, negative-case or compiled-runtime gate.
