# Site atomic operator source ledger — 15 November 2026

This directory records review-only operator work. The Site application source
and candidate web artifact were not rebuilt or modified by this operator
checkpoint. Its parent is Site branch commit
`31b3cb084efeb50dced6952498e9703cb47dc45c`; the corresponding candidate web
inventory is associated with image
`sha256:54d162faae23681b56279d85b8dfa1243c6a9fb8fd62f5bb87c91479f7f4a79d`.
The captured base backend image remains
`sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346`.
The current running deployment and the candidate image are not changed by this
commit. `source-provenance.json` and `image-build-receipt.json` retain their
original distinct revisions and should not be conflated.

The reviewed, frozen source candidate is
`history/v5-admission-20261115/atomic-web-publish.py`, SHA-256
`80de09e02b483377cfdf984fab9ca2c144ae224ace8f7e6756aef8e7a0d2a20b`.
The corresponding tests hash to
`75d80a07f51d9df4da067084638cc6e472467b942b7a5db69477de713ebefd95`;
the review-only disabled wrapper hashes to
`0e70646ec9f58f9c59daf97dc449c8cd82c21b48a6b050d814cbcb68407a57ed`.
The root-level copies have the same hashes. The public size/control receipt is
`ff28b4363b86e3f7430ccc895872d0390c5943c6955f8f5e9003b83232ab99d9`.

The independent source review
`Codex-Agent-HQ/docs/tadazz/reviews/SITE_ATOMIC_80de09_REVIEW_20261115.md`,
SHA-256 `06ab729d7472b9068aebc1a200092cf80b818e252690629ee1b5a302cb3b4e1d`,
approved the two source corrections for disposable-fixture QA, not production.
The exact-helper producer ran 17 focused Linux tests; the log hash is
`d67b697e07352baadc3a0c5bc23705992bd01e2ed8aa76419ca1e2afe3c30c92`.
Evidence is retained in
`Codex-Agent-HQ/docs/tadazz/qa/fresh-team-20261115/site-interlock-80de09-evidence/`
and the matching server QA evidence directory. Some tests inject EIO and mock
the Engine; they do not prove an actual disk fault or successful publication.

An independent positive publish/rollback, HTTP and game-continuity trial applies
to earlier frozen helper `479875`; it is not a positive trial of `80de09`.
The new exact-helper fixture QA and fault matrix remain open. Production
`REVIEW_GATE` remains false and the legacy/manual wrapper remains disabled and
uninstalled. No push, merge, deployment, production action or task completion is
authorized by this source checkpoint. The actual commit ID is supplied by Git
and the associated handoff, rather than embedded as a self-referential value.

## Future web-only activation packet — review draft, not authorization

**Current decision: WAIT.** Independent QA of exact `80de09` has now verified
publish and rollback, all 202 baseline/backup hashes, 242-file published and
rolled-back trees, 79 complete HTTP 200 responses, three successive synthetic
game answers, and stable browser, Node and Nginx identities. The separate
lost-acknowledgement and write/fence fault qualification remains open; the
constrained Engine-proxy proposal awaits its own review, and safe targeting of
an actual child EIO remains unproved. Those results do not test the new entry
revision below. The old `80de09` production gate remains false; the wrapper is
disabled and uninstalled. The separately versioned entry revision requires its
own immutable source review, targeted admission tests and synthetic positive QA.
The manager decides the live operation only after all gates below are satisfied.

### Inputs to bind and retain

| Input | Required exact value |
| --- | --- |
| Operator source Git commit | `7bc1d3bef5af2df1daf20dd9c9c6fe632fd933ef` |
| Current reviewed helper | `80de09e02b483377cfdf984fab9ca2c144ae224ace8f7e6756aef8e7a0d2a20b` |
| Proposed production-entry revision | `352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2` (source-only; not tested or approved) |
| Focused tests / disabled wrapper | `75d80a07f51d9df4da067084638cc6e472467b942b7a5db69477de713ebefd95` / `0e70646ec9f58f9c59daf97dc449c8cd82c21b48a6b050d814cbcb68407a57ed` |
| Base / candidate web manifests | `f79f270e5be9662e3f5b36c7de9bebb7077da387d92cfd37ddceaac7e1817ca9` / `3f7b3942cca983f09a6fd15d335ac7b01895fc5c9530dd339ac0721a59a20b57` |
| Artifact manifest / measured receipt | `406a22eadb840f0ac0c8fd269ed2444287157eadbbf15f1779c4a967d2507730` / `ff28b4363b86e3f7430ccc895872d0390c5943c6955f8f5e9003b83232ab99d9` |
| Old / new `index.html` | `81a5fbe942c74398e002a17205bba112b9e021cef416b83756aa8fd2e76fdf6e` / `9a9edaf33fbcdddc569b66fb1044c2280eb83732c958653019fb499c05681f71` |

