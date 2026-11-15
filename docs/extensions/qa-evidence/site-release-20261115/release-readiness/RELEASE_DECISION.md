# Site release decision packet — 15 November 2026

**The concrete Site-only candidate is pinned and its normal synthetic publish/rollback is accepted. Production remains unmodified. The native fault addendum now supplies four scoped witnesses and one retained inconclusive attempt; the sole manager retained this narrow Site-only vehicle. Actual action/control installation remains HOLD pending the existing exclusive-operation/final release decision.** This packet adds no approval stage: the sole manager uses the existing release authority and safety conditions. No routine ACK or separate reviewer is requested.

Source tasks1220482524632790 (title/metadata) and1220482471684895 (postdeploy) remain OPEN; completed locale1220482735946993 stays DONE. Full machine-readable pins/actions are in `release-packet.json`, exact rollback map in `expected-rollback-web-inventory.json`, source comparison in `source-integration-delta.json`, fresh read-only audit in `production-readonly-inputs.json`, and concrete live cases in `live-acceptance-plan.json`.

## Source and release scope

Application9b221bc0edabe449cdf27bc818ae77acbc676bae; test-only selector successor31b3cb084efeb50dced6952498e9703cb47dc45c. Against Site base8a43c99..., the19 changed/new non-document paths include metadata/bootstrap/composition/locale/search and tests. Every one is byte-identical at manager checkpointb208609a3005c5e03db12556f5ded3285a33e44a. Selector successor changes only the browser locator. Deployed backend sourcebff12a6 -> Site base8a43c99 has an empty server/core/socket/common diff.

The retained152-file artifact is the9b build with manifest406a22ea...; image54d162fa... is its merged242-file public inventory reference. It is **not** a build of integration checkpointb208609. That checkpoint contains105 additional source/runtime/lock paths, principally Show Library, MCP, Recovery and Telephony. Those additions are not shipped by switching this artifact. A Site-only release intentionally retains backend417cc204 and gatewaydb188862; a release of newer integrated capabilities needs its own real build/provenance and is not silently covered by this packet.

The approved upstream HTML exception remains exactly application-name/description/title capitalization. No logo/editor/Theme Builder source is changed. The historical unchanged boundary guard still reports that approved HTML exception; no global guard/full-CI green is asserted.

## Fresh read-only audit

At2026-11-15T15:22:20.962552Z, fixed-target audit underCPU6.25%/128MiB/no swap exited0: **202/202 live public-base files,152/152 operator artifact files, all three manifest pins and five protected executable/Nginx/Supervisor hashes matched**. Candidate imageID/31b label matched; production fullID/start/image, sole config bind and empty tmpfs matched. No customer/config contents were read. Free disk2,649,296,896B; no production web stage existed. A preliminary Docker template probe failed because Tmpfs key was absent; the subsequent Python audit correctly read absence as{} and verified the full contract. Do not relabel that preliminary command as a pass.

The production control directory `/home/ubuntu/tadazz-release-control` is absent. The measured size receipt is absent from the retained operator root. Its existing `atomic-web-publish.py` hashes9b0355750016e69b480827ea16e15fa4cc2a4a82b0f05ca5fd833375b7307b0a, **not** reviewed352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2. Preserve that older helper/receipts. Do not run it or overwrite it as an incidental setup step. No production controls/code/lease were installed by this work.

## Exact action if the existing release conditions are satisfied

The release decision binds **only** containerdd1401638311a15212e52dcf0153b759003feb83fbce89c6b2756c9ff6732891, image417cc204..., start2026-11-12T03:38:48.157101207Z; operator `/home/ubuntu/tadazz-unified-site-20261115-31b3cb0`; control `/home/ubuntu/tadazz-release-control`; canonical lock `production-release.lock`. No caller target/environment override is supported.

Under that one existing release decision, provision new controls with no overwrite: UID1001 directory0700, canonical single-link lock0600, approved-helper pin exactly352734..., and an immutable full-action lease binding the target/start/image/helper, freshly issued32-hex nonce and publish/rollback/reconcile from the outset. The lease bytes remain unchanged throughout the rollback window. Supply the measured receipt ff28b436... at both operator root and control path, as required by payload and target receipt checks. Record no-follow ownership/mode/hash receipts and preserve any unexpected existing control/hold rather than replacing it.

Stage the exact checked-in a5682df production-entry source in a root-owned, non-writable-by-unprivileged-users directory:
`/var/lib/tadazz-release-code/352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2/atomic-web-publish.py`.
This is versioned code custody, not an extra signature/approval workflow. Keep the existing9b035 helper untouched. Reverify source SHA before use; do not run privileged code through a mutable unverified copy. Retain source/inputs and operation receipts through the manager-defined rollback window.

Fresh preflight repeats the202-file base,152-file artifact, all hashes/identity/mounts, no foreign stage/hold, actual free-space and writer exclusion. Exclude both legacy deploy-unified-site.py paths (20261110-eeb973e and20261112-bff12a6), their in-flight descendants, manual lifecycle commands and concurrent public-web writers for the operation/rollback window. The disabled legacy wrapper is not installed enforcement. The helper alone acquires its flock; do not prehold it from the coordinator. The unchanged unless-stopped policy is outside that advisory lock: do not change system settings; a restart/changed identity yields indeterminate.

