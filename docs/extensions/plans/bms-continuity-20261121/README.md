# Packaged question continuity — 2026-11-21

## Diagnosed roots

PackageStage was treating wait:question-content as a real scene. The native
director already retains its last coherent scene while status, counter and
envelope messages catch up; the packaged path instead changed its iframe key
and mounted the same question again. It also renewed its four-minute launch
ticket on phase changes, which reloaded the iframe within a question. During
initial capability acquisition, it painted the native question and then replaced
it with the package.

The fix retains the complete coherent question presentation across this one
transient wait state, disables answer intents during the hold, renews the
launch capability only at an actual question/scene boundary, and keeps a neutral
loading placeholder until the package admission decision settles. Real context
changes, unsupported content and SDK failures retain the existing native fallback.
Pending admission failure invokes the director after the native replacement mounts.
Lobby metadata and authoritative reveal stage/elapsed props are forwarded for the
parallel integration; the coherent hold also retains that reveal timing.

## Proof

The receipt.json file is the raw isolated before/after result and unit output,
with candidate source hashes. The fixture uses the real PackageStage,
ThemeSandboxHost, SDK, safe projection and actual pre-redesign BMS source/CSS.
Only session, translation and runtime capability endpoint services are fixture
substitutes. It runs two local origins inside its own networkless container, with
no customer data or production mount. The shared QA container was only used as a
read-only dependency/image source.

Baseline 7291cea58bf0d20d72405c3819df33864e085688 fails the initial flash,
staggered socket updates, ticket renewal inside the question, and resulting
reveal continuity checks. The candidate passes all ten browser checks and six
unit cases. The browser records actual document identity, DOM references,
question animation-start count and bounding rectangles. Question entrance occurs
once; heading and answer nodes survive answer arrival, socket races, vote lock,
correct reveal and pause/resume. The capability renews at the next question.
An actual thrown script error invokes the SDK failure path and latches native
fallback. There are no unexpected browser errors.

The test advances both Playwright-controlled frame clocks in one-second steps,
allowing real SDK health messages to continue. It does not disable handshake,
replay/rate checks or the health watchdog.

Run extensions/qa/package-stage-continuity.mjs with explicit environment paths:
TADAZZ_CONTINUITY_SOURCE, TADAZZ_CONTINUITY_DEPS, TADAZZ_CONTINUITY_THEME (the BMS
theme source directory), and TADAZZ_CONTINUITY_EVIDENCE. Set
TADAZZ_CONTINUITY_STAGE to a baseline PackageStage path for the red comparison.
The recorded run is retained at /home/ubuntu/tadazz-bms-continuity-a9a56ee3 and
C:\Users\DAVID\Code\tadazz-bms-continuity-a9a56ee3.

This proves the engine-owned lifecycle failure with the real package. Arbitrary
future uploaded TSX can still remount its own internal components; package
acceptance must continue to verify renderer continuity. The integration branch
must run its normal type/build and release gates after merging the parallel
public lobby/reveal protocol definitions and the new BMS design.
