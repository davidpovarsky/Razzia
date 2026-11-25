# Package worker repair and acceptance

**Status: passed.** The production package-builder timer now uses the verified replacement image and completed an actual generated Complete-package build at 2026-11-19 16:14:04 UTC. The final timer is active, waiting and enabled; its broker finished successfully with exit status 0. Both uniquely owned synthetic fixtures were removed. The accepted application, gateway, runtime configuration hash and stopped QA cache remained unchanged.

Asana blocker: **1220708526935641**, under theme task **1220705115002170**. Product source: 34568c5c937a51d236a440513adeb9bf93637525.

The authoritative final record is [R2 timer acceptance](phase3-r2-timer-receipt.json), with [execution and retrieved artifact hashes](phase3-r2-execution.json), [exact input transfer](phase3-r2-transfer-receipt.json) and [independent R2 static review](phase3-r2-independent-review.json). The mutable summary is [worker image readiness](worker-image-readiness.json).

## Fault and repair

The existing enabled timer invoked the reviewed broker with immutable image sha256:aea88c60c29d5160dfe5ae822179da4233ed882c3979b4d592f6cd86902e05c5, which was absent. An empty scan could still finish successfully, so service status alone did not demonstrate import readiness. The named documented deployment directories contained no exact image archive; the bounded archive search stopped there.

The broker itself matched the reviewed source: /opt/tadazz-package-runtime/package-build-worker.py, SHA-256 7b591a69dd4aca951cf0f8224670c797696979085ae23c01d596ab99159d60d6. Its bytes, package store argument and isolation contract were retained. Only the immutable image argument in the existing service unit changed.

| Identity            | Accepted value                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| Worker image        | sha256:4ef04ef752c23e5360399880f1bcf4c79c0f48900c9597bcaa68da8aa01d1411 |
| Immutable base      | sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647 |
| Service unit before | 64c191c2e03a28f134219b17295389e041d3e5ef71093a5912cd397f9ec69053        |
| Service unit after  | 7bfd2b44f2409588f162e278e2b3eb5a8671f61d81f1609ad29292608231559c        |
| Package store       | /var/lib/tadazz-release-5312660/config/extensions/packages              |
| Final receipt       | e9303029460cf83e7667d7bb0fcbe9748d061c64d0ab6b58c34e1a68af934e2f        |
| Final execution     | 020726f594525c70149889188f136da5eb87636cec836c9a1912c4967becb6ad        |

The accepted app explicitly uses /app/config, bound to /var/lib/tadazz-release-5312660/config. The helper inspected all mount ancestors of the actual package store to exclude a deeper overriding mount. The resulting path exactly matched the broker service argument.

## Phases 1 and 2: immutable provenance and isolated compile

The derivative contains 82 curated frozen source/configuration/manifest files and a provenance verifier. It did not copy the cache container's mutable /cleanup tree, credentials, customer data or QA state. Its Dockerfile used the existing pinned base without a dependency install or image pull, and the immutable base layer prefix remained unchanged. See [image build receipt](image-build-receipt.json).

A fresh container without a cache bind verified the 82 code hashes, 36 package checks and actual executable versions: Node 24.22.2, esbuild 0.28.2, ffmpeg/ffprobe 5.1.9, Python 3.11.2 and FreeType 2.12.1. Executable provenance did not rely on literal toolchain labels. [Phase 1 provenance](phase1-provenance-receipt.json) passed before compilation was admitted.

[Phase 2 compile](phase2-compile-receipt.json) repeated the same provenance checks and compiled a generated Complete archive containing synthetic images, audio, video, Lottie, a sandbox React theme and game descriptors. Each fresh container had no network, UID/GID 65534, read-only root/input, dropped capabilities, no-new-privileges, one CPU, 768 MiB memory including swap, 48 PIDs, a 64 MiB temporary filesystem, an 8 MiB output-file limit and a 45-second outer bound. Both owned test containers were removed, and the original QA cache remained stopped.

Independent review found a cleanup variable-shadowing bug during preparation. It was corrected before execution; the [archived cleanup guard](reviewed-tools/replacement/cleanup-target-check.json) records that the launch and final cleanup retain the same owned container name.

| Synthetic artifact | SHA-256                                                          |   Bytes |
| ------------------ | ---------------------------------------------------------------- | ------: |
| Complete archive   | 2d64baabbafa9dd12f07be4a97422167437f2d815b6363a62ec34e9de7eace4d | 520,223 |
| Actual bundle      | a789c772a2ba73788ce9548568a72b017a37236a5d4efd3c5d24b088e4acade6 | 752,963 |
| Result             | 9f4d6ec7dd8a1fd166f57c1d7bcb2598ab876840ae2a825cd4c576b94d7455c8 |     242 |

The bundle contains fixture-arcade; actual media validation passed. The production timer later produced the same output digest.

## Phase 3: production timer acceptance and bounded recovery

Activation occurred only after the main app deployment and accepted observation. Admission pinned the exact source, new app image/container, gateway, runtime hash, worker image, unit, broker and package-store mapping. The activation helper rehashed the exact runtime file without parsing or printing its contents. The accepted observation was required to be no more than 20 minutes old.

The [first attempt receipt](phase3-timer-receipt.json) remains an immutable failure record. The real timer compiled valid output, but the verifier assumed that LastTriggerUSecMonotonic was an integer. Systemctl returned a formatted duration. The helper therefore restored the old unit, paused the enabled timer and retained its exact owned fixture. It did not kill an active broker or alter the app. [Retained result proof](phase3-retained-owned-result.json) records the valid output and safe rollback.

The reviewed R2 helper introduced a bounded exact Decimal parser for systemd timespans and preserved the strict after-greater-than-before comparison. It rejects unknown, negative, duplicate, unordered, submicrosecond and infinite values, including the uint64 infinity sentinel. Eight valid and fifteen rejected parser cases, plus eleven offline admission/rollback guards, passed before execution. R2 used the separate [recovery observer](../post-deploy-worker-recovery-observation.json) and [observer execution](../post-deploy-worker-recovery-execution.json), preserving the initial observation.

R2 required the exact recorded rollback state and the four retained synthetic file hashes. It then created a separate absent synthetic tenant/upload, published the request atomically after its source, and let the existing timer run normally. No manual worker execution substituted for timer proof.

After the fresh result appeared, the helper stopped future timer triggers and waited boundedly for the existing broker to finish without killing it. It required an inactive successful broker, matching source/output digests, actual media validation and strict trigger advancement:

| Timer measurement       |      Microseconds |
| ----------------------- | ----------------: |
| Before R2               | 1,343,961,755,332 |
| After the new timer run | 1,345,319,387,745 |

Only then did it remove the new fixture and the exact retained first-attempt fixture with type/hash checks, without recursive store cleanup. The final timer was restarted and verified active/waiting/enabled; the service remained successful on the replacement image. Effective service properties and runtime flags were unchanged.

## Claim limits and preserved evidence

The missing production worker prerequisite is repaired, and actual timer-driven compilation is proven. The earlier nine native theme browser groups exercised real upload, preflight, review, install, save and reload behavior with a synthetic worker result. These are complementary layers of evidence; no joined signed-in customer production import was performed.

No customer package or job was inspected, installed, retried or removed. The only production-store content touched was the two uniquely owned generated fixtures, both now removed. Existing runtime executable-theme enablement and license/approval boundaries were not changed. This repair does not claim delivery of email, a payment, or any unrelated service activation.

The first failure/helper/admission and independent reviews remain historical. The successful R2 receipt, actual compiled output hashes, exact input-transfer record and original unit backup remain available outside the package store. No further worker execution is required for this acceptance.
