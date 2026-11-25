# Shared media picker audio ownership fix

2026-11-18. The user authorized editor fixes and the coordinator assigned this concrete regression after source review. Work is isolated on codex/tadazz-host-roster-hebrew-20261118-ready after 8b89326870f85b8e47ebe2624eb428a074aee5bb.

Scope: only use-media-library-extensions.ts audio preview ownership and meaningful real React/MediaLibrary lifecycle evidence. Reproduce a queued old onended callback or rejected play clearing the currently active preview label; detach callbacks, stop and rewind the old audio, guard asynchronous completion by exact instance, and clean up on close/switch/unmount. Reuse AudioCuesSection's established ownership approach. No dictionaries, media schema, server storage, catalog or rich-picker feature changes.

The browser fixture uses the real application MediaLibrary, QuizzEditorProvider, TanStack Query, i18n, native buttons and CSS. A controlled Audio implementation deterministically schedules stale events; this verifies lifecycle and UI ownership, not audible playback or decoded media fidelity. The empty media API response is isolated fixture transport.

Coordinator expanded the same scoped ownership defect to LegacyCardAudioConfig and ThemeAudioOptions after confirming unguarded onended/rejected-play callbacks. Include these two editor surfaces, source/card-change state reset, and meaningful stale-callback/source-switch checks. Keep live AudioCuePlayer and already guarded ThemeInstallationPreview unchanged.
