# Tadazz multi-account release, verification, and recovery

## Design

Account mode uses verified email/password, one-time email codes, revocable manager sessions, and isolated tenant media, quiz, sidecar, and result directories. Public players continue joining by invite code without account registration. Legacy MANAGER_PASSWORD is disabled only after enabling account mode.

## Required production environment (never commit secrets)

- TADAZZ_ACCOUNTS_ENABLED=true
- JWT_SECRET stable and at least 32 characters; preserve the existing secret for active sessions and rooms
- RESEND_API_KEY sending-only key from the verified sender domain
- TADAZZ_AUTH_EMAIL_FROM=Accounts <accounts@send.goldypov.com>
- CONFIG_PATH=/app/config

The shared accounts DB is /app/config/tadazz-accounts.sqlite, WAL mode. Per-account content is /app/config/tenants/<uuid>/quizz, media, results, extensions/quizzes. Do not assign legacy data to the first sign-up.

## Cutover and QA

1. Back up the existing volume, .env, Caddy file and current Docker image; verify checksums and retain rollback container.
2. Build a candidate image from a reviewed, committed source revision. Run it on a separate loopback port against a copy of production data.
3. Smoke test health, /api/auth/mode, /manager, WebSocket handshake, private media through Nginx X-Accel and direct internal media denial.
4. Register and verify two accounts, create/read/edit/import/export/delete quizzes, verify cross-account denial including direct media links and live game controls.
5. Verify a player can join an active room by code only, and public projector can display authorized room media.
6. Verify actual email delivery, logout and reset-password session revocation, browser refresh/reconnect and restart persistence.
7. Swap the container only after all checks pass and preserve the previous image and config.

## Safe legacy migration

Only after deciding a specific verified account owner and backing up all data:
node scripts/local/Claim-Legacy-Quizzes.mjs --config /app/config --account VERIFIED_UUID
The command is dry-run by default. After reviewing the file list and confirming owner, add --apply; it copies legacy data, verifies SHA-256, refuses overwrite and leaves the original untouched. Never auto-claim on first registration.

## Rollback

Stop the candidate, restore the previous container image and original environment, and retain the volume and SQLite DB. Do not delete old or tenant files. Avoid running legacy and account versions concurrently against the same writable volume.

## 4 Nov 2026 QA

153/153 socket tests and 139/139 web tests passed on Windows source. Production-mode Docker, real external email, TLS and multi-device QA still require isolated acceptance before public enablement.
