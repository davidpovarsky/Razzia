# Studio fixture lint repair and runtime qualification

Base commit: `c5028c4cb9fc839aa514edec47cae2a8a8bff1b0`.
Base tree: `70715a2d98872148fcc50588af74ad8fd2793d88`.
Branch: `codex/tadazz-studio-fixture-lint-20261124`.
Validation date: 24 November 2026 (UTC).

## Result and scope

The three active Studio fixture source files now pass the repository's unchanged
typed Oxlint configuration: **0 errors, 0 warnings, 233 rules**. The existing
nine browser cases passed once on the final fixture patch, with no browser
errors, from **02:54:58.584 to 02:55:20.638 UTC**. This is an isolated loopback
fixture using the actual QuizzEditorProvider, StudioEditorProvider, native editor
controls and composite save hook. It is not production acceptance or the full
release gate.

The source change is limited to the three fixture files and their local
`tsconfig.json`. That project extends the web application compiler settings,
uses only normal committed workspace dependency paths, and includes the two
fixture TypeScript files. Runtime esbuild explicitly uses the web application's
configuration so the fixture's declaration-only React aliases are not used by
the browser bundle. The patch also types the fixture globals, validates fetched
quiz identity without rewriting the payload, and fixes required harness style.

The polling helper retains its 6,000 ms deadline and 30 ms wait; the create
wait retains its 20 ms interval. Every one of the **46 original assertion calls**
remains in the same order. Only the i18n fixture has byte-identical normalized
JavaScript emission. The other fixture emissions differ, so the final browser
run supplies new runtime evidence instead of assuming complete equivalence.

All generated screenshots and receipts now go to the caller's required
`STUDIO_DIAGNOSTICS` directory. No historical Studio receipt or screenshot was
overwritten. The separate Paddle validation document corrects the provenance
of its historical 28-case unit receipt; its required final-head run remains
with the release owner.

## Checks and evidence

| Check                                          | Result                                                               | Evidence                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Typed lint of all three active fixture sources | 0 errors, 0 warnings                                                 | `final-lint.log`, `targeted-validation.json`                  |
| Existing browser cases                         | 9/9 passed, zero browser errors                                      | `browser-result.json`, `browser-execution.json`               |
| Source stability during browser run            | All four source/config hashes unchanged                              | `browser-execution.json`                                      |
| Historical Studio artifacts                    | All hashes unchanged                                                 | `browser-execution.json`                                      |
| Original assertions                            | All 46 calls preserved in order                                      | `source-emission-comparison.json`                             |
| Browser/server cleanup                         | No owned fixture/verifier Node or browser-profile processes remained | `browser-execution.json` and recorded host process inspection |
| Final repository formatting                    | Passed for the supported changed sources and documentation           | `format-final.json`, `format-final.log`                       |

The checked versions were Node **26.13.1**, Oxlint **1.90.0**, Prettier
**3.9.10**, esbuild **0.28.2**, and Playwright **1.64.0**. The unchanged
`oxlint.config.ts` SHA256 is
`beb3b15821ab22c765d6106709c85e148764b73e4eaf0687d4d881b358a76de7`.
Exact commands, workspace/config hashes, source hashes and exit codes are in
`targeted-validation.json`, `format-final.json` and
`browser-execution.json`.

The final browser bundle SHA256 is
`f1e8b62ee1caf8722568b9a25898a4dde258dd97e20fe8fa970d49b998ab8d6d`.
The execution receipt SHA256 is
`e0f98406b05ed7aea25dbd040a7faf573ccaa3362834af38aaab2915cefe755d`;
the new source receipt SHA256 is
`855535c4b6dba889fdbbbf48bffc53e18bd9bd81681f9cf9aaa1e6d51105dc03`.
The deterministic browser result contains the same outcomes as the earlier run,
so its SHA256 is again
`175380b286b24c340620d4e1066816dae5502fabf0e10393d9f2dda900c04f9a`.
The distinct execution receipt, timestamps, bundle hash and source manifest
identify the actual new run.

## Failure history and CI mapping

The preceding global CI run
[45312382132](https://github.com/davidpovarsky/Razzia/actions/runs/45312382132)
reported 176 errors and zero warnings in these three fixture files: 105 in
`browser-fixture.tsx`, 12 in `browser-i18n.ts`, and 59 in
`browser-check.mjs`. It checked merge commit
`9c325be8b61227475d569f80c9405aba11cc0536`, whose tree equals the base tree
above. Its tests passed 514 tests in 57 files; the separate
[UI run 45312382130](https://github.com/davidpovarsky/Razzia/actions/runs/45312382130)
passed. The CI lint command was `pnpm lint` → `oxlint`; formatting was
`pnpm format` → `prettier --check . --log-level warn`.

The original CI lint log is retained by the release coordinator with SHA256
`9be839832ce937915281746e8d1458eaae3a95496f4566e33376577ba4d54487`;
its extracted diagnosis JSON has SHA256
`d407d1cc31196af53bb975f9f53df6b5da7a46043c96aeda9dbd7845747dbe75`.
This focused repair does not claim a new global CI pass.

The first local targeted attempt still reported 117 errors and one warning,
primarily unresolved React declarations; the next reported one redundant guard.
Both raw logs are retained as `targeted-first.log` and `targeted-second.log`.
The final targeted lint passed. An intermediate standalone Node adapter probe
exited without a completed result; no success is claimed for it, as recorded in
`incomplete-probe-status.json`. The required existing nine-case browser run
superseded that incomplete probe.

Root independently reviewed the source diff and actual browser receipts.
A separate read-only peer review accepted the local TypeScript configuration,
declared dependency resolution, fixture loader and audio update structure.

## Reproduction and release boundary

Use the existing project dependencies and browser cache. Set both
`STUDIO_DIAGNOSTICS` and `TMPDIR` to owned directories before running:

```sh
node docs/extensions/plans/studio-recovery-20261124/browser-check.mjs
```

The new raw execution directory is
`/mnt/development/projects/diagnostics/tadazz-studio-fixture-lint-20261124/final-browser`.
This repair changes no gameplay, production editor, billing or customer-data
source. Integration, the final combined-head CI and the remaining runtime and
release gates remain with the designated release owner.
