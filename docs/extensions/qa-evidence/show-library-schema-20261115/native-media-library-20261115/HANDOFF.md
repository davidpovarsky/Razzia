# Independent native asset and audio metadata libraries

Public additive APIs: getNativeAssetLibrary(), findNativeAssetLibraryEntry(ref),
getNativeAudioLibrary(). Existing manifests, IDs, game/rendering/clock/audio
owners, media ingestion and storage permissions are unchanged.

The actual Classic31 + Razzia36 asset declarations produce39 distinct
assetId/SHA256 refs,36 historical asset IDs and35 distinct content hashes.
Three IDs intentionally select different content in the two native families:
classic-poster, classic-backdrop and classic-adapter-a27be4883ee9. An independent
catalog must not resolve those by ID alone. The new exact lookup requires the
existing bounded assetReferenceSchema; an ID-only lookup fails and an unknown
complete ref returns undefined. No stored ID is renamed or silently replaced.

Entries preserve every original family-specific URL/kind/bytes/provenance/
rights declaration, canonical definition hash, versioned theme ref and exact
JSON pointers for all assets/poster/adapter/visual-variant/audio-variant refs.
Hash-sharing aliases preserve distinct IDs; three alias groups remain explicit.
Counts describe manifest references, never live storage refcounts. Every entry
is frozen and executionOrExportAuthorized=false. Discovery cannot authorize
reads, deletion, media delivery, executable Preview or customer export.

The independent audio catalog groups all16 actual events, retaining both
families' default variants, roles, volumes, loop/fade/priority/restart metadata
and authored choreography milestone mappings. Legacy CueId and SoundtrackSlotId
mapping is imported from the existing show-themes/audio constants, including
answerPressed→answerSubmitted and voting→answersMusic. No new mixer, event
source, cue replay, timer, preload or playback implementation was introduced.

Actual final6/6 focused tests PASS, focused TypeScript PASS, scoped format PASS.
final/CHECKS.json and final stdout/stderr/JSON outputs retain exact commands,
exits/UTC and unchanged-before/after source hashes. Initial5cases had4PASS/1FAIL:
the initial test incorrectly equated36 unique IDs with36 exact content refs.
The catalog already preserved39. Source inspection identified the three reused
IDs and three content-alias groups; the expectation was corrected and an exact-
hash lookup with a new cross-family counterexample test was added. Original
failed logs/JSON/receipt stay at the parent directory and were not overwritten.
All prior12/9/11/53 suites were left at their matching inputs, not rerun.

This improves usable catalog/selection provenance for E/F; full source/license
audit, trusted media/storage rights, actual asset ingestion/export/delete,
audio browser/gesture/phase parity and executable renderer acceptance remain
OPEN. No renderer/build/browser/server/customer/provider action occurred.
