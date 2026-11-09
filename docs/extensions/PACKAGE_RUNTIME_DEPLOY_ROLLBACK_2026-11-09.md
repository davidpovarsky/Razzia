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