Keep the complete immutable operator inputs, manifests, measured receipt,
source and execution receipts, journal, canonical hold and verified public
backup for the **entire manager-defined rollback window**. The helper consumes
the input set again on recovery; backup-only recovery has not been proven.
Provisioning an input or approved-helper pin on the host is itself a future
reviewed step, not an action performed by this packet. The measured receipt and
operator artifact contain public web metadata/bodies, not a customer-data
backup. Do not overwrite an existing input, stage, hold or foreign file.

### Exclusive operation and fresh preflight

1. The manager registers a non-expiring, exclusive HQ operation and verifies
   the private `/home/ubuntu/tadazz-release-control` directory and canonical
   `production-release.lock` ownership and permissions. The helper acquires
   that flock itself; a separately pre-held flock would prevent it starting.
   The lease must cover the initial action, uncertainty disposition and any
   recovery, and its `hq-lease.json` must bind the exact helper, target, start,
   image, nonce and permitted actions as expected by the reviewed successor.
2. Recheck competing jobs immediately before the operation and maintain the
   exclusion: both older `deploy-unified-site.py` entrypoints and all manual
   production container lifecycle commands are forbidden unless a separately
   reviewed cooperating mechanism holds the same lock and honors the same
   persistent hold. The checked-in wrapper is disabled, uninstalled and cannot
   prove legacy descendant quiescence; it does not grant that mechanism.
   The named package-build worker was classified as isolated; this is not an
   assertion about arbitrary root scripts. Automatic restart and OS failure
   are outside the advisory lock and require an indeterminate disposition.
3. Under that operation, re-read rather than assume the full container ID
   `dd1401638311a15212e52dcf0153b759003feb83fbce89c6b2756c9ff6732891`,
   image `sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346`,
   running state and start `2026-11-12T03:38:48.157101207Z`. Confirm the actual
   sole bind tuple `/app/config` ← `/var/lib/tadazz-release-5312660/config`
   (writable) and the expected empty Docker tmpfs map without reading config
   contents; reject any extra/changed mount. A changed start or identity is a
   stop condition, not permission to restart or repair the service.
4. Rehash the exact retained inputs and verify space, same-filesystem staging,
   private permissions and absence of an unresolved hold or foreign stage.
   Confirm the entire current public web tree is the exact 202-file base
   inventory. Any changed, missing, extra, special or ambiguous path blocks
   activation; do not normalize it. Take read-only pre-operation Node/Nginx
   process identity/start-time and public HTTP baseline samples for later
   comparison without printing environment, credentials or customer files.

### Publication, checks and rollback disposition

If the manager has authorized the exact reviewed mechanism, it must verify and
retain the private 202-file public-web backup **before** any new public link.
The intended single-entry switch adds 40 candidate assets and changes the
entrypoint, yielding the pinned **242-file candidate inventory**. Confirm the
backup hashes, complete new inventory, new entry hash, relevant file/directory
fences, durable journal/hold disposition and final target identity before
recording success. Observe public HTTP status, full entry hash and referenced
assets/cache behavior; compare Node and Nginx PID/start-time and container
identity with the pre-operation baseline. These checks do not by themselves
prove customer game continuity; any live authenticated/game acceptance needs
its separately authorized scope and evidence.

The runtime backend container remains OCI image `417cc…`. A verified new
public tree corresponds to the web inventory associated with candidate image
`54d162…`; **that image is not activated** by a web-only switch. Do not describe
the result as a container/image deployment, and do not infer that later
container recreation will preserve the web-only overlay.

If the result is uncertain, retain the non-expiring lease, control record,
inputs, backup and stage. A visible hash or read-only observation may race a
lost exec. Require proof of the same child's positive start and terminal stop,
unchanged target/start/mount identity, and the qualified failure disposition
in the independently reviewed procedure. Unknown, missing or evicted exec proof,
unclassified outcome and storage error remain blocked; no timeout, interactive
word or directory hash alone clears them. The helper's conservative hold may
require a separate reviewed administrative recovery; do not improvise one.

For an authorized and proved rollback, use the retained complete backup and
unchanged inputs under the same lease. The expected result is the old entry
plus the **40 retained new assets**, so the resulting 242-file tree is not the
original exact 202-file base. Verify the old entry and referenced assets over
HTTP, complete backup, hold/journal and unchanged process/container identities.
Retain the input set and backup until the rollback window ends by manager
decision. An unresolved I/O or durability failure is not a successful rollback.

This packet authorizes no Node/Nginx restart, gateway or backend change, data
migration, provider/billing change, private database/config access or customer
backup/restore. In particular, never restore any backup over newer customer
writes as part of this web-only procedure. Site source and post-deploy tasks
remain open until their separate acceptance evidence is obtained.
