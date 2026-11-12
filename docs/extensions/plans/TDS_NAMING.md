# TDS-11 — naming and legacy compatibility

PHASE: TDS-11 `VERIFIED`
Asana parent: `1220402777392717` (OPEN; synchronization unavailable).
Subtask: `1220402430879047`.
Branch: `codex/tadazz-design-system-20261110`.
Worktree: `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110`.
BASE_HEAD: `5283ae47e8c7e17c74e8c0b666e280c986a3c267`.
Implementation commit: `3812a1ab54ab5af9a7972ca4de8d9fbe377b21bc`.

## Scope and compatibility map

The existing downstream presentation barrel gains semantic names for new imports.
They reference the exact existing components/types, with no wrapper, effect,
provider, rendering branch or new dependency. Historical names remain exported.

| New public name        | Historical name / physical module                              | Compatibility                         |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------- |
| `ShowStage`            | `TadazzV4Stage`, `tadazz-v4/TadazzV4Stage.tsx`                 | Same component identity               |
| `StageRendererAdapter` | `TadazzV4StageAdapter`, `tadazz-show/TadazzV4StageAdapter.tsx` | Same forwarded-ref component identity |
| `StageData`            | `TadazzV4Data`, `tadazz-v4/types.ts`                           | Exact type alias                      |

Import from `@razzia/extensions/presentation`. The historical physical filenames
remain: their cinematic owners and existing deep imports are outside this
initiative's rename scope. The new aliases are documented supported API and
have executable import/type contracts, rather than dead replacement wrappers.

Ordinary site copy is already title-case across eight dictionaries following
TDS-06. New enforcement checks translated values in all eight locales, retaining
historical translation keys. Shared editor/show branding is untouched.

The following stay exactly stable: `TadaShowV1`, `tada-show`, version 1,
`tada-json`, `tada-xlsx`, `.tada.json`, bundle/schema/renderer/manifest versions,
`tadazz-classic`, `tadazz-classic-stage`, `razzia-original`, `razzia-native-stage`,
installed IDs/digests, route/MIME contracts, product logo and rights metadata.
No global replacements, file moves, data migration or editor/provider changes.

## Verification plan

Run actual JSON/XLSX/bundle/preflight/theme round trips, the new import/type and
eight-locale branding contracts, extension/web compilation, governance, cinematic
and host AST guards. TDS-12 reruns the final production editor and route matrix.
Only verified evidence can complete the existing Asana subtask; record its SHA
in ASANA_SYNC_PENDING.md while the connection is unavailable.

## Verified result

PASS: isolated `bash extensions/qa/tds-phase11.sh`, all nine labels exit 0.
Actual compatibility run: **93/93 tests across eight files**, including authored
JSON validation/conversion, workbook and preflight readers/writers, enhanced
bundle/theme round trips, pinned historical theme selections, logo and Razzia
native-family protection, semantic import/type identity and eight-locale casing.
Extension/web TypeScript, targeted Prettier, cinematic owners, 602-file source
freeze, design, registry and catalog guards pass. Local full `ui:check` and host
action AST check pass. Application source in this phase is only five additive
barrel lines; there is no editor or cinematic runtime implementation edit.

Evidence: `qa-evidence/design-system-20261110/phase-11-*`, including the unit
report, per-check logs, full local governance/AST and source identity manifest.
TDS-10's exact zero-pixel/byte-identical editor and stage evidence remains intact;
a new production-bundle editor comparison follows in TDS-12. No browser pass is
claimed for TDS-11 itself. Physical devices/external CI/release remain NOT RUN.

No phase blocker. Asana sync pending; parent OPEN. Next: commit this checkpoint,
then run the full TDS-12 route/lifecycle/viewport/regression matrix and report
separately untestable physical-device, capacity and production release gates.
