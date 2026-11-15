# Server feasibility: d095 candidate

The exact tested source is `d09529dc5c26bc71972d5e0809bc2dddd2849c60`.
Its locale initialization uses the installed i18next 26.4.3 `initAsync` option.
The server run used Node 24.22.2 in one 0.25-CPU, 2-GiB, network-disabled
container with read-only source and dependency mounts. The 42 overlaid source
files and 458 selected baseline files/modes were checked against their recorded
hashes after the run. The server reported 2540 MiB free at the original gate,
2526 MiB before the corrected run and 2908 MiB after it; the increase was
external to this job. No dependency install or source clone was performed.

* Vitest 5.0.3 focused candidate file: **12/12 pass**, exit 0. The confirm log
  is `vitest-d095-confirm.log`. An earlier d095 run printed 12 passes but its
  Windows wrapper failed to encode the checkmark and did not preserve its exit;
  the confirm run captured both output and exit. Its copied log omits one
  terminal blank line; the unmodified original remains on the server.
* TypeScript 7.0.2 focused candidate check: **pass**, exit 0, using the parent
  extensions tsconfig, the actual extension node type root and existing
  `src/presentation/tadazz-css.d.ts`. This is not a whole-project typecheck.
* Vite 8.3.4 library build: **pass**, exit 0, 168 transformed modules. It
  retained four unresolved root-relative image URLs. Actual files are listed
  in `artifact-index-d095.json` (SHA-256
  `07b72f09185b629c0aee8a73e1c0a523b8963c33af4b920bbfeb2c744d274d90`).
  The index covers only emitted JS/CSS, excluding the index, Vite manifest,
  outer loader and external manifest. It is not an accepted renderer pin.

`resource-scan-d095.json` is a static string scan, not runtime request proof:
it includes potential source/data strings and cannot establish asset closure.
No font-face file was emitted. CSS, logo, backdrop, font, other intrinsic
resources, rights, SRI/CSP, loader verification, ShadowRoot rendering and
actual browser lifecycle witnesses remain open. No capability was activated.

Correction to the dc76 historical note: the first index file recorded there
ended in literal escape characters and was not valid JSON. Its corrected
candidate index is `artifact-index-dc76-canonical.json`, SHA-256
`95e6bf3c8296e83eff87c715c3748e9c7e30e51405fef18304857cd268f44202`.
Neither index is a release artifact or registered pin.
