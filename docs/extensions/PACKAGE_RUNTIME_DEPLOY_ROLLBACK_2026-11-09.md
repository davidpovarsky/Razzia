# Package runtime staging and rollback

Scope: private Oracle staging only. No production deployment, push, public
tunnel, credentials or existing lab changes are authorized by this delivery.
Both package switches default OFF; keep them absent/false in production.

## Separate services and data

The application mounts the additive API only when
`TADAZZ_PACKAGE_INSTALLER_ENABLED=true` and account mode is enabled. React
packages additionally require `TADAZZ_PACKAGE_RUNTIME_ENABLED=true`. Derive
tenant identity from verified sessions and workspace grants. Preserve the
existing JWT secret; capabilities use a domain-separated HMAC, not a new
customer credential. `TADAZZ_PACKAGE_PARENT_ORIGIN` and
`TADAZZ_PACKAGE_RUNTIME_ORIGIN` must name distinct sites. Runtime hosting serves
only the read-only renderer/health service, never account APIs. Retain CSP,
Host checking and opaque iframe policy. Use HTTPS on separate registrable
domains for any future deployment; localhost/127.0.0.1 is QA-only.

Keep CONFIG_PATH and its `extensions/packages` directory private. SQLite stores
metadata; archives, immutable binary objects and build output are sibling files.
The operator runs `scripts/qa/package-build-worker.py STORE --image sha256:...`
periodically, outside the application. Pin the reviewed immutable toolchain;
do not mount a Docker socket in the application. Each job has no network,
unprivileged UID, read-only root/source, a private bounded output mount and hard
memory/PID/time/output limits. The Docker daemon itself need not be rootless;
the customer build process is unprivileged. Toolchain dependency installation
is a trusted operator step with frozen lockfile and scripts disabled. It is
never part of an uploaded package's build.

The repeatable private browser environment is
`packages/e2e/playwright.package-runtime.config.ts`, driven by
`scripts/qa/run-package-browser.py --root PRIVATE_DIR --image sha256:...`.
It uses its own synthetic accounts, volume and three internal ports, with no
host ports published. Browser review receipts are synthetic test data, not
human permission to publish real customer content.

## Backup, restart and redeploy

1. Stop writes in this staging application and stop its build broker; do not
   stop unrelated services. Checkpoint/close SQLite, or stop only the staging
   container so DB/WAL and files form a consistent backup.
2. Back up the entire private CONFIG_PATH, including account metadata, quiz
   JSON, sidecars, media and `extensions/packages` DB/WAL/objects/builds. Protect
   the backup like account data. Do not attach it to a public handoff.
3. Record application commit, platform image and immutable builder image IDs.
   Recreate only the staging container using the same private data mount and
   explicitly scoped networking. Do not reuse production data or secrets.
4. Start the application before the renderer. Recovery compensates interrupted
   `installing` journals before accepting API traffic. The renderer opens the
   package database read-only. Resume the external broker.
5. Verify authenticated catalog and imported games, asset hashes, preview and
   room creation. Re-run the package Chromium/WebKit suite and legacy suite.
   Confirm an interrupted install leaves no partial game/media references.

## Rollback

Package rollback selects a previously installed immutable version for future
catalog choices. Already running rooms retain exact source/build/theme pins;
keep their old assets and builds. Do not delete installed versions to simulate
rollback. Draft deletion is allowed; installed/reference-bearing deletion fails
closed with 409. Theme rollback does not delete imported games.

Platform rollback: stop only the new staging application, preserve/backup its
data, and restore the prior application image/config with both flags OFF.
Original Classic/legacy data is unchanged. Package-imported games still contain
normal normalized media references, but keep package objects available to the
matching version until all referencing games/rooms are intentionally retired.
Restore a consistent complete data backup if restoring the package database;
never restore metadata independently of binary objects or quiz sidecars.

## Future production gate

This implementation adds a versioned store alongside existing formats; no bulk
conversion is required. Start with a separately reviewed private pilot, staged
quotas, backup/restore monitoring and fixed toolchain. Obtain explicit product
authorization before deploying/enabling runtime for real accounts. Independently
review customer licenses/content/accessibility/performance, physical devices,
operational capacity and real telephony provider behavior. The acceptance report
lists measured coverage and exclusions. No marketplace publishing API is added.

## Final verified private QA image

Source: `354669edc365e10ad92bdbfbad9308b05cbcf133`. Application/toolchain snapshot:
`sha256:76a77a56d964b53611541c7a1a7594567fbee9b6bcc9bd547feda82646840d10`. It includes the passing compiled web build and verified `/verify`
source mirror. The immutable builder remains the separately pinned `41a49a0...`
image named in the acceptance report. No dependency download occurs per upload.

The canonical static runner supports:
`python3 scripts/qa/package-static-checks.py --source-root /verify --prefix completion`
from `/verify` with `TADAZZ_REMOTE_QA=1`. It checks all eight actual TS projects,
units, lint with `--deny-warnings`, format and build. The web solution's empty
`files` config alone is insufficient in `tsc -p` mode.

The host broker/browser runner accepts `--source-root /verify` and
`--config-name package-staging-visual-final`; it returns the real browser
exit code. A fresh dedicated synthetic config name avoids accumulated test
login/upload limits while retaining previous QA data. It never disables limits.
Use the recorded 2 CPU / 8 GiB / 1536 PID QA profile for the browser harness;
the final configuration qualifies 40 Chromium / 20 WebKit display pages at
800×600. Forty WebKit tabs exceeded this private host's memory budget and are
a documented capacity failure. This is not a per-viewer server container model.

Before backup, stop only this QA application's writes, checkpoint every SQLite
database and explicitly close connections (a transaction context alone is not
connection close). Archive durable metadata/objects/media/quizzes together;
exclude ephemeral SQLite SHM and truncated WAL files after checkpoint. The final
backup restored 1,991 durable files byte-exactly, and read-only smoke validated
installed games/assets. Keep backups private. The final evidence records exact
source, compiled files, image, container and backup identities. Retained immutable
images provide rollback; duplicate stopped QA rootfs copies may be removed only
after proving their images and bind data remain, without `docker rm -v` or pruning
unrelated resources. None of these operations authorizes a production rollout.
