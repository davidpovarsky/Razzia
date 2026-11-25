# Portable package developer starter

This directory contains synthetic, exportable examples, not reviewed customer
content. Run executable authoring/build/browser checks on the isolated Linux QA
host according to repository policy. Requirements: Node 24, frozen pnpm workspace
dependencies, and the separately operated networkless builder. Nothing here
enables an installer in production.

From the repository root, use this command prefix:

```sh
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/package-authoring.ts
```

1. Append `scaffold /tmp/my-show complete arcade` to create a new directory.
   Choose `theme`, `game`, `complete` or `declarative`, and `arcade`, `cinematic`
   or `playful`. The complete starter includes two games, ten questions and fifty
   answer images per game, a shared background, WAV audio, MP4 and Lottie scenes.
2. Edit `theme/src/entry.tsx`, CSS, theme descriptor and authored game JSON. The
   default component receives `ThemeSDK`; its `snapshot` is public presentation
   state, `submitAnswer` is an intent and `asset` accesses declared package assets.
   No scoring, timers, sockets, accounts or secrets belong in customer code.
3. Replace synthetic titles, IDs, provenance and rights. Keep all eight locale
   maps. Inventory every file in the manifest, including source/CSS. References
   in JSON, TSX imports and CSS URLs are relative to their declaring file.
4. Append `pack /tmp/my-show /tmp/my-show.tadazz`. This refreshes sizes/hashes,
   validates inventory and refuses overwrite, symlinks or unlisted files. Append
   `validate /tmp/my-show.tadazz` and `inspect /tmp/my-show.tadazz` to check it.
5. Sign into the private staging manager, open **Quizz → Install TADAZZ Package**,
   choose the file, inspect contents and select **Build preview**. The separate
   operator broker must be running. No manual media uploads are necessary.
6. Preview the actual isolated renderer. An independent assigned reviewer must
   inspect licensing, content, accessibility and performance and submit the exact
   digest/revision receipt described in the API document. A self-approval fails.
   Game-only packages require successful media validation, not theme approval.
7. Select contents, optionally skip demo games, then install. Fresh game IDs
   avoid overwriting existing quizzes. Skipping a required bundled theme needs
   the explicit Classic option. Select the installed game and start normally.
8. Export the original package or a current saved imported game. Reimport under
   another authorized account to verify portability. Current-game export excludes
   participant data and fails for new media without the original export rights.

CLI automation uses private environment values `TADAZZ_PACKAGE_SERVER` and
`TADAZZ_PACKAGE_TOKEN`; an assigned reviewer may also set
`TADAZZ_PACKAGE_WORKSPACE`. Never paste tokens into packages, URLs or reports.
Commands: `upload FILE`, `build ID`, `status ID`, `preview ID`, `approve ID
REVIEW.json`, `install ID CONTENT_IDS...`, `list`, `rollback ID`, `export ID FILE`.
`preview` returns the authenticated manager deep link, not a credential-bearing
public URL. `fixtures DIR` produces all six examples. `schema FILE` and
`schema-runtime FILE` export JSON schemas; Zod remains the executable contract.

Only pinned React, React DOM, the SDK and relative inventoried modules resolve.
No npm/package scripts, Node imports, computed dynamic imports or remote CSS.
Use normal TSX components and CSS for distinct answer cards, timers and results.
The snapshot clock is authoritative; do not create a second scoring clock.
Images and WOFF2 may be embedded in the renderer. Manifest scene video/Lottie
and audio run in the existing trusted foreground/media owner outside the iframe;
direct customer `<video>`/audio network playback is deliberately unavailable.
Numeric answers, question video and explicitly unsupported slots use the
existing native stage. Declare each role/slot accurately.

For starter verification run `pnpm --filter @razzia/extensions exec vitest run src/server/packages/package-runtime.test.ts` in Oracle QA. The dedicated browser
config and broker instructions are in the deployment document. Source examples
and schema outputs are generated from this exact contract, not handwritten hashes.

See `docs/extensions/PACKAGE_RUNTIME_API.md`,
`docs/extensions/PACKAGE_RUNTIME_DEPLOY_ROLLBACK_2026-11-09.md` and
`docs/extensions/PACKAGE_RUNTIME_ACCEPTANCE_2026-11-09.md`.
