# BMS 1.1.0 package archive

This directory preserves the accepted BMS package as a separately compiled game package. It is not imported into the native application renderer.

## Contents

| Path | Purpose |
| --- | --- |
| `1.1.0/` | Exact unpacked contents of the accepted ZIP, including its manifest, game, theme, fonts, artwork, credits and third-party notices. There are no extra documentation files inside this version directory. |
| `bms-memory-files-complete-1.1.0.tadazz` | The exact accepted ZIP. Use these bytes when the qualified package is required. |
| `qa/bms-theme-visual.mjs` | Browser verification harness, relocated from the application source archive. It reads the archived game and theme by default. |

The package ID is `bms-memory-files-complete`; its version is `1.1.0`. The game is `bms-reunion`, and its theme reference is `bms-memory-files@1.1.0`.

## Accepted artifact

| Property | Value |
| --- | --- |
| ZIP bytes | `143795` |
| ZIP SHA-256 | `833c817242d9a1d505ad05641c17cbb889740ae811dad30daa153c300e4a545c` |
| ZIP entries | `19` |
| Compiled bundle SHA-256 | `5c2a8968381281ce28bee11818aea56b7053a6e3c818e2146b7546c7d4eec4ea` |
| Qualified worker image | `sha256:623c6edc603a8dde3188f4726a62d52eb99feabfda9c491f64d80c459f924e2b` |
| Unchanged game descriptor SHA-256 | `52945d06ce9e9e04cfe2accaf1204414dff41d2b07a3943be2b87bad5b812438` |

The native package inspector, media validation and compiler accepted this ZIP. The worker returned `mediaValidated: true`, with JavaScript of 867,964 bytes and CSS of 80,467 bytes. Qualification ran in a separate synthetic store; it did not upload or install the package in production.

Keep this version directory and ZIP immutable. A future package change should receive a new version and its own qualification record. Recompressing identical files can change ZIP bytes and its source digest, so it does not reproduce this accepted artifact automatically.

## Source history and evidence

The archival merge retains these original commits as ancestors:

- `d9b04ca768986627b446275e97ef59b48e8cd435` — English visual redesign, stable question and answer presentation, phone lobby, attendance register and initial visual evidence.
- `60f340c310c61dee0b35be575fc95c09e07ac8ea` — static Rough Notation keyframe for the sandbox CSP, required native logo adapter, strict CSP verification and matched package worker evidence.

Historical receipts remain at `docs/extensions/qa-evidence/bms-theme-visual-20261121/`. Their original worktree and source paths describe the runs that produced them and have not been rewritten. Archive integrity and application-source equality are recorded separately at `docs/extensions/qa-evidence/bms-theme-archive-20261121/archive-integrity.json`.

The strict CSP browser run passed 25 checks, including all 23 original questions at desktop, laptop and phone sizes; persistent question and answer nodes; engine-owned audience and correctness reveals; phone-only joining; roster connection updates; and visible Rough Notation highlights without CSP violations. Roster screenshots use synthetic QA names. The product uses only the roster supplied by the host.

All 23 original quiz cards are retained exactly apart from removing their custom `audioCues`. The final manifest contains no audio files, the theme has no audio assets, and the game has no audio overrides. All 16 theme audio events inherit the platform defaults. The canonical question-key/text/answer-object digest is `a97123e8065d8c6bf2ef15200d17793b652e73f14df96e61279b3df2f982ff8b` in both the original and accepted game.

## Application build boundary

The archival integration is based on application freeze `cd748b88d24816c8ad473215a621ed2f6f0019c5`. It leaves every application release `SOURCE_PATHS` input unchanged.

The existing native renderer generator, `extensions/qa/build-application-preview.mjs`, hashes its esbuild import graph, style sources under `packages/web/src` and `extensions/src`, native theme registry/resources, lockfile, generator bytes and Node version. Its Tailwind Vite build uses `packages/web` as the scanner base and explicitly adds `extensions/src`. This archive is outside those paths and has no application import.

The release runner `extensions/qa/phase3-recovery/linux-verify.py` archives all tracked `extensions` and `packages` files plus selected root configuration files. This reference directory and the relocated QA harness are outside that archive. The existing byte-preserved reference rule in `.prettierignore` already covers this location. The archival integration changes neither the inventory generator nor any ignore or build policy.

The application freeze's release provenance remains attached to that freeze. This documentation/source archive does not constitute another application build or production deployment. Future changes to the scanner or release source selection must review these boundaries again.

## Running the visual harness

Run the harness only in an approved isolated Linux QA environment with the platform's pinned dependencies and Chromium available. Keep the source and dependency trees read-only, provide a writable evidence directory, and disable external networking. The fixture serves only on container loopback.

From the repository root inside that environment:

```sh
BMS_THEME_QA_DEPS=/cleanup BMS_THEME_QA_OUTPUT=/evidence/bms-visual \
  node docs/extensions/references/packages/bms-memory-files-complete/qa/bms-theme-visual.mjs
```

The default package directory is the sibling `1.1.0/` directory. To verify another extracted copy of this exact package, set `BMS_THEME_PACKAGE_DIR` to that directory. The harness reads its `games/bms-reunion.json` directly; no separate fixture JSON is needed. It writes screenshots and `receipt.json` to `BMS_THEME_QA_OUTPUT`.

This component/CSP browser harness complements the platform's native PackageStage continuity checks and actual package worker qualification. It does not claim to test production telephone routing or install the package.

## Third-party material

Full notices and exact source information are preserved in `1.1.0/third-party-notices.json` and `1.1.0/credits.json`. React Bits LightRays is incorporated into the BMS game under its MIT plus Commons Clause terms; its source/CSS and shader-derived stage artwork remain non-exportable in the package manifest. Rough Notation retains its MIT notice, and the Barlow fonts retain their SIL Open Font License notice. The static Rough Notation stylesheet replaces only runtime keyframe injection; the platform CSP remains unchanged.