The one production publication invocation would be:

```sh
sudo -n /usr/bin/python3 -I -B /var/lib/tadazz-release-code/352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2/atomic-web-publish.py publish
```

**NOT EXECUTED.** Capture its single create/start/positive start/terminal exec and canonical hold without an automatic retry. Expected unchanged-input payload is3,502,080B SHA da1144d4...; backup80,969,610B; changed incoming bodies3,315,539B. Proposed128MiB incremental persistent allocation includes backup/incoming/journal overhead and currently fits above2GiB floor; it is an estimate, not measured peak or a test reservation. Recheck actual headroom at execution, preserving all idle fixtures/metadata/backups. This writes public web only, no Node/Nginx/container/gateway restart, credentials/config/database/provider action or customer backup/restore. The backend OCI image stays417cc204;54d162 is an inventory reference, not activated image.

Accept only verified / new-entry-complete / journal-fenced, closed hold and matching exec terminal0; independently verify all242 candidate hashes and202 backups, unchanged target/mounts/process starts, new entry9a9edaf3... and referenced immutable assets/old retained assets. Observe public health/auth boundaries and exact HTTP body/cache hashes. Public HTTP200 alone is not game/account acceptance.

## Exact rollback and uncertain outcomes

Only after a **verified closed** publish and still-matching target/inputs/lease, the existing release scope permits one corresponding rollback decision:

```sh
sudo -n /usr/bin/python3 -I -B /var/lib/tadazz-release-code/352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2/atomic-web-publish.py rollback
```

**NOT EXECUTED.** Preserve the closed publish receipt before replacement. Require a distinct positively observed running/terminal0 exec, verified old-entry-full-additions/journal-fenced, a new closed hold linked to publish, exact242-file rollback map (old81a5fbe9 index, all40 additions retained),202 unchanged backups, unchanged process/container identities and old entry HTTP. Never restore a customer-data archive over newer writes. Do not rerun/re-publish the completed synthetic175b fixture; its one-use rollback and stage remain intact.

On missing ACK, unknown/evicted unproved exec, I/O/fence error, identity change or indeterminate result: retain hold/exec/stage/backup/lease/inputs, do not retry, restart, clear a hold or issue a blind rollback/reconcile. A visible entry hash does not prove writer quiescence. Any recovery must meet the existing helper's qualified terminal/disposition rules; this packet invents no override.

## Acceptance and the manager action still needed

| Item | Actual disposition |
| --- | --- |
| Exact352734 normal synthetic publish/finalization | Accepted prior transparent trial;242 live/202 backup; original closed publish preserved |
| Same-fixture rollback/browser continuity | Manager independently accepted atb208609;87 exec records/79 running+terminal0;291 all200 samples;3 answers; stable five page/process identities |
| Candidate route/locale metadata | Current Chromium48 + WebKit48 observations; eight locale searches in both;1366/390; prior matching source/image/account-stage proofs explicitly reused |
| Current production public baseline |26 read-only browser observations; legacy capitalization still present; not postdeploy acceptance |
| Lost-ACK and real child write/fence qualification | Updated scoped native witnesses: see ../fault-qualification/RESULTS.md (ACK drop, backup write/file-fence EIO injections and actual kernelEROFS; one inconclusive attempt retained). Final coverage/limits remain for existing manager release review |
| Active game during original352734 publish / fresh WebKit active rollback | **Not proven**; do not infer from80de or Chromium rollback |
| Production grant/controls and exclusive live operation | Not issued/provisioned by Site. Sole manager's existing live-release decision remains necessary |
| Live authenticated/physical acceptance | **NOT_RUN**; original tasks stay OPEN |

The concrete postdeploy plan has96 locale/route cases, to be exercised in Chromium/WebKit at1366/390 (384 planned combinations, **not executed passes**), plus actual owned Studio/editor/host/player/display/manager redirect routes. Reuse immutable matching proofs for unchanged source rather than rerunning unrelated suites. Public pass uses GET-only contexts blocking mutation/WS; authenticated/game pass uses the already authorized private-pilot scope and genuine owned room/account, with no customer/spend/mail operations merely for smoke. Record raw HTML and hydrated title/app-name/description/OG/Twitter/canonical separately, locale/search/history, console/pageerrors/assets/fonts/screenshots, original game/audio and fullscreen/reconnect where permitted. PWA audit records app-name/favicon/theme-color and **no implemented manifest/installability**. Actual external crawler preview and physical/live gates cannot be invented from DOM tags.

**Manager action:** review the scoped native fault qualification and its remaining limits, establish the existing exclusive-writer operation, then decide whether/when to grant the already selected narrowly pinned Site-only release. Newer integrated features remain excluded. There is no Site deployment authorization now. All currently authorized assembly/read-only verification is complete and reviewable; no extra ACK/approval stages or new agents have been created.
