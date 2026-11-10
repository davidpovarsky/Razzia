# Unified TADAZZ site — production deployment, 10 November 2026

> **Current release, 17:42 UTC:** Studio styling, loading/navigation improvements,
> asset caching and a small favicon are deployed, including the earlier touch fix.
> Current public entry is `/assets/index-I6QCz3Vn.js`. Future recreates must use
> `tadazz:site-audit-final-ba64f49`
> (`sha256:8bc2c0dc796151f0e9b8584773a980142bebdb0e14b30e704d3f207505196c2a`).
> See the [Hebrew review and current deployment evidence](SITE_REVIEW_HE_20261110.md).
> The running container was hot-patched without restarting its socket process;
> its original base-image ID remains unchanged. The release table below describes
> the initial deployment and remains historical evidence.

The owner explicitly instructed **"בצע פריסה"** after receiving the implementation
handoff and its known baseline test limitation. The unified site is now live at
[tadazz.com](https://tadazz.com), using the existing account backend and original
editor on the same origin. This supersedes the initial no-deployment status.

## Exact release

| Item                          | Deployed value                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Source revision               | `eeb973eea88766ea6388e034b4df830aa99d29f3` (implementation `2ec43cc`)             |
| Branch                        | `codex/tadazz-unified-site-20261110`                                              |
| Image tag                     | `tadazz:unified-site-eeb973e`                                                     |
| Image ID                      | `sha256:6b08742f1758aee1dc60554bbec5b885148209b3eaa4e5020b6db5ada6d92ba8`         |
| Running application container | `96e9a2b4c3f42edb6e4618309475b2893aa7e5d814fdb8527e5ed0220c554fb1`, name `tadazz` |
| Started                       | `2026-11-10T14:19:26.741504869Z`                                                  |
| Public JS entry               | `/assets/index-utt8Akjm.js`                                                       |
| Previous image                | `sha256:62f91aae8bb518196f27852ab5abc5d54120116b2dd0b98383fc5f3fe3d7ee34`         |
| Stopped rollback container    | `tadazz-pre-unified-site-eeb973e`                                                 |
| Private operator directory    | `/home/ubuntu/tadazz-unified-site-20261110-eeb973e`                               |

The downstream Dockerfile derives from the **exact inspected production runner**
and overlays the opt-in web build and socket bundle. Nginx and Supervisor config
hashes remain identical. The server-code diff relative to the previously deployed
source is the four-line downstream composite-deletion validation; the engine,
core schemas, original editor and `packages/**` sources were not modified.

Both builds ran locally with Node 24.22.1 and the frozen dependency lock:

```powershell
$env:TADAZZ_SITE_ENABLED = 'true'
pnpm --filter @razzia/extensions site:build
pnpm --filter @razzia/socket build
```

The 111-file artifact manifest records exact transferred hashes. Its initial
archive SHA-256 was `f6277612b7d0098ecb0a5a3e5616180234c0a88105dfd2e751736e76b25ef853`.
The Dockerfile and manifest were then updated to correct Windows tar permissions:
the first isolated image returned 403 because files were 0600. The final image
adds `chmod -R a+rX /app/web`; all final manifest entries were reverified, and the
final isolated image passed before production activation. The rejected image
was never activated on production.

Operator image build used Docker's existing legacy builder, with no network:

```sh
DOCKER_BUILDKIT=0 sudo docker build --network none --pull=false \
  --build-arg TADAZZ_BASE_IMAGE=sha256:62f91aae8bb518196f27852ab5abc5d54120116b2dd0b98383fc5f3fe3d7ee34 \
  --build-arg TADAZZ_SOURCE_REVISION=eeb973eea88766ea6388e034b4df830aa99d29f3 \
  -t tadazz:unified-site-eeb973e /home/ubuntu/tadazz-unified-site-20261110-eeb973e
```

The actual invocation passed `DOCKER_BUILDKIT=0` through the subprocess
environment. The build context contained application artifacts and operator
scripts only, without production credentials or the later private backup.

## Data and service preservation

- The last registry event showed **zero active game rooms**, rechecked before
  cutover. The application was stopped for a consistent backup and replacement;
  no active room was interrupted according to this preflight evidence.
- Original bind mount remains
  `/var/lib/tadazz-release-5312660/config:/app/config`. No account/game migration,
  tenant copy, quiz rewrite or credential change was performed.
- A private full data archive was created while the application was stopped:
  `production-data-private.tar.gz` in the private operator directory, mode 0600.
  SHA-256: `1b7c97cd023a43ac2e9a0071eddee73789669375a77952091d5241cf6054098f`.
  No backup contents, tokens, passwords or production databases entered Git.
- **337 non-SQLite payload files** were hash-compared before/after activation
  and remained unchanged. SQLite storage remained in its original bind mount;
  the consistent archive includes its data. Existing account/session signing
  secrets and the complete container environment were preserved byte-for-byte.
- Container mount and host configuration were compared for equality. Account
  mode remains enabled; package installer remains enabled; executable package
  runtime remains disabled; billing remains `enabled:false`.
- Telephone gateway ID, image and start time remain unchanged. No provider
  settings, callbacks, numbers, DNS, Caddy routes or package-worker units changed.
  No PSTN call, checkout, live signup, email or production game creation was used
  for these deployment checks.
- The original application container is retained stopped for code rollback.
  The disposable candidate used tmpfs data and synthetic credentials only and
  was removed after verification.

## Verified outcome

Before activation, the loopback-only candidate passed health, the checked SPA routes,
fingerprinted assets/reference assets, Nginx config validation and Socket.IO
handshake. Protected account/game/results/package APIs returned 401 without a
session. No production data or credentials were mounted in the candidate.

After activation, public HTTPS returned the exact built HTML with
`Cache-Control: no-store, no-cache, must-revalidate`; health returned 200;
account mode returned true; billing returned false; private APIs returned 401.
The public Socket.IO handshake succeeded; unauthenticated media returned 401
and the internal-only media alias returned 404.
The socket bundle hash matched the new build, and the gateway identity was
unchanged. An external Edge Chromium browser smoke passed, including desktop
and mobile screenshots, no horizontal overflow or page exceptions, asset loads,
login/signup/reset entry routes and guest Studio → login redirection.

Exact browser command, from the worktree root with Node 24 on PATH:

```powershell
node extensions/node_modules/@playwright/test/cli.js test --config extensions/site.production.playwright.config.ts
```

Result: **1 passed (7.4s)**. It is deliberately read-only. Earlier acceptance
remains 671 extension tests, six site browser scenarios and four compatibility
scenarios passed. The previously reproduced Windows root-suite upload test
failure remains documented; this deployment does not claim it was fixed. Live
authenticated editing/payment/mail/PSTN end-to-end execution was not repeated.
Unavailable template installation, scheduled events and contact delivery remain
explicitly unavailable, as documented in the implementation matrix.

Evidence under `qa-evidence/unified-site-20261110/`:

- `production-deployment.json`, `production-candidate.json`, `production-http.json`;
- `production-artifact-manifest.json` (111 verified artifact entries);
- `production-browser.log`, web/socket build logs; final repository lint and
  format passed, and the deployment script passed Python compilation;
- `production-marketing-1440.png`, `production-marketing-390.png`.

Additional maintained files for this deployment are
`extensions/deployment/unified-site.Dockerfile`,
`extensions/deployment/deploy-unified-site.py`,
`extensions/site.production.playwright.config.ts` and
`extensions/qa/site-public-production.spec.ts`. The original implementation's
145-file inventory remains a record of its initial commit. This operational
follow-up does not change the product implementation or upstream sources.

## Rollback — only if separately needed

Inspect current identity and active rooms first. Stop and retain the new
application container under a unique name, rename
`tadazz-pre-unified-site-eeb973e` back to `tadazz`, and start it. It already
retains its original environment, host settings and data mount. Verify public
health and original shell after the switch. This is a code rollback: **do not
restore the data archive over subsequent customer writes**. Any data restoration
requires a separate explicit decision. Preserve both pinned runner images and
the private backup; do not run broad Docker pruning.

The deployment script automatically restores the old application if activation
checks fail. That rollback path was not needed: activation completed successfully.
No Git push or merge was performed. Source defaults remain OFF; this release was
explicitly built with the site enabled. Users with a long-lived tab should refresh
to load the new site shell; existing editor/game links remain available.
