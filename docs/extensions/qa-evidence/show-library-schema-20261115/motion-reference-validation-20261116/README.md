# Closed motion compatibility references

The registry validated component-to-motion references and child-component references, but did not validate the component targets listed by motion definitions. A valid exact self-reference could conceal an additional nonexistent component/version, and unused motions could advertise absent targets. Those candidates passed registry creation even though their compatibility graph was not closed.

`createShowLibraryRegistry` now checks every motion's component references against the same exact ID/version component map. A missing target raises `show-library:unknown-motion-component`. Existing component opt-in and reciprocal compatibility checks remain unchanged. A motion may still advertise a known component before that component opts into using it. No schema field, stored ID, wire/ABI, renderer behavior, pin, rights grant or readiness changed.

Actual evidence:

- `before/`: 7 new tests, 3 passes / 4 failures. The absent ID, absent version, unused-motion target, and motion-only registry counterexamples were incorrectly accepted.
- `after/`: 18 tests across the 7 new cases and 11 affected existing registry cases passed. Focused TypeScript and formatting of the two touched files exited 0. Oxlint on the new test file exited 0 (1 file, 233 rules); no full legacy-registry lint pass is claimed.
- Receipts capture exact commands, source hashes before/after, raw stream byte counts/SHA256/base64 and display logs, including empty TypeScript streams. Source stayed unchanged during each check. The original failure output is preserved.

No accepted 28/76/187 integration suite was rerun for bookkeeping. The affected existing registry cases were run because the registry implementation changed. Candidate support remains unavailable for execution; extracted runtime adapters and full SB-02/SB-04 acceptance remain incomplete.

The existing font handoff decision was read once at the relevant boundary. E's opt-in font correction and root intake remain with their owners; no duplicate font work, routing request or new G gate was created. This engine change is independent of that intake. No remote job/write, install, browser/build, provider/customer/production action or cross-owner edit occurred.
