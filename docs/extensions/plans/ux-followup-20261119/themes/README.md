# Editor theme integration verification — 2026-11-19

## Result

The native question editor and scene editor now share a compact theme drawer with selection, validated .tadazz package import, and saved versioned theme switching. The ordinary /studio/themes entry uses the Studio shell and sends each game directly to its own editor theme drawer. Advanced authoring remains separately reachable for accounts with author grants.

Nine browser groups passed against the current checkout in an isolated Vite/backend environment. No customer accounts, games, mail, payment, or production configuration were used or changed. Page errors: zero.

## Verified behavior

1. A direct editor theme link opens the native drawer, and choosing a theme updates the actual editor background.
2. The native save API persists theme ID/version. Reload keeps that choice. Switching back restores that theme's prior audio override. Base question content stays unchanged.
3. Document and drawer bounds fit 1440×900, 1024×768, 390×844, and 320×640. Escape closes the drawer and returns focus to its trigger, including a deep-linked drawer.
4. Invalid package input produces an error without submitting the surrounding game form or changing saved content.
5. A package containing both a declarative theme and game content offers only the theme in editor import. Actual upload/preflight/approval/install APIs are exercised. The install response contains no installed games, the game catalog remains unchanged, and the imported theme can be selected, saved, and reloaded.
6. Installed private media renders under the author's real media cookie; the imported poster has naturalWidth greater than zero and its backdrop appears on the canvas.
7. An injected catalog HTTP 503 preserves the prior installed registry and open drawer, presents an error, and recovers through Retry.
8. The scene editor exposes the same theme control; the Studio themes page keeps normal navigation and links to the exact game.
9. Hebrew RTL theme editing fits 390px.

The receipt combines related assertions into nine named groups.

## Qualification boundary

The disposable declarative package fixture uses an explicitly synthetic worker result to isolate the editor UI/API contract. The separate networkless Linux package build worker was **not** rerun or qualified by this Windows test. Independent-review authorization, exact receipt/revision/source/build binding, and installation checks remain intact; no production approval or package was created.

The test uses the real importer and private-media routes. A preliminary screenshot failure was traced to the test logging a reviewer into the author's browser context, overwriting the media cookie. The final run logs the author in last and checks the actual image decode. Another interrupted development run was invalidated by concurrent Fast Refresh; final QA disables HMR locally.

## Evidence

- receipt.json: final browser result and viewport measurements.
- source-validation.json: web and extensions TypeScript checks, scoped lint, diff check, source hashes, and 14 theme keys present in all nine locales.
- theme-selected-desktop.png, theme-drawer-{1440,1024,390,320}.png: native controls and responsive layout.
- theme-imported-poster.png: imported private media and actual canvas.
- theme-scene-drawer.png: shared scene editor control.
- studio-theme-entry.png: ordinary Studio entry.
- theme-drawer-hebrew-390.png: Hebrew RTL.
- qa-cleanup.json: exact owned frontend/backend process cleanup.

The disposable harness and full execution log are under work/theme-editor-qa-20261119/ (server.mts, vite.config.mts, browser.mts, package-fixtures.ts, browser-run.log). They use only synthetic example.invalid accounts and a temporary config directory. No shared web/dist or build artifacts were generated.
