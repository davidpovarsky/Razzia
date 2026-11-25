# Final private staging acceptance evidence

The supplied package plan is complete for private staging. Production stays OFF.
See `../../PACKAGE_RUNTIME_COMPLETION_2026-11-09.md` and the unified acceptance
report for scope, commands, source/image identity and remaining production gates.

All 1,024 unit tests and 81 browser cases pass, with zero skips or flaky cases.
Eight actual TypeScript projects, strict repository lint, format and build pass.
The four isolated configurations include every prior 77 case plus four new
Chromium/WebKit stress/watchdog cases. This is not every historical default-glob
probe or a claim of a GitHub CI run.

Forty real concurrent Chromium displays and twenty real concurrent WebKit displays
plus manager/player are qualified at 800x600. The forty-tab WebKit capacity probe
exceeds the host's 8 GiB limit and remains a documented failure, not a pass or
skip. The unchanged functional suites separately verify iPad/full 4:3 layouts.
CPU work is bounded (60ms per 500ms). Missing child health triggers safe fallback;
the same room resumes, completes and recovers its renderer after reload. This is
a short capped smoke, not 400 devices, prolonged GPU stress or hard process isolation.
Metrics are measured inside the 2 CPU / 8 GiB / 1536 PID isolated QA container.
Setup attempts document PID/OOM/login-budget findings; they are not pass evidence.

The fallback viewport repair is an application change. The previous DOM/opacity
checks passed while the absolutely positioned stage was clipped by its unsized
wrapper. The wrapper now fills the host. Both engines check viewport intersection,
height and entrance opacity, and the final captures show question and answer cards.
All 13 static commands and all 81 browser cases were rerun after that repair.
The final image was captured from verified `/verify` source and its 90 built web
artifacts. Final backup/data restart recreates that exact same tested image;
all 1,802 source files, compiled artifacts and durable data match. Private full-
config backups were restored and compared. Read-only store smoke covers original,
new and restored installed games/media. Production and both existing labs remain
unchanged. Two older redundant backup archives were transferred byte-exactly to
the user's private local backup directory; stable r5/r6/r7, v3 and final backups
remain private on Oracle. Only duplicate task-owned copies were retired.

All reports/logs are exact raw Oracle bytes compressed with deterministic gzip.
`raw-input-hashes.json` verifies decompressed bytes, `SHA256SUMS` verifies all files
here except itself. Ten screenshots under screenshots/ are final-run browser captures.
The two fallback-before captures document the prior clipping defect. Source inputs
and image metadata identify executable code; delivery Markdown may follow in a
separate documentation commit. Databases, backups, tokens, browser state and traces
are private and excluded. Existing non-failing Vite/preview notices remain in logs.
