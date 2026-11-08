# Fullscreen tie selection

User reported an off-center equals sign and no discoverable picture choice in host presentation mode. Existing choice buttons live in ManagerControlToolbar, which is hidden while presenting. Immediate workaround: Esc, choose the picture by its title in the toolbar, then Present from Host.

Upstream hook before editing: `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx` sends the existing authenticated `RESOLVE_STORY_TIE` command from a host-only native-card callback, mapping contestant order to the authoritative tieCandidates answerIndex. No new endpoint, backend changes or projector/player authority. The extension adapter forwards the local callback into the native tie scene. Card buttons are disabled while paused/resolved.

The equals sign's existing shared animation overwrote its centering transform. Independent CSS translate now retains both-axis centering while the entrance transform animates. User requested immediate release without another lengthy test cycle; compile/build followed by a frontend-only hot-copy, preserving live games and phone calls.

Released `/assets/index-CBHTQvKt.js`, image `sha256:4ee935e0d22da9f7446658de6dcf0e98b24152fda54d7b788b4d77d6b9b87e1e`, tag `tadazz:fullscreen-tie-20261108-final`. Web TypeScript and build passed; no new browser test cycle per the user's instruction. Main Node and gateway process/start identities and all four tenant/base file hashes were unchanged. Existing live calls and rooms were preserved. Native tie buttons explicitly re-enable pointer events beneath the presentation-only parent. No buttons/callback are given to spectators/players. On refresh the current host may choose by clicking the picture, with no exit from fullscreen.
