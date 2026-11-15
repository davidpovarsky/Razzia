# Native motion configuration catalog — runtime ownership preserved

Additive getNativeMotionLibrary() / parseNativeMotionSetting() expose the actual
12StageAnimation presets, four independent configuration slots, six question
decoration presets, existing cinematic overlay controls/bounds and both native
families' template-owned choreography preset metadata. Source is the existing
card-appearance/cinematic-overlays schemas and bundled native catalog. No native
motion class, renderer, direct DOM choreography or current game flow is copied.

Defaults are parsed by the existing schemas rather than recreated:800ms,
simultaneous timing and90ms stagger. parseNativeMotionSetting wraps those same
strict v1 setting schemas for stage-entrance/question-decoration/cinematic-overlay
and rejects JS/accessors/prototypes/callbacks and unknown major versions. Native
duration250..2500, stagger0..300, media URL rules, overlay positioning/time-base/
fade-duration rules remain the existing implementation. This is not a Lottie
ingestion/license/read grant. Original stored settings and legacy none/inherit
semantics remain unchanged; no mutation of native v1 schemas occurs.

The catalog deliberately reports seek=unavailable and lifecycleAcceptance=
not-evaluated. WAAPI/ZWipe/Story choreography remains native-template owned.
Configuration slot support is not proof of generic runtime compatibility,
scrubbing, looping, pause/skip/cancel/reconnect or reusable DOM independence.
Existing director/server/native stage/cinematic/audio owners retain all actual
clock, transition, cue and disposal behavior. No new clock/raf/timer/player is
created by discovery or parsing.

Actual5/5 focused tests PASS, focused TypeScript PASS, scoped format PASS;
CHECKS.json captures exact commands, UTC/exits and unchanged before/after source
hashes, with actual stdout/stderr/JSON files. Tests cover native configuration
counts/defaults, duration/stagger boundaries, explicit none vs global entrance,
unsafe decoration media, cinematic fade/time-base rules and callback/version
denial. No earlier12/9/11/6/53 matrix was rerun. No renderer/build/browser/server
job, production/customer/provider operation or authority change occurred.
Full SB04 browser lifecycle/replay/frame evidence remains OPEN.
