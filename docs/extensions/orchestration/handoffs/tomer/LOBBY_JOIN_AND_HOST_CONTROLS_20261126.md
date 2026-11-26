# Lobby join and host controls

Production base: `2b4bd0326491ec0059b60c7f42b4bfaac2f6cbb6`.

- `packages/socket/src/services/game/index.ts`, `pilot-dial-target.ts`: project the dial target that already resolves to this room. Preserve provider routing and caller admission. Verify exact owner, quiz and active-room selection with synthetic targets.
- `packages/web/src/features/game/components/tadazz-show/lobby-directory.ts`: read the two new public lobby policy values for the common stage. Verify the same payload in the manager and audience.
- `packages/web/src/features/game/components/ManagerControlToolbar.tsx`, `GameWrapper.tsx`, `tadazz-show/TadazzShowView.tsx`: remove duplicate controls, keep one room lock and one presentation entry, and omit Previous where unavailable in the lobby. Verify Start, operator navigation, keyboard shortcuts, safe exit, and viewer layout.

The authored manifest uses `defaults.lobby.joinMode` and `defaults.lobby.joinPrimary`. The saved number, seating layout and guest policy remain independent of visual presentation. No provider calls are used during acceptance.

- `packages/socket/src/api/routes/games.ts`: extend the room-host settings validator with presentation only. Test owner authorization and the saved public projection.
- `packages/web/src/features/game/components/GameSettingsModal/index.tsx`, `features/manager/queries.ts`: save the active room override through Host Settings.
- `packages/web/src/features/game/components/states/Room.tsx` and `tadazz-show/PackageStage.tsx`: honor the shared projection while keeping unextended Razzia and package negotiation functional.

Phone-only is the default. In `defaults.lobby`, `phoneRegion` accepts `auto`, `il` and `uk`. Use `dialNumbers.il`, `dialNumbers.uk`, `showPin` and `showQr` to configure the lobby. The Host Settings override applies to the active room.

- `packages/web/src/features/game/components/PlatformGameOpening.tsx`: expose the existing Host Settings dialog before the audience lobby appears. Verify opening, skip and lobby projection together.
