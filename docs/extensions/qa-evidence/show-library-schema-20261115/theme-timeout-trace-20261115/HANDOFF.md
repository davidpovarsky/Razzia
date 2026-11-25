# Theme installation timeout: measured and repaired

The original large Buffer comparison took 32,012 milliseconds of the traced
32,798-millisecond body (97.60%). Reading the published asset took 8.3 milliseconds;
the slowest other step took 90.2 milliseconds. All business assertions completed,
with only the three expected denials. The diagnostic still failed the original
30,000-millisecond deadline; its raw failure remains in the evidence.

The measured gate satisfied the conditional authorization. The pre-edit ledger
was written before replacing only the first case's readAsset byte assertion.
The assertion now checks Buffer type, length and native exact byte equality.
The setup, business assertions, SQL, fixture bytes and timeout remain unchanged.
Test SHA-256: e5f5b110eaf36415a8fa2d5080efe6f101025b4ea2e6e5f8e50497b3abbbb095.

Server validation at the same 0.25 CPU / 2 GiB limits and original timeout:

- All five original installation cases passed; the first took 797 milliseconds.
- Seven real-Buffer checks passed: copied bytes, first/middle/last-byte mutations,
  short/long buffers, and non-Buffer rejection. The original PNG hash is unchanged.
- Focused TypeScript and changed-file formatting passed. The initial TypeScript
  run failed to resolve Node types from the external QA config; its raw TS2688
  failure is retained. Correcting only the config's typeRoots resolved it on the
  same test hash. The five tests were not repeated for this config-only repair.

RESULT.json, the pre-edit ledger, exact overlays and raw server receipts retain
all outcomes. The initial source diagnosis is preserved byte-for-byte in
initial-source-diagnosis.md (SHA-256 11fc4ead4c43fe923697b42b35396a1e94839a2b5cf0c8a97d241a8f88bb8120).
The updated HQ review contains the measured followup above that historical record:
C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/reviews/THEME_INSTALLATION_TIMEOUT_DIAG_20261115.md.

The original full-suite result remains 813 passed / 6 failed; all 819 tests were
not rerun. All 26 accepted core file hashes remain unchanged. There was no local
functional test, dependency install, clone, image pull, product/R2 change, push,
merge or deployment. No private database rows or keys were logged. All three
containers were released. Measured new server disk usage totaled 191,535 bytes;
the 2 GiB free-space reserve was preserved. No further test run is pending.
