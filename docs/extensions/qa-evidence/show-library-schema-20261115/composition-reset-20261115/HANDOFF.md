# Runtime validation for section reset

`resetCompositionSection` accepted its section name only through a TypeScript union. A JavaScript caller could pass unknown names such as `registry`, `id`, or `unknown` and receive an apparently successful result with no section reset. The operation already deletes only from `composition.sections`; no document metadata deletion or corruption was observed. The initial regression title incorrectly described corruption and was corrected without altering the retained original failure output.

The function now validates the runtime section against `sectionOverridesSchema.keyof()` and omits exactly that validated key from the copied base sections. Valid `assets`, `audio`, `templates`, and `motion` resets preserve metadata, independent sections, role overrides, and the original input. Invalid names throw. No schema, document version, public function signature, storage protocol, V2 payload, or renderer behavior changed.

Scoped lint also required a local variable for the parsed role and braces/blank lines in the same owned `assets.ts` module. Asset policy decisions and role/scope resolution behavior remain covered by existing registry tests.

Actual evidence:

- `before/`: 10 reset tests, 6 failures because unknown names did not throw; all 4 valid-section resets passed. This proves silent invalid-command acceptance, not data corruption.
- `after/`: 30 tests passed, focused TypeScript and formatting passed; lint failed on existing same-module style issues and the computed delete.
- `final/`: actual 30 tests across reset, registry, and composition-reference inspection passed; focused TypeScript, scoped Prettier, and scoped oxlint all exited 0. Lint checked 2 files / 233 rules with zero diagnostics. Before/after source hashes are unchanged during each run; raw stdout/stderr, including empty streams, are retained in receipt base64 with bytes/SHA256.

The original manager-integrated 76-test evidence and preceding 58/18 receipts were not rerun or rewritten. This is a scoped SB-06 command-validation fix. No renderer readiness, full original task acceptance, rights receipt, runtime pin, remote write/job, install, provider action, or production change is claimed.
