# TDS-03 versioned platform tokens and bounded scopes

Source of truth: `extensions/src/platform-ui/tokens.ts`, version **1.0.0**.
The [generated registry](tds-tokens.json) is produced by
`pnpm --dir extensions ui:tokens`; `ui:check` rejects stale generated data.
The runtime catalog will read these production exports directly, not this JSON.

## Layers and context API

Primitive groups: color, font, type scale, weight, spacing, radius, icon sizes,
shadow, UI duration/easing/spring, stacking and breakpoints. Semantic roles:
background/surface/elevated, text/muted text/border, action/action text/focus,
danger/danger text/success/warning/info/overlay. Component groups: button, input,
dialog and table. Only primitive definitions contain brand color literals.
CSS custom properties are generated from these records as `--tds-*`.

`platform.marketing`, `platform.studio`, `platform.host` are the only runtime
contexts. `PlatformThemeProvider` carries context without DOM/style effects;
`PlatformScope` applies variables only to platform-owned DOM. It generates scoped
CSS; overrides are typed semantic keys and affect only the owning scope. Defaults
stay in stylesheets, so reduced-motion media rules can override timing variables
(inline default durations would defeat that preference). Static source overrides
are for trusted component composition/QA, never customer CSS or saved themes.

`editor.current` is documentation only: original neutral/light Razzia/Rubik and
all editor source/styles remain frozen. Runtime application to this context is
rejected. `show.theme` remains the existing resolver; platform token generation
also rejects that context. The library does not modify `--show-theme-*`, global
`--color-primary`, root/body, original fonts, Tailwind preflight or editor imports.

A bounded `appearance="light"` platform preview uses its own semantic roles and
contrast checks; it is independent of `editor.current`. The editor's existing
documented roles remain original primary `#ff9900`, secondary `#1a140b`, white
background, gray surfaces/text and Rubik, defined in the frozen upstream CSS.
No editor light-theme runtime export, import or style application is added.

## Real consumers and scope boundaries

ReferenceCanvas now derives its initial background/text/font from token exports
and mounts an explicit marketing/Studio PlatformScope inside its existing
ShadowRoot. Existing immutable reference CSS stays byte-identical. A bounded
legacy site bridge maps its `--bg/--text/--white/--lime/--muted/--line/--font`
variables to semantic roles **inside that scope only**. The root document and
original PlatformControlsProvider are unchanged. Existing touch-action cleanup
is retained.

Host integration is approved but belongs to its later phases. The isolated React
fixture imports the actual SiteButton and original host Button under actual
PlatformScope production exports. Changing action once updates both consumers;
the out-of-scope original control and actual resolved show palette stay unchanged.
This is component-consumer evidence, not a claim that host integration is already
finished. No placeholder clone of either production button is used.

For later portals, context and generated scoped CSS must travel with the portal
surface into its real ShadowRoot/fullscreen container. Do not assume document
CSS can style shadow children, or that z-index can raise a body portal above the
fullscreen top layer. Do not wrap show content in a font/color-setting UI scope.

## Show manifest mapping remains independent

| Existing contract                                                 | Resolution / fallback policy                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `classic.manifest.json`, `tadazz-classic`, `tadazz-classic-stage` | Original trusted renderer/31 assets and adapter backdrop references, no ID/hash edits                       |
| `razzia.manifest.json`, `razzia-original`, `razzia-native-stage`  | Original native show/36 assets, no replacement of global GameBackground or editor                           |
| Overrides                                                         | Existing theme → show → role → card/scene → card-role resolution; custom image/video/fit behavior unchanged |
| Missing/unknown choice                                            | Existing Classic display fallback and manager-only diagnostic; preserve saved unknown identity              |

No token source changes renderer IDs, palette definitions, audio owners, WAAPI,
Lottie assets, customer overrides or persisted formats. UI motion tokens are
declarations here; implemented motion evidence is tracked separately in TDS-10.

## Enforcement and validation

`extensions/qa/tds-design-check.mjs` rejects raw brand color literals outside the
token source in the newly converted modules and rejects editor imports/unbounded
selectors. Explicit exclusions: immutable reference artwork/CSS, historical site
CSS awaiting migration, frozen editor/upstream and show/cinematic runtime.
`tds-boundary.mjs` verifies 602 source/artwork hashes and permits only the exact
nine owner-approved host seams within recorded changed-line bounds. It reports
unchanged hashes and approved modified hashes separately. The editor never gets
an exception.

A new additive `.github/workflows/tadazz-platform-ui.yml` reuses the existing
pinned checkout/setup actions and runs ownership/token/design and platform unit
checks for relevant pull requests. No original workflow/action is edited; no
push or GitHub CI run is claimed. This new downstream governance file is in the
initiative allowlist because the mandate explicitly requires CI enforcement.

Verified exit: **6 token/contrast/boundary unit tests**, **6 Chromium/WebKit
consumer/reduced-motion/light-preview tests**, extension TypeScript and design /
registry / 602-file hash checks pass. A focused actual-production-bundle browser
scenario also passes all four editor comparisons with Playwright threshold 0 /
maxDiffPixels 0 (the comparator excludes antialiasing-edge noise).

The first strict comparison identified 1,551 pixels on the selected-question
border: the old capture was taken before selection initialization settled.
No tolerance was raised. QA now explicitly selects the same first question,
asserts its active border and removes incidental mouse hover. A fresh control
was built with the original baseline ReferenceCanvas, independently verified
SHA-256 `cb29c8c9010ebe26e22f8d8d1a22c101ec0a3a9475efd1aed4a1d5fa39bb8b2a`
(matches the TDS-02 source inventory). No other runtime product source had changed
at this phase. The original TDS-00 captures remain intact. The controlled baseline
and candidate then pass that visual comparison on all four editor screens.
An additional raw-RGBA diagnostic is retained: scene/timeline and settings PNGs
are byte-identical; question/media contain 9 and 2 differing antialiasing-edge
pixels respectively, mostly 1–2 channel levels (maximum 7). This is not claimed
as bit-for-bit identity of all PNGs. Original-source repeat captures are also
retained and are byte-identical to their control. The visual comparator classifies
the candidate's edge noise as antialiasing, rather than changed UI pixels. Final
QA must preserve this distinction and repeat the checks on its exact candidate.
The animated theme preview is captured but is not claimed pixel-identical.
An unrelated broad host-history continuation raced live player presence; the
focused editor scenario is explicitly identified, and the full harness now
waits for server-driven connected count before Start. No product behavior fix
or weakened assertion was used.

Evidence: `docs/extensions/qa-evidence/design-system-20261110/phase-03-*`,
`editor-control/`, `phase-03/`, and retained initial mismatch images/log.
Full runtime/device/lifecycle acceptance remains TDS-12; host integration is
approved but not yet implemented at TDS-03.
