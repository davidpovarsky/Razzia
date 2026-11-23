# XLSX limits and real import/export follow-up

The current roster parser had a 25 MiB cap per inflated ZIP entry but no archive-wide expanded-byte cap or entry-count bound. The show parser accumulated declared sizes but did not enforce actual output against those declarations. A forged small central-directory size could therefore evade its aggregate budget.

Both paths now enforce at most 50 ZIP entries and 25 MiB of actual expanded data. Each declared size must fit the remaining budget before decompression. Deflate output is bounded by that admitted size, and both stored and deflated entries must have the exact declared length. Existing 5 MiB input and 2000-row limits and localized error keys remain in place. This is a focused correction to the existing parser, not a third-party-library migration or a claim of general ZIP-format compliance.

## Reproduction and verification

The same 12 tests passed 4 and failed 8 against the previous application source. After the fix, all 12 pass, together with 33 existing roster/workbook/preflight tests: 45/45. Cases include real stored/deflated content, a compressed archive smaller than 5 MiB expanding beyond 25 MiB, understated inflated sizes, stored-size mismatch, deflated-size underflow, and excessive directory entries.

All six real-browser import/export acceptance scenarios pass. They verify actual blank-template download bytes, original manager layout at 1024/1280, JSON/XLSX import preflight, cancellation, saved/reopened Hebrew notes and interludes, JSON/XLSX export bytes, and zero writes for invalid target keys or malformed interlude data. Page-error and network assertions are preserved.

The first browser run passed all application assertions, but Edge exposed a transient empty download tab and its beforeunload-based test teardown did not close that tab. The fixture now closes an about:blank page directly; normal application pages keep their original teardown. The download assertion also waits for and validates actual file bytes. No application navigation protection was disabled or altered.

Strict typed lint and web application TypeScript pass. Original failed receipts, corrected receipts and the trace remain available separately. Production source changed only in the two parsers; remaining source changes are the focused regression tests and isolated loopback-only QA configuration.

Console-log trailing whitespace is normalized for repository readability; original raw bytes for affected logs are preserved in the accompanying .log.raw.gz files. Assertions and source are unchanged.
