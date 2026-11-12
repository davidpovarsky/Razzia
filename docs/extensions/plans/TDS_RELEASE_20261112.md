# Tadazz design-system production release — 12 November 2026

STATUS: **DEPLOYED — READ-ONLY PUBLIC SMOKE VERIFIED**.

The owner explicitly requested: **"בצע דחיפה ופרוס לשרת tadazz!"**.
This authorizes pushing the verified feature branch and deploying that candidate
on the existing Tadazz server. It supersedes the earlier deployment hold.
No main merge, provider/billing change, customer-data migration, DNS change or
public tunnel is part of this release.

## Exact candidate and preflight

- Source revision: `bff12a63ec3f69a58123c0299eea991901680b94`.
- Implementation: `3570689c073014cb78ec0b33a572d414594ce3a2`.
- Pushed branch: `codex/tadazz-design-system-20261110`, origin
  `https://github.com/davidpovarsky/Razzia.git`; remote SHA matches the revision.
- Host: `tadazz-quiz-server`, public site `https://tadazz.com`.
- New tag: `tadazz:design-system-bff12a6`.
- New immutable image: `sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346`.
- Base runner: `sha256:8bc2c0dc796151f0e9b8584773a980142bebdb0e14b30e704d3f207505196c2a`,
  the previously recorded reproducible production runner including its web hotfix.
- New public JS entry: `/assets/index-D4sBj2w1.js`.
- Operator directory: `/home/ubuntu/tadazz-unified-site-20261112-bff12a6`.
- Current production container: `96e9a2b4c3f42edb6e4618309475b2893aa7e5d814fdb8527e5ed0220c554fb1`.
- Current underlying image: `sha256:6b08742f1758aee1dc60554bbec5b885148209b3eaa4e5020b6db5ada6d92ba8`.
  Its mutable web layer contains the previous ba64f49 hotfix; the retained old
  container therefore preserves the actual pre-release web state for rollback.

The 1,079-unit / 147-browser development acceptance is in TDS_ACCEPTANCE.md.
The release web build uses the same 1,203 verified inputs, Node 24.22.2 and
`TADAZZ_SITE_ENABLED=true pnpm --dir extensions site:build` inside the established
isolated QA environment. No root Node-26 Docker rebuild or dependency upgrade.

There are zero backend/common/core/server source differences from the originally
deployed eeb973e revision. This is a web artifact overlay using the existing
`extensions/deployment/site-web-hotfix.Dockerfile`; the production socket bundle,
Nginx main/server configuration and Supervisor bytes match the candidate exactly.
The immutable image was built offline with the pinned runner and no credentials.

PASS before activation: 154 artifact-file hashes; SPA routes; private APIs and a
valid-format unauthenticated media request return 401; internal alias returns
404; native `/ws` Socket.IO handshake; Nginx validation; four Chromium/WebKit
browser/viewport cases at 1366 and 390 pixels. These verify the scoped Tadazz
platform, title, assets, account forms, guest Studio redirect and caching without
creating an account, sending mail or starting a game. The candidate has synthetic
environment, tmpfs config, no production mount/credentials and no published ports.

The first operator probe used an invalid media name without an extension (404)
and the generic `/socket.io` path (SPA HTML). Source inspection established the
valid media-name contract and actual `/ws` path; corrected probes pass. Neither
observation required a product/image change or production mutation.

## Guarded activation and concrete rollback

Use the existing `extensions/deployment/deploy-unified-site.py` on the host with
this exact immutable image, source revision, release directory and inspected
current container/image IDs. It rechecks production identity and zero active-room
registry count immediately before stopping the application.

The script retains `tadazz-pre-unified-site-bff12a6` for rollback and creates a
private consistent full-data backup while the old application is stopped. Only
then is the new application created with the exact original environment, mount
and HostConfig. Original data remains at
`/var/lib/tadazz-release-5312660/config:/app/config`. No migration or backup-data
restore runs. Telephone gateway identity/start time must remain unchanged.

Health, exact public artifact, anonymous auth boundaries, config-file payload
hashes, environment/mount/HostConfig equality and gateway equality must pass.
On failure, the script stops and retains the failed application, renames the
old retained container to `tadazz`, starts it and verifies health. It never
restores the data archive over subsequent customer writes.

For a later code rollback, first inspect identity and active rooms; retain the
new container under a unique name and rename/start
`tadazz-pre-unified-site-bff12a6` as `tadazz`. This retains the actual old hotfixed
web layer and original data mount. The private backup is not a default rollback
input. No Docker prune or unrelated container cleanup is authorized.

After activation, repeat the read-only HTTPS browser smoke in Chromium/WebKit,
check the exact image/asset/backend/config/gateway identities and record the
result here. Physical devices, 40/20 capacity soak, external CI and authenticated
production/PSTN/payment/mail workflows remain outside the checks performed.
Asana has no connection; retain a pending synchronization report and OPEN parent.

Evidence: [preflight](../qa-evidence/design-system-20261110/release-20261112/production-before.json),
[candidate](../qa-evidence/design-system-20261110/release-20261112/candidate-result.json),
[artifact manifest](../qa-evidence/design-system-20261110/release-20261112/artifact-manifest.json).

## Verified activation result

Production activation succeeded on **12 November 2026 at 2026-11-12T03:38:48.157101207Z UTC**.
Source `bff12a63ec3f69a58123c0299eea991901680b94`; immutable image `sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346`;
running container `dd1401638311a15212e52dcf0153b759003feb83fbce89c6b2756c9ff6732891`. Public entry is
`/assets/index-D4sBj2w1.js`. Public HTTPS serves the exact approved HTML/artifact.

PASS: the four post-deployment Chromium/WebKit desktop/phone cases, zero page
exceptions and zero failed static assets, scoped Tadazz title/layout, account
entry forms, guest Studio redirect, private API/media denial and correct caching.
The earlier four isolated candidate cases also pass. No production account,
game, email, checkout or telephone call was created by these probes.

PASS: **154** deployed artifact hashes; exact preserved backend/Nginx/Supervisor
bytes; full environment/mount/HostConfig equality; gateway ID/image/start equality.
**337** private non-SQLite payload files remain hash-identical. Both SQLite
databases pass read-only integrity checks. The full consistent private backup
remains on the server with mode **0600**; its contents were never copied to Git.
The original container `tadazz-pre-unified-site-bff12a6` is retained stopped,
including its actual pre-release hotfixed web layer. Automatic rollback was not
needed. Only the temporary synthetic candidate was stopped after verification.

This release fulfills the explicit push/deploy request. Main was not merged.
The earlier capacity, physical-device, external-CI and authenticated production
workflow qualifications remain as stated; deployment smoke does not relabel them
PASS. Asana could not be updated; its pending synchronization report now includes
this successful release. The parent remains proposed OPEN for unresolved final
acceptance/qualification, with no claim about its unread remote checkbox.

Final evidence: [release summary](../qa-evidence/design-system-20261110/release-20261112/release-summary.json),
[guarded activation](../qa-evidence/design-system-20261110/release-20261112/deployment-result.json),
[post-deployment preservation proof](../qa-evidence/design-system-20261110/release-20261112/post-deployment-proof.json),
[public browser report](../qa-evidence/design-system-20261110/release-20261112/tds-release-bff12a6-production/report.json).
The read-only browser harness is retained as release-smoke-source.txt.
