# Locked-vote candidate template validation

The existing registry enforced required answer bindings and answer-completeness capabilities in `answerCards` and `voting`, but omitted `voteLocked`. A locked-vote template could consequently contain no answer binding, or omit its completeness capability, and still pass candidate registry validation. This concerns authoring candidate validation; it is not evidence that an executable renderer or active room dropped answers.

The original SB1 contract requires complete current answer information and protected system content; its `locked-worlds` candidate specifies `complete-answer-set`. Existing binding policy and projection already support `choices`/`estimation` in `voteLocked`.

The two-line correction applies the existing `answers` and `answerCapability` requirements to `voteLocked`. Choice templates require `choices` plus `complete-answer-set`; estimation templates require `estimation` plus `valid-estimation-options`. No new schema field or capability name, clock requirement, locked action handle, wire version, digest algorithm, renderer ABI, executable pin, or readiness claim is introduced. The existing protected content-lane check remains in force.

Actual validation:

- Before correction: 8 new tests, 4 passes and 4 failures. Missing answer binding and missing completeness capability were incorrectly accepted for both choice and estimation. Complete candidates and rejection of answers in decoration lanes already passed.
- After correction: 28 tests across `registry-locked.test.ts` (8), existing registry tests (11), and composition inspection (9) passed. Focused TypeScript and formatting for both touched files exited 0. Scoped oxlint checked the new regression file (1 file, 233 rules) with zero diagnostics; no full legacy-registry lint result is claimed.
- Each receipt includes exact commands, source hashes before/after, raw stream byte counts/SHA256/base64, and normalized display logs. Source remained unchanged during checks. Original failure evidence is retained.

The previously accepted manager integration suites were not rerun. The new registry checks remain `candidate` validation with `inspectCandidateCapabilities(...).support === "unavailable"`; actual standalone adapters, protected runtime/action behavior, browser/layout parity, media rights, and full SB-02/SB-03 acceptance remain OPEN. E's current native V2 renderer contract was reviewed read-only and not changed. No remote job/write, install, build, browser, provider, or production action occurred.
