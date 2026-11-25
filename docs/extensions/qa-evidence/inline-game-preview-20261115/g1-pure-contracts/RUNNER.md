# Focused runner provenance and preserved setup failures

Every command used cwd `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-inline-preview-20261115`. Runtime is the existing explicit Node 24.22.1 binary, with `NODE_OPTIONS=--max-old-space-size=384`, one Vitest worker and no installation. Root/extensions/web/common dependency junctions point to existing installed dependencies in the preserved Site worktree; no source, package or lockfile edits were made in the donor. This checkpoint does not allocate an Oracle job or start an application/browser service.

Final focused command:

```
node node_modules/vitest/vitest.mjs run src/site/tests/inline-game-preview- --config C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-inline-preview-20261115/extensions/qa/inline-game-preview/vitest.config.ts --configLoader runner
node node_modules/typescript/bin/tsc -p extensions/qa/inline-game-preview/tsconfig.json --pretty false
node extensions/qa/inline-game-preview/source-audit.cjs
```

The owned Vitest config preserves the existing aliases/env but **replaces**, rather than merges, the include array. Both its include and CLI filter restrict execution to the new prefix. `configLoader runner` avoids bundling configuration into donor dependency temp files. The new cache directory is under the owned QA directory and ignored; no cache is copied. The initial CLI setup used Vite's default loader before runner selection; no claim of zero transient loader activity in donor dependency directories is made.

Preserved setup history:

1. Initial command used `extensions/vitest.config.ts` from repository root. Vitest resolved its `src/**/*.test.ts` relative to repository root and discovered no files (exit 1, recorded in the tool output; not presented as a raw file receipt).
2. Adding `--root extensions` with the same relative config produced `extensions/extensions/vitest.config.ts`, exit 1 before tests. Exact receipt: `vitest-run2.log`/`.exit`.
3. An owned config initially used `mergeConfig`, which concatenated the old broad include pattern. It started the broad suite unexpectedly; two entries showed 0 tests. The owned root process PID 9528 and its identified child PID 37696 were stopped after verifying the exact runner command. Preserved output: `vitest-run3.log`/`.exit`. There is no successful broad-suite or completed-game-suite claim. The config was corrected before focused verification.
4. Corrected scoped config: `vitest-run4.log` records the first 35 actual focused passes. A later final run after lint fixes and prototype-key input hardening again passed 35, with affected TypeScript exit 0 (`vitest-final.*`, `typecheck-final.*`).
5. The final isolated-locale addition is covered by `vitest-with-locales.*` and `typecheck-with-locales.*`; use those exact results for the checkpoint. Earlier 35-case runs are history, not extra product coverage.

Initial scoped lint failures and automated/manual corrections remain in `lint-run1.log`, `lint-fix.log`, `lint-run2.*`; final check is `lint-final.*`. No lint rule or freeze baseline was weakened. Raw failed command receipts may retain whitespace warnings; source formatting and raw-log formatting are distinct.

The inherited TDS checks were executed individually before UI edits: design rules, token registry and catalog checks exit 0; `tds-boundary.mjs --files-only` exits 1 with 12 inherited hash mismatches. These first results were captured in tool output, not claimed as redirected raw files. `source-audit.json` independently records that each of those 12 current bytes matches the supplied base Git blob. This task-only check is not a replacement or a PASS for the historical freeze guard or full `pnpm --dir extensions ui:check`.
