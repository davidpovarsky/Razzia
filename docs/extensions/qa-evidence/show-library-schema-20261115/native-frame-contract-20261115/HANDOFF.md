# Shared actual native-frame ABI contract — additive, read-only

D owns the host producer/schema; E owns the actual renderer, immutable loader,
Studio and installation. This contract is derived from dd3's real
stage-scene-adapter PreviewFrame and renderer-entry RendererInput/mount signature.
It does not assign a renderer Ref, create a pin, expand supported phases/roles
or claim the dd3 output was built with this new schema.

## Payload leaf

native-preview-frame-schema.ts exports nativePreviewFrameV1Schema,
nativePreviewRendererInputV1Schema, NativePreviewFrameV1,
NativePreviewRendererInputV1 and NativePreviewCandidateMountV1. Its runtime
imports are only Zod and the existing Zod-only stage-metadata-schema leaf.
It does not import the producer/barrel, hashing, identity implementation,
compiled authority, transport, storage, timers, native rendering or audio code.

This is the actual current subset: question/answerCards/voting/voteLocked/results;
manager/spectator; single/multi; quiz/survey; zero choices only in question and
2..5 afterward. Complete unique current-choice results are required only in
results. Metadata uses the existing port3/rule2 preview question identity and
actual ordinal/total bounds. Clock/revision/choice/result/text bounds reproduce
E's current admission. Asset refs, raw drafts, private room fields and audio
objects are not admitted. Locale is the exact existing eight-language union.
Schema parsing proves shape only, never producer association or executable
readiness. The mount type describes the actual update/dispose ABI with an
HTMLElement and onUnavailable callback; it contains no runtime implementation.

## Trusted host producer

produceNativePreviewFrameV1(snapshot,context,binding,metadata,revision) calls
the existing projectShowBindings and private bound-metadata assertion. It
returns a frozen current-card-only frame. It reuses the exact supplied bound
clock, including the results phase's intentionally omitted public clock;
no timer/cursor/epoch/native question ID or outcome is manufactured.

The duration comes from the actual normalized current authored card rather
than a separate caller-supplied seconds argument. Authored-1 maps to unlimited
null; source-valid0 or >86400 stays unsupported by this native subset and is
rejected without mutating stored data. The remaining values use the real card
duration. The host's draft revision remains an explicit trusted-host argument.
Player/estimation/other phases remain unsupported; forged/cloned/foreign
draft/plan/metadata and stale clocks remain denied by the original producer.
The factory does not change resolution/readiness, fetch resources, create
fake votes, enable answer actions or mount a payload.

## E/F adoption

E may replace its duplicated PreviewFrame type/validator with this leaf and
wrap the host producer in projected-frame. Its old explicit seconds parameter
must not override the actual authored duration. Import only the leaf into a
renderer payload; never import show-library/index or native-preview-frame.ts.
Adoption changes future payload inputs/graph and requires E's own exact new
build/loader/browser verification. Do not relabel the historical dd3 bytes.
F/G can consume the same core types/host function without importing E's native
stage/director or creating another renderer/clock. Public activation still
depends on the real accepted renderer/artifact/resource/rights/loader contract.

## Actual scoped verification

12/12 new focused tests PASS, focused show-library TypeScript exit0, scoped
source format PASS. Tests exercised five phases,2/5 answers, single/multi,
quiz/survey, manager/spectator, actual Q3/5 and20sec/-1 duration, unsupported
duration/cardinality, forged metadata/plan/clock/role/phase, private/asset/early
result denial, complete unique result IDs, eight locales and actual AST import
closure. CHECKS.json labels the captured execution transcript and post-run source
hashes explicitly; it does not invent a before-run hash audit or browser test.
Earlier c35/26/11/9 matrices were not rerun. No renderer/browser/build/server job,
production/customer/provider operation or authority-registry change occurred.
G's executable prerequisite and all full SB07 acceptance remain OPEN.
