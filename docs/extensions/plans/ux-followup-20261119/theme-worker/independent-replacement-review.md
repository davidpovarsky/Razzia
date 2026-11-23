# Independent review of replacement worker phases 1 and 2

## Decision

**Static review accepted for the corrected, pinned phase 1–2 artifacts. No remaining static blocker was found for the scoped synthetic work.** Runtime evidence is still pending: this review did not build an image, run Docker, start a container, compile a package or execute a test. Source, Git, services and customer data were untouched.

The corrected smoke helper SHA-256 is 10192d4dbfa3fa0741b8d90fdc4d68f71fadb6c8b91ee4ab0bcafa56c8914062. The build helper, context manifest, source pins and verifier retain their frozen hashes in independent-replacement-review.json. The original independent-smoke-review files are preserved as historical evidence.

## Defect found and corrected before execution

The initial smoke helper, ad9c97e466b617411d5c41e7f47b7237de0374bc04f30affa2386dcc53c1350b, reused the variable name for the executable-version loop. That replaced the Docker container name before finally cleanup and could produce an incorrect cleanup success for an absent executable-named container.

Execution was held. The author changed the loop variable to tool_name, refreshed the helper pin and added a static cleanup guard. Independent AST inspection confirms a single container-name binding in main and that the launch and cleanup paths retain it. This was a resolved pre-execution review finding, not a failed container run.

## Verified artifact equality

All 86 context files match their recorded hashes and sizes, with exact inventory equality and no symlinks. All 82 curated source/configuration files match both the source manifest and frozen repository bytes. No node_modules or mutable QA cache filesystem is included in the copied context. The original synthetic fixture manifest and its seven file pins are unchanged.

The derivative starts from the exact immutable base image 612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647. It copies only the curated source and provenance files. Its Dockerfile contains FROM, COPY, LABEL, WORKDIR and USER, with no RUN or installation instruction. The build helper requires the local base, a fresh derivative tag, exact input pins, expected labels and retained base layers. It records BUILT_NOT_ACTIVATED and contains no service or timer command.

## Fresh in-image provenance and phase gates

The verifier checks the actual bytes of all curated source files inside each fresh image. It resolves package names and versions from the image's actual dependency paths and obtains actual executable versions for Node, esbuild, ffmpeg, ffprobe, Python and FreeType. It records executable/package evidence and fails before compilation if any comparison fails. This addresses the earlier gap where repository source pins and literal result labels alone did not attest image contents.

The first runtime phase invokes verify-only and expects only provenance.json. The host checks the verifier and manifest digests, full source inventory and hashes, package metadata, actual executable versions, UID, platform, zero failures and compileAdmitted=false.

The compile phase requires a previous provenance-only PASS receipt for the same immutable image, source manifest and context manifest, including successful owned cleanup. It starts a fresh container and repeats all provenance checks before invoking the real package builder. It then checks exact output inventory, source digest, bundle SHA-256, media validation, compiled theme identity, bundle shape and unchanged input.

Both runtime phases retain network isolation, non-root execution, read-only root/input, dropped capabilities, no-new-privileges, CPU/memory/swap/PID/file/tmpfs bounds, a 45-second outer timeout and exact label-owned cleanup. Only fresh synthetic input and dedicated disposable output are mounted. No mutable cache bind or application account/store access is used.

## Claim boundaries

The fresh provenance and compile receipts must still pass; static review cannot substitute for them. Production timer activation, post-deployment store binding and any timer-driven synthetic job belong to a separately reviewed phase 3.

The Docker build uses network=none and contains no RUN/install instruction. This review did not independently audit daemon-wide egress. Container limits also do not impose separate quotas on host capture buffers or aggregate bind-output storage; the intended workload remains the exact small pinned fixture.

A successful real compiler smoke plus the prior actual upload/preflight/review/install API test establishes complementary component evidence. It remains distinct from a joined production import, an actual customer installation or live scheduler-health proof.
