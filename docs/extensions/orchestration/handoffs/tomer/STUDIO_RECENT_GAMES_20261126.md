# Studio recent game metadata

Production baseline `90c839df5a73d31ff009cafea3aba364d09376ae`.

- `packages/common/src/types/game/index.ts` adds an optional quiz identity to result records for historical compatibility.
- `packages/socket/src/services/game/index.ts` records the quiz identity when an actual show result is saved in the existing account scope.
- `packages/socket/src/services/config.ts` exposes the saved quiz file modification time, authored poster, and if available the result's quiz identity through the existing manager-scoped projections. Existing filename resolution and subject ordering are preserved.
- Verify legacy result and quiz config reads, metadata API behavior, and the Studio recent-activity projection with mixed old and new results.
