# B1 current-question stage metadata companion

Producer show_engine `01a1dd19-5220-70d3-8349-e9e135399b4d`, exclusive core lease.
Branch `codex/tadazz-hq-show-library-20261115`; predecessor documentation commit
`41ada8961cb50ff0b1dc0b58630faa48bd0aef78`, accepted pure source `81d5b8f`.
The review commit SHA is supplied in the external frozen handoff.

## Exact imports and bounded public data

From proposed extensions/src/presentation/show-library-preview/* files,
renderer/runtime payload imports ONLY this exact leaf at runtime:

```ts
import {
  previewStageMetadataSchema,
  type PreviewStageMetadata,
} from "../../core/show-library/stage-metadata-schema"
```

The leaf imports **only Zod**. It does not import primitives, producer code,
normalization, identity/hash helpers, compiled manifest or presentation owners.
The real Vite/Rolldown AST import-boundary check is part of the server-targeted tests. This
separation is deliberate: existing primitives lead through the package protocol
to a manifest; importing them would undermine the payload hash-cycle boundary.
The question-ID regex is format validation, not a new identity allocator.

Trusted host/controller producer imports:

```ts
import {
  derivePreviewStageMetadata,
  assertBoundPreviewStageMetadata,
  type ValidatedPreviewStageMetadata,
} from "../../core/show-library/stage-metadata"
```

These are also exported by preview-port for trusted host consumers. The payload
must not runtime-import preview-port or stage-metadata: their producer graph
includes the compiled catalog. Type-only imports are erased by the build.

The complete public record is:

```ts
type PreviewStageMetadata = Readonly<{
  portVersion: 3
  identityRuleVersion: 2
  questionId: string // exact preview-question- plus 64 lowercase hex digits
  ordinal: number // integer 1..128, <= totalQuestions
  totalQuestions: number // actual integer 1..128
}>
```

Map ordinal to native StageQuestion.number and totalQuestions to its existing
counter. questionId must equal the current role/phase projection's question ID.
Pass it as a separate companion, not a hidden field added to the strict
projection or MCP envelope. There are no question texts, keys, future IDs, solutions, assets, capabilities,
plan/draft content, native UUIDs, hidden runtime brand properties or resolvers
in this UI record. The only aggregate is the explicitly approved total count.

## Producer association and limits

`derivePreviewStageMetadata(draft, plan, currentQuestionId)` first calls the
existing genuine bound-plan assertion. It filters actual authored quiz/survey
cards in their authored order, uses getPreviewIdentityId on the existing rule-2
map, and returns index+1 and actual question count. Scene/media cards do not
increment either value. Reordering changes ordinal while preserving identities.
Unknown IDs, card/scene IDs, authored keys and native UUIDs throw
`show-library:unknown-stage-question`; there is no default ordinal 1 and no
additional hash/ID allocator.

The record is schema-validated and frozen. A private WeakMap binds the original
object to that exact genuine draft, plan and question ID. The validated type
brand is type-only; the UI object has no symbol properties or private fields.
Call `assertBoundPreviewStageMetadata(draft, plan, currentQuestionId, metadata)`
at the trusted host boundary, using the current projection's question ID, before
forwarding only the public fields. Copies, schema reparses and records bound to
another question/draft/plan cannot manufacture this producer association.

Runtime schema parsing proves shape only, not producer authority or a cursor.
The trusted controller still chooses its current question; this helper creates
no clock, navigation/scoring engine, room, authenticated role or new authority.
A role/revision/draft change requires the new genuine association. A JSON copy
may be parsed in the payload after host validation, but cannot be re-presented
as an original trusted producer record.

Metadata is informational even for a genuine unavailable plan. All compiled
pins remain empty, plans/actions unavailable and visual refs strictly denied.
Port 3/rule 2, authored/native/MCP schemas and private/future projection rules
are unchanged. No assets, manifest activation, UI/runtime implementation or
existing presentation seam is included. The other agent's worktree is untouched.

## Actual validation and resource history

Authoritative effective source delivery pin (not a renderer/compiled pin):
`b59cb6cf523773f3189a7fd9937c8e0000d0565c6d68ed18c88d8c00f8b1a418`.
The committed metadata-delta-<pin>.json records every one of 26 final module
hashes and the initial source overlay f9eaba... used read-only underneath it.
Only stage-metadata.test.ts changed after the initial delivery; the other 25
module bytes were identical in all three metadata runs.

- Initial four-file run: 98/99 tests passed. The sole failure was a test-only
  TypeScript7 preProcessFile API removed from the frozen compiler package;
  focused type errors were confined to that check. The other 25 new metadata
  cases and 73 related asset/action/port cases passed. Raw failure retained in
  server-metadata-initial-f9ea; no overall initial pass is claimed.
- Corrected dependency check uses the existing Vite/Rolldown real TS AST and
  verifies only Zod static imports plus rejection of producer imports, manifest
  re-exports, dynamic imports and require. The first read-only delta startup
  could not write Vitest's own API-token file; raw startup error retained in
  server-metadata-delta-b59c. Focused TypeScript PASSED there against the final
  exact 26-file view, with source before/after hashes matching.
- Final bounded delta: 26/26 metadata tests PASS in server-metadata-final-b59c-xdg.
  An isolated process-only XDG_DATA_HOME pointed Vitest's ephemeral test token
  to container /tmp tmpfs. No credentials/global settings or old fixture changed.
  Typecheck was not needlessly repeated: the final delta's 26 file hashes are
  identical to the passing typecheck view. Unchanged broader regressions were
  not rerun. Initial scoped server format PASS; corrected test local installed
  formatter check PASS. No Windows functional tests/build/install/browser ran.

Both delta runs mounted the old source/dependency fixture read-only, plus the
9,820-byte corrected test and small manifest/runner overlay. No clone, archive,
.git/docs/store/dependency copy, install or image pull occurred in the renewed
validation. Source audits checked 3297 baseline Git blobs and 26 effective module
SHA256 values before/after; old failed fixture's original 26 hashes also matched.
Read-only container roots reported 16,384 writable-layer metadata bytes each;
measured overlay/evidence bytes were 29,624 and 37,141 respectively, far below
64MiB. Fresh starts exceeded 2600MiB disk free, reserve checks stayed above 2GiB,
and final observed free bytes were 2,825,404,416. Both containers were stopped
and removed; final release 2026-11-15T07:43:36.946442Z.

The original full metadata source/cache delivery had consumed 1225MiB source
and 642MiB private cache. On the manager's disk HOLD, its finished runner was
released immediately and every source/receipt retained. No further remote write
or run occurred until the bounded renewal. Initial and delta failures remain
separate; they were not overwritten or relabelled as passes.

Raw initial B1 freeze remains FAIL (26 leased new paths, mismatches: []). The
historical full UI job FAIL is retained; no full ui:check was run in the renewed
metadata-only scope and no full UI green is claimed. No guard/baseline waiver.
Prior 81d5/155+42 and earlier evidence remain untouched. Only its producer
barrel receives additive metadata exports; the other 22 accepted module files
are byte-identical. Metadata schema/producer/test are the three new source files.

metadata-summary.json records the exact split evidence and limits. B1 companion
is ready for independent review; renderer, assets, audio, pins and actions are
not activated. All original source tasks and SB2HQ remain open.

The startup-error display log has a trailing blank line normalized for Git;
metadata-evidence-normalization.json preserves its exact raw bytes/base64/hash.
Its receipt still identifies the raw log hash; remote raw evidence is unchanged.
