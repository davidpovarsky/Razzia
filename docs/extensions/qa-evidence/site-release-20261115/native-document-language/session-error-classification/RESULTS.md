# Session error classification from existing logs

The one `errors:auth.sessionFailed` in the corrected Chromium/Japanese metadata sample is classified as a **fixture startup readiness race**. No probe, browser test, rebuild, restart or product-source edit was required.

The exact stopped fixed-app container's retained Nginx and supervisor logs establish this sequence (15 November 2026, UTC):

| Time | Existing recorded event |
| --- | --- |
| 18:34:56.108 | Supervisor starts. The browser fixture starts at 18:34:56.771 without an API-readiness barrier. |
| 18:34:58.210 | Supervisor marks the socket process RUNNING after its one-second `startsecs`; this is process survival, not HTTP readiness. |
| 18:35:00 | First Chromium `/game?lng=ja` POST `/api/auth/session` returns **502**. Nginx records `connect() failed (111: Connection refused)` to `127.0.0.1:3001/api/auth/session`. |
| 18:35:01.203 | Backend reports `Server running on port 3001`. |
| 18:35:03–18:35:14 | Other three original fixed-harness session requests return **200**. |
| 18:36:54–18:37:11 | All four later source-spec session requests return **200**. |

`access.log` has exactly eight session POSTs: one first 502 followed by seven 200s. `error.log` has exactly one failed session upstream connection. These logs come from the same fixed-app container (`3036d2cb432ea0a96780b1ef024cdf4d9d2cc963d00bce7d9e0e023576782b15`) already pinned in the preceding final readback. The original failed sample stays unchanged and is not relabeled as error-free.

The unchanged upstream `requestSession` throws this exact error for any non-OK HTTP response (`packages/web/src/lib/session.ts:100`). Its initial `SocketProvider` effect calls `ensureSession().then(...)` without a rejection handler (`packages/web/src/features/game/contexts/socket-context.tsx:70`), explaining the surfaced page error. These two files and `branding.ts` match both actual retained 9b Git blobs and the Git-verified source-before SHA256 map. The Metadata-only correction did not change the authentication implementation. This trace supports fixture startup timing as the trigger, rather than a newly introduced authentication regression. It does not prove resilience to a later production backend outage or general account acceptance; no upstream resilience fix is included.

There is a separate fixture boundary: all eight optional `/branding/theme.json` requests return 403 because the synthetic `/app/config` tmpfs was deliberately created with mode0700, preventing Nginx traversal. The unchanged branding loader returns null on non-OK responses, so these requests do not explain the single thrown session error. Default platform branding was exercised; a configured native tenant-branding override was not. No permissions or settings were changed to erase this limitation.

Future fresh browser fixtures should wait for the real session/API service before opening the page; supervisor RUNNING or a static HTML 200 alone does not establish backend readiness. That is a fixture requirement for future work, not a reason to repeat the completed language, metadata, rollback, fault or game suites. No zero-error assertion or new deployment claim is made.

`classification.json` records the parsed sequence, exact raw log hashes, source equivalence and limits. `analyze.cjs` rechecks them locally without executing the app. Raw logs were read from the already stopped container via Docker copy tar streamed into local memory, without extracting server files, starting a container, modifying the retained fixture or consuming new server runtime capacity. The prior disk reservation already includes these existing log bytes. Source tasks remain OPEN.
