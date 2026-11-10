# Tadazz internal live component catalog

TDS-05 BASE_HEAD: `c27a337efc452fd8bd828661a436a482a24eb6ae`.
Status: VERIFIED in the isolated remote QA container.

## Launch and ownership

From the scoped worktree, with the installed supported Node 24/pnpm toolchain:

```sh
pnpm --dir extensions ui:catalog
# Local development: http://127.0.0.1:4340
pnpm --dir extensions ui:catalog:build
pnpm --dir extensions ui:catalog:preview
pnpm --dir extensions ui:check
```

These are owner launch instructions, not a claim that a local server was started
on the owner's machine. This run uses only the isolated remote QA container;
it publishes no ports. Both catalog dev and preview reject non-loopback host
overrides before starting. No public application/catalog route is added.
Build output is ignored `extensions/dist/platform-catalog`; `publicDir: false`
keeps unrelated public assets out and `envDir: false` reads no environment files.
Do not copy this internal artifact into the public site without a new reviewed
authentication/hosting decision. No accounts, production data or transport calls
are present; interactions mutate explicitly synthetic memory state.

The catalog is a separate Vite 8.3.4 / React 19 build using installed dependencies.
This is the justified Storybook equivalent: real production imports, typed
examples, token controls, states, responsive/locale/RTL examples, source/API/usage
docs and browser evidence, without a new Storybook stack or dependency upgrade.
There is no addon runtime or generated prop inspector; typed examples and actual
source are authoritative. Vite's supported
[Oxc automatic JSX](https://vite.dev/config/shared-options#oxc) is used directly.
Client-only dependency `use client` warnings do not imply an RSC/server boundary
in this client-only artifact; all build warnings are retained, not suppressed.

## Actual components and states

Import new UI from `@razzia/extensions/platform-ui`. The catalog's
`src/platform-ui/catalog/registry.ts` typechecks its 38 named runtime exports
against that real barrel; `ui:check` verifies their actual module paths. Stories
render production imports, never copied control implementations. The source/API
map is also in [TDS_COMPONENTS.md](TDS_COMPONENTS.md).

Nine families cover buttons/icons, fields/select/switch, cards/status/toasts,
tabs/toolbars, menus/submenus/popover/tooltips, dialogs, confirmations, native
tables, scope/portal composition. Default, disabled, loading, error, success and
empty examples are visible together; use real hover and keyboard focus for
those states. Confirmations can genuinely reject through their synthetic async
callback. Focus/keyboard/portal tests are shared with real consumers.

Controls switch marketing/Studio/host context, light/dark, eight existing content
locales and RTL fixture. Developer explanatory text is English; component labels
use an isolated i18next instance backed by existing en/fr/de/es/it/ja/tr/vi
common/error resources. It never changes application/editor namespaces.

Foundations come directly from production token exports: semantic palette, Rubik
type samples, spacing, radii, shadows, icons, breakpoints, motion, springs and
component tokens. The action override updates actual buttons and dialog portals
in all three contexts. A surface-token control inside a live dialog demonstrates
portal inheritance. Existing site/host consumer token smoke remains in
`tds-tokens.spec.ts`; editor/show-theme negative scopes remain independent.

Composition examples show a synthetic Studio page, host roster/table dialog with
forty rows and bounded sticky scrolling, and lobby/display-mode layout. The lobby
is explicitly synthetic and does not pretend to supply a live PIN/QR/dial-in
contract. Actual room integration remains TDS-07 and will be reflected here then.
No customer contact/phone values are used.

## Governance and visual corrections

`ui:check` combines scoped color/selector/editor-import checks, generated token
freshness, catalog canonical-control/transport/import checks and source freeze.
Catalog metadata is checked against source files. The import check scans all
577 non-catalog application TS/TSX sources, not only entry points, and rejects a
catalog dependency in application source. The original downstream AST audit still
allows only the original native-button registry and one exact canonical button
primitive. CI runs these guards and fourteen platform/original-primitive unit
contracts. Historical site/editor/show artwork and bounded legacy adapters retain
their documented exceptions; the frozen editor is not migrated or reformatted.

Visual review of the first otherwise-passing build found native WebKit selects
painting a light background beneath light text in dark mode. Explicit scoped
dark/light `color-scheme` corrects the browser-native palette, with screenshot and
browser checks. Dialog body spacing also uses the shared grid/gap token with
standalone actions aligned consistently. Only `.tds-scope` is affected, never
root/body/editor/show. Initial captures/reports remain in `phase05-r1`; final QA
reruns canonical interactions, token consumers and the full API/editor baseline.

## Verification entry points

Run `bash extensions/qa/tds-phase05.sh` only in isolated remote `/cleanup` with
`TADAZZ_REMOTE_QA=1`. It checks types, fourteen unit contracts, governance,
production catalog build, negative public-bind checks, catalog browsers, existing
canonical interaction/token browsers and production-bundle API/editor regression.
`tds.catalog.playwright.config.ts` serves the built artifact, not dev transforms.
Evidence lives in `docs/extensions/qa-evidence/design-system-20261110/phase-05*`.

Coverage includes Chromium/WebKit, eight locales, real button/dialog token
propagation in marketing/Studio/host, five simulated widths (1920×1080, 1366×768,
1024×768, 768×1024, 390×844), RTL, light, reduced motion, 40-row modal scrolling
and 200% CSS zoom. CSS zoom is not physical browser/device validation. The full
implementation matrix remains TDS-12. No merge/deployment is authorized here.

## Verified checkpoint

Final `tds-phase05.sh` run records zero for all thirteen checks:
extension/web types, unit, catalog source, production catalog build, local-only
negative checks, catalog browser, canonical component browser, token browser,
full API/editor baseline, source freeze, design rules and generated registry.
PASS: 14 units, 14 catalog browser cases, 18 canonical browser cases, 6 token
browser cases, 1 full actual API/production-bundle scenario (35.6 seconds).
No browser skips. Both engines actually exercised every locale and width listed.
Physical devices and native browser-zoom UI remain NOT RUN; CSS zoom is explicit.

All **four final editor PNGs are byte-identical to the independent original-source
control**, with zero raw-RGBA differing pixels. See `phase-05-editor-proof.json`.
Earlier TDS-03/04 antialias diagnostics remain preserved as historical observations;
no baseline, comparator threshold or PNG was edited to obtain this result.
Guard: 601 protected/artwork hashes unchanged; the previously approved toolbar
seam remains the only exception at 12/140 cumulative changed lines. No new
upstream change or dependency/version/lockfile change in TDS-05.

Reviewed desktop, phone/WebKit, dialog, RTL/light and zoom captures; WebKit native
selects are now legible. Component screenshots from the reused harness are under
`phase-05-components/` with their stable `phase-04-*` basenames; these are fresh
TDS-05 captures and do not overwrite committed phase-04 evidence. Catalog captures
and all final logs/reports are `phase-05*`; initial pre-correction artifacts are
`phase05-r1`. The full site/Studio/host/editor images are in `phase-05/`.

Catalog production output: 473.58 kB JavaScript / 148.27 kB gzip, separate from
the public app; no public initial-JS performance claim is inferred from this.
Public application/performance matrix remains TDS-12. Root AGENTS/GEMINI and
WORKING_RULES now link to this guide. Asana checkpoint follows the commit.
Next exact action: TDS-06 real site/Studio usability and translations.
