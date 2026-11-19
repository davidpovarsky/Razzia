# Independent static review of the prepared theme worker smoke

## Decision

The prepared helper is suitable for one isolated run of the pinned synthetic fixture after the image prerequisite is resolved. This is a static review acceptance, not a worker PASS or production readiness approval. No worker, container, Docker operation or test was executed in this review. Product source, Git and customer data were untouched.

The reviewed helper is pinned to SHA-256 e656b7ea66bd6379829016b2426d8f206fdbf5ff6b66ecb0acb70bb79a5735a6. The manifest is pinned to 60e57a577a69cd592c1fd2c81cbc902878206050126693fb27b06c94d2a54b09. Full checks and evidence hashes are in independent-smoke-review.json.

## Verified preparation and isolation

All seven prepared file hashes and sizes match; all six recorded repository source hashes match. The fixture generator differs from its pinned source only in module and generated-video paths. The archive contains 60 regular entries, 513,103 uncompressed bytes, one compiled synthetic theme, two synthetic game descriptors and generated media. No traversal path or symlink entry was found. The prepared store has one request and one archive.

The helper checks the immutable image ID and uses --pull=never. It has no image build, image pull, application API, account or production-store operation. Only a newly staged, read-only synthetic archive and the run's disposable output directory enter the container. There is no Docker socket mount.

The builder runs as UID/GID 65534, with a read-only root, network disabled, all capabilities dropped and no-new-privileges. The host controller requires the Docker operator; this does not make the builder run as root. Bounds are one CPU, 768 MiB container memory, no additional swap, 48 PIDs, a 45-second worker invocation, an 8 MiB per-file limit and a 64 MiB noexec/nosuid temporary filesystem.

Success requires exactly bundle.json and result.json, regular bounded non-symlink output files, exact source and output digests, mediaValidated true, the expected toolchain string, one expected compiled theme and nonempty JavaScript. Source is rehashed afterwards. Cleanup inspects the exact container's owner label before removal, verifies absence and turns the receipt into FAIL if removal cannot be confirmed. The helper retains only scoped review evidence.

## Findings and required claim limits

1. **The prepared image is absent.** The reviewed image-readiness receipt records the missing exact image. No worker run has passed. Restore the exact trusted image separately, or revise and re-review all replacement image/helper/manifest pins.

2. **Source pins do not attest image contents.** The helper records repository hashes but does not read matching code inside the image. Its sourceCandidate field is manifest metadata. The builder enforces esbuild's actual version; React and ffmpeg versions in the result toolchain field are literals. The restoration plan must establish image-to-code and toolchain provenance before claiming qualification of the candidate compiler or those exact dependency versions.

3. **The new smoke and prior API test are complementary component proofs.** The prior nine-group browser receipt verifies real upload, preflight, review and install APIs, theme-only installation, saved selection and actual media rendering, using synthetic accounts. Its declarative worker result is explicitly synthetic. The new smoke would separately exercise the real compiled-theme builder and media probes, but directly invokes the builder instead of the broker scheduler and does not feed that real result through the previous API run. After success and provenance verification, it is accurate to say that the editor/API contract and compiler worker are separately verified. It is not an actual customer install, one joined end-to-end production import, a timer-health check, independent human content approval or proof that production executable runtime is enabled.

4. **Keep bounds and media claims precise.** The limits apply to the container and worker invocation. Host stdout/stderr capture buffers and aggregate writable bind-directory disk usage do not have independent quotas. With the exact small trusted fixture and bounded builder output, this does not block the scoped smoke; it is not a general arbitrary-workload resource proof. The fixture exercises images, WAV audio and MP4 video, includes Lottie and contains no font, so this run cannot establish font-decoder coverage.

## Review actions

Only prepared files, pinned repository source and the synthetic archive were read. Python syntax was parsed without executing the helper. The only writes are this review and its JSON receipt under docs/extensions/plans/ux-followup-20261119/theme-worker.
