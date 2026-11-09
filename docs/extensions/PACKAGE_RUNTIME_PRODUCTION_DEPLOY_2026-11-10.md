# TADAZZ package installer — production deployment, 10 November 2026

This record supersedes the **staging-only deployment status** in the 9 November acceptance documents. It does not change their historical test results or expand the tested production qualification claims.

## Deployment

- Public site: `https://tadazz.com` (original domain, no user-facing staging URL).
- Application source branch: `codex/tadazz-package-runtime-20261109`.
- Application source commit: `5809cb4` (application code was last modified in `354669e`; later commits are documentation/evidence).
- Production runner image ID: `sha256:62f91aae8bb518196f27852ab5abc5d54120116b2dd0b98383fc5f3fe3d7ee34`.
- Docker's older legacy builder was used with a disposable Dockerfile changing only `RUN --mount=type=cache ... pnpm install` to `RUN pnpm install`.
- Original production bind-mounted account/game data directory reused; no data migration or guest roster export was committed to Git.
- Original live telephone gateway container retained unchanged.
- Active container names: `tadazz` and `tadazz-phone-gateway`.

## Enabled features and limitations

- `TADAZZ_ACCOUNTS_ENABLED=true` preserved from existing production.
- `TADAZZ_PACKAGE_INSTALLER_ENABLED=true` enabled.
- `TADAZZ_PACKAGE_RUNTIME_ENABLED=false` intentionally remains disabled.
- Game/data and supported declarative package intake is enabled, subject to normal account/media validation and theme-review requirements.
- Executable customer-authored React/TSX theme runtime requires a separately secured rendering origin and production review before enabling. Building a Complete archive successfully **does not** authorize that runtime to execute in production.
- Code-backed Complete installs are not claimed production-ready; users can test a Game-only archive now.

## Operator build worker

- Pinned isolated builder image: `sha256:aea88c60c29d5160dfe5ae822179da4233ed882c3979b4d592f6cd86902e05c5` (tag `tadazz:package-builder-5809cb4`).
- Builder uses pinned application dependencies, esbuild 0.28.2, React 19.3.0, ffmpeg 5.1.9, Python 3 and FreeType on Node 24 Debian Bookworm.
- Trusted operator broker copied from `scripts/qa/package-build-worker.py` to `/opt/tadazz-package-runtime/package-build-worker.py`.
- Systemd units: `tadazz-package-builder.service` and `tadazz-package-builder.timer`; timer scans queued jobs approximately every 10 seconds.
- Store path: `/var/lib/tadazz-release-5312660/config/extensions/packages`.
- User packages compile inside a networkless, read-only, unprivileged Docker sandbox with bounded resources. The live game container has no Docker socket mount. Uploaded code cannot change game scoring/timers.
- **Do not run `docker image prune -a` blindly**: the build-worker image is a tagged operator dependency, even though it is not a continuously running container. Preserve or rebuild the pinned image before package imports.

## Verified checks

- The separately configured runner passed `/api/health = 200` and unauthenticated `/api/packages/capabilities = 401`.
- Following the public cutover, external HTTPS home and `/api/health` returned 200; unauthenticated capabilities returned 401; `/api/auth/mode` returned `accountsEnabled:true`.
- Two synthetic package files, Game and Complete, passed the exact networkless worker build path: Game produced a valid minimal bundle and Complete produced a compiled React bundle.
- The **installed systemd timer** independently processed a synthetic Game package queued in the production package-store directory. The returned receipt reported `mediaValidated:true`, and disposable smoke data was deleted.
- Only two application containers run after cleanup. Reported available server filesystem capacity was approximately 32 GB.
- Production package import by an actual signed-in customer, independent reviewer approval, physical iPad testing and real PSTN/DTMF calls were **not** performed here.

## Backup and privacy

A consistent production data snapshot was taken while the original application container was stopped, copied over SSH to a private Windows backup directory and verified against the remote SHA-256 hash. The temporary remote archive was deleted after verification. Its SHA-256 was `54d589ee8fa0df3d80c542a7724f7ccce4cb212971d998cbc4e73510e70d3731`.

The repository is public. It contains **source and non-sensitive evidence only**, not production account databases, participants, billing credentials, signing secrets or private backups. To restore production data, use the private separately retained backup, not the public Git repository.

For management UI testing: sign in normally at `https://tadazz.com`, open **Quizz → Install TADAZZ Package**, and start with `extensions/fixtures/packages/game-arcade.tadazz` from this branch.
