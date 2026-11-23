# C1 source preparation and exact writer boundary

**Historical foundation checkpoint `3b73fc1`.** The manager subsequently selected prototype A and the source wiring below was implemented. Current candidate, static evidence and remaining gates are recorded in [C1_PROTOTYPE_A_HANDOFF.md](C1_PROTOTYPE_A_HANDOFF.md). The implementation-not-wired statements in this foundation record describe that earlier checkpoint only.

Base: R2 evidence HEAD `96767de6d40b594324687e15b0f386b87dd7ef19`. Status: **source foundations prepared; C1 reservation/publication/service/startup wiring NOT implemented or tested**. There is no C1 runtime pass or durability qualification.

Completed authorized source work:

- The role-owned pre-edit ledger records exact protected symbols, base blobs, rationale, ceilings and future tests before the first protected edit (`C1_UPSTREAM_TOUCHES.md`).
- `config.ts` adds only the 18-line native preparer/import. It rejects invalid enabled-account scope before native allocation or collision lookup, uses the real validator, Nanoid21 and independent random8 filename utility, and returns normalized data without a public write. Erasing only this addition reproduces the whole original config file byte-for-byte, including every legacy CRUD implementation.
- New Linux fencing primitives use exclusive no-follow private writes, exact UTF-8/hash/length and decimal inode/device identity, complete writes, file and directory fences, fenced new-directory ancestry, and authenticated private-record replacement. A visible record after a failed directory fence remains evidence; no cleanup is inferred. Existing modes are not repaired. These are namespace primitives under explicitly stable service-controlled parents, not an openat2 or multi-process lock implementation.
- New creation scope helpers check enabled account ownership before fallback lookup, preserve exact owner spelling, distinguish explicit accounts-disabled global mode and detect scope/flag/root changes. Proposed startup discovery reads only a dedicated service-owned `.tadazz-creation-v1` registry, deriving tenant roots from its validated owner families; it does not scan customer tenant data or public quizzes. No real server has been queried by these helpers.
- Nine focused Linux fixture tests are prepared for byte/inode preservation, file/directory fence failures, symlinks, visible-marker uncertainty, missing scope, casing/flag changes and private-family-only discovery. **None ran.** No Windows functional test, typecheck, build, browser, server job, install or production/data operation ran.

Static evidence under `c1-source-preparation/`: source audit PASS; formatting exit 0; whitespace check exit 0. Official files-only freeze exits 1 with the sole mismatch `packages/socket/src/services/config.ts`. That is the separately approved, ledgered C1 protected addition; the UI-only freeze policy still permits only historical host seams. The guard, freeze manifest and approval files were not broadened or rewritten. This is an actual recorded guard failure, not a green checkpoint.

## Unavoidable interval and exact alternatives

Actual source has no shared mutation lease. Native `saveQuizz`, `updateQuizz`, `deleteQuizz`, the ID-assigning branch of `getQuizz`, downstream sidecar writes and Media writes operate independently. Their filesystem operations are synchronous, so ordinary same-event-loop requests cannot interleave inside one synchronous creation operation. Other writers/processes or reentrant callback mutations require an additional operating contract or guard.

For unenhanced legacy import, the required sidecar is null. The relevant interval is:

```text
inspect complete pair: sidecar absent
another nonparticipating writer creates sidecar
hard-link private owned base into its public basename
```

Linux `link` exclusively creates **one** pathname and cannot simultaneously predicate that operation on a second pathname's absence. This conclusion is an inference from the [link syscall contract](https://man7.org/linux/man-pages/man2/link.2.html), not an executed reproduction. A post-link check can retain the entire ambiguous pair and block startup, but cannot undo the fact that a base was published after a surprise sidecar appeared. A public null-sidecar placeholder would itself violate the legacy no-sidecar-publication contract. Enhanced creation can publish its owned sidecar create-new first, preventing a sidecar `EEXIST` collision from reaching base publication, but that does not solve the null-sidecar exclusion interval.

The manager received two concrete alternatives:

1. Qualify C1 under the adopted review's **single synchronous cooperating writer** operating contract and C1 reentrancy lease; inspect the whole pair before each exclusive publication, reject pre-existing sidecars before any base, retain unknown pair/evidence without destructive cleanup, and keep actual all-writer/native exclusion as a production enablement gate. Do not claim two-name filesystem atomicity or exclusion from arbitrary external writers.
2. Extend the exact protected-symbol lease to guard actual writers, then exercise the guard through those callbacks. A minimal in-process variant would register a downstream root mutation guard in native config and call it at the native `saveQuizz`, `updateQuizz`, `deleteQuizz` and ID-assignment write boundaries, plus downstream sidecar/composite/Media entry points including fast paths. This changes existing symbols beyond the currently approved additive preparer, even if compact code could fit the numeric ceiling. A genuine multi-process variant must hold a shared lease for each complete operation; a one-time guard check alone has its own check-to-write interval. Neither variant is silently introduced as a pure preparer or mistaken for F1-wide durability.

Publication, commit, restart replay, capability lifetime, real middleware integration and the SIGKILL/fence acceptance matrix depend on this disposition. No partial algorithm is wired into actual API/startup callers. A source-only reviewable boundary is preferable to a false guarantee. The manager must choose the qualified contract or exact additional writer hooks; no new human-owner confirmation is being requested.

The remaining C1 implementation must preserve frozen target IDs/bytes, full V2/import metadata and R2 root-ID/digest semantics; persist private identity before any public base write; use same-filesystem exclusive links without overwrite; classify both siblings and private witnesses before mutation; re-fence warm-visible commit evidence before releasing witnesses; and clean the private phase last. Existing Map stagers remain untouched. Hardware power-loss, C1 multiwriter enforcement and F1 Media durability are separate qualifications.

References checked for primitive design: [Node 24 filesystem API](https://nodejs.org/docs/latest-v24.x/api/fs.html#fsfsyncsyncfd), [Linux file and directory fsync contract](https://man7.org/linux/man-pages/man2/fsync.2.html). No library, dependency or runtime was upgraded. Original three source tasks and HQ stay open.
