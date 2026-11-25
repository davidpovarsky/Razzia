# Lint and WebKit follow-up evidence — 9 November 2026

Source commit: `ca5cadbedb7a185148cbf523ac055f54eda170c4`.
See `../../LINT_WEBKIT_REPAIR_2026-11-09.md` for changes, scope and limitations.

All checks ran in the networkless, portless Oracle QA container from `/verify`.
No Windows application execution, production deployment or provider calls.

- `checks.json`: commands, exit codes and the documented complete extension rerun.
- `browser-checks.json`: four suites: original upstream 21, current UI 22,
  cleanup 28, package runtime 6. Total 77; zero failures, skips or flaky cases.
- Unit reports: root 365 and extension 659, total 1,024, no failures or pending.
- Seven TypeScript logs, final lint report (zero diagnostics), formatter and build logs.
- Full browser/unit reports and logs are gzip-compressed without content edits.
  `raw-input-hashes.json` authenticates the exact decompressed Oracle inputs.
- `source-inputs.json.gz` and `source-verification-final.json`: all 1,752 final
  local source inputs match Oracle. Only the two delivery Markdown reports changed
  after the passing suites; final lint/format checks were then rerun.
  The source-parity export test regenerates the archived native-scenes HTML
  harness as output; it was restored to its unchanged local baseline bytes
  before final comparison. This historical QA artifact is excluded from lint/format.
- `source-verification-before-tests.json` is the earlier historical snapshot.
  The generated motion stylesheet was subsequently restored byte-exactly and
  all 659 extension tests, build, lint and format rerun successfully.
- `immutable-inputs.json.gz`: 791 fixtures, public/imported assets, governance
  snapshots and prior evidence match their pre-repair bytes.
- `protected-apps.json`: production and both labs retain container/image/start
  identities; package flags remain disabled. Only allowlisted metadata is saved.
- Twelve selected Chromium/WebKit screenshots show native host/player and
  cinematic/public display surfaces. Device coverage is browser emulation.

`SHA256SUMS` covers every artifact here except itself. Databases, backups, account
state, cookies, credentials, environment files and browser traces are excluded.
The builder log records actual pinned unprivileged networkless build execution.
The coverage claim is these four isolated configurations, not every historical
default-glob probe or a GitHub CI run. Build notices and transient preview
teardown connection resets are retained in the byte-exact logs.
