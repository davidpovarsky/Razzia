# P0 Audio + Host Presentation integration notes (2026-11-06)

## Existing lifetime and command map

`GameWrapper` is the single live game shell and resolves one authoritative extension envelope. For TADAZZ it renders one `TadazzShowView`, which owns one persistent `TadazzStageHandle`; entering presentation must only remove host chrome around that stage. `ManagerControlToolbar` emits manager-only extension commands. `ExtensionGameSession` validates role, epoch and request IDs, then delegates to `RoundManager` (question flow, scoring, countdown, auto-advance and interlude) or `StudioShowCoordinator` (authored scenes). Player `SHOW_RESULT` remains inside `RoundManager.showResults()` before the public authored reveal.

## Integration

- Keep presentation state in the existing game shell, separate from native fullscreen state. Request fullscreen from the host gesture, unmount all host controls/modals while presenting, and retain the stage, socket and audio component identities.
- Move presentation key handling to a controller mounted independently of `ManagerControlToolbar`. It emits the same extension commands with epoch/request IDs, ignores interactive/dialog focus and repeat events, never maps Next to End Timer, and requires a matching second destructive chord within two seconds.
- Extend the state envelope with one authoritative pause snapshot. `RoundManager` pauses preparation sleeps, voting cooldown, auto-advance and interlude deadlines; `StudioShowCoordinator` pauses authored-scene deadlines. New votes are rejected while paused. Resume shifts scoring/media clocks and rearms only the same generation.
- Retain `AudioCuePlayer` as the presenter-scoped owner but make its HTML audio channels persistent: two controlled background elements for bounded crossfades and one SFX element. The stage emits idempotent cue events into that owner. Participant phones do not mount background audio.
- The opening MP4 is always muted. Its visual clock reveals the lobby at video end (7.933 s fallback), while the independent opening soundtrack clock can continue to 12 s and then hand off to the lobby loop.
- Approved-source tracks are not copied into the repository because the curation manifest is not approved for product bundling and Determination still has an Apple Loops review note. Optional authorized soundtrack slots accept protected `/media/...` URLs after clearance; the existing Tzila voting cue remains the unchanged `answersMusic` setting.
