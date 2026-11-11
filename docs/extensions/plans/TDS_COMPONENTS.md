# TDS-04 canonical component implementation checkpoint

BASE_HEAD: `b007fc50380c92faf3ac0f0ffa958d1939fdfca3`. Status: VERIFIED.

Installed stack inspected: React 19.3.0, Radix UI **1.7.0 (MIT)**, Motion 14.1.0,
Vite 8.3.4. Reuse the installed Radix version as an optional extension peer;
the minimal lockfile metadata is owned packaging, not a new upstream source
hook. No new UI framework or dependency upgrade. Source-level variant/slot
patterns are useful; a mass shadcn/framework migration is unnecessary.

New module `extensions/src/platform-ui` owns Button/IconButton, semantic fields,
Select/Switch/Tabs, Card/Badge/status states, Menu/Popover/Tooltip, toolbar/table,
Dialog/AlertDialog and fullscreen-aware scoped portal surfaces. Existing account,
game and server state/handlers remain authoritative. Existing original shared
PlatformControlsProvider stays intact for editor and legacy consumers.

Native browser dialog behavior is retained for site ShadowRoot composition;
host document/fullscreen surfaces reuse Radix primitives. Both share the same
token/surface API. This avoids duplicating server state or replacing the editor's
stack and must be proven by actual focus/keyboard tests in both contexts.
Portal scopes must preserve token overrides, appearance/direction, fullscreen
containment and nested menu ownership. Any legacy-variable projection is local
to a marked host portal surface, never root/body/editor.

Representative migrations at this phase: SiteButton adapter and manager toolbar
Button/AlertDialog/Scope imports only. Toolbar command functions and test IDs
remain byte-preserved; full grouping/reorganization is TDS-08. These are within
the owner's nine-file seam approval and cumulative changed-line bounds.

Owned QA maintenance: the old downstream
`extensions/src/presentation/platform-controls.test.ts` enforces an original-only
raw-button registry. Add only the new canonical native button primitive to that
audit through an explicit platform-owned registry; keep every existing editor /
upstream raw-button limit and the original provider tests. This is a scoped
update to obsolete platform governance, not a relaxation of the editor freeze.
No editor source or original registry entry will be changed.

Acceptance: rendered component states, native disabled/loading, keyboard/ARIA,
focus trap/return, Escape, fullscreen and ShadowRoot portal interaction; actual
site and host integration; strict source guard and editor visual regression.
Do not mark complete until the relevant checks pass on the committed candidate.

## Import and API map

Import only from `@razzia/extensions/platform-ui`; implementation modules are
internal. Wrap owned surface controls in `PlatformScope` with `platform.marketing`,
`platform.studio` or `platform.host`. Use context-only `PlatformThemeProvider`
around composition that also contains a themed stage; never wrap the show or
editor in platform typography. `appearance="light"` is a bounded preview, not
an editor theme. `dir`, semantic token overrides and appearance follow portals.

| Exports                                                                 | Contract                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button / IconButton                                                     | Native button attributes and React 19 ref; primary/secondary/ghost/destructive/unstyled, sm/md/lg, pending disables activation and sets aria-busy. IconButton requires a label. Default type is button; actual form submits explicitly use submit. |
| Input / SearchInput / Select                                            | Native value/event/disabled behavior; required visible label or aria-label; associated description/error IDs and aria-invalid. Select remains native for platform keyboard/touch behavior.                                                         |
| Switch                                                                  | Existing Radix controlled/uncontrolled state; required visible label, native keyboard and disabled state.                                                                                                                                          |
| Tabs                                                                    | Typed item value/label/content/disabled, controlled or default value; automatic activation, horizontal roving focus with RTL.                                                                                                                      |
| Card / Badge / Toast                                                    | Semantic section/status surfaces; Badge tone and optional live status; Toast is a presentation component, not a second notification store.                                                                                                         |
| EmptyState / LoadingState / ErrorState                                  | Required title, optional description/action; loading aria-busy, errors role=alert.                                                                                                                                                                 |
| Toolbar / ToolbarGroup                                                  | Named groups with normal Tab navigation; no undocumented toolbar arrow-key convention.                                                                                                                                                             |
| Table + Head/Body/Row/Header/Cell                                       | Native table semantics, mandatory caption, column header scope, bounded scroll/sticky header. No new data model or virtualizer.                                                                                                                    |
| Menu / MenuItem / SubMenu                                               | Radix trigger/selection/disabled semantics, keyboard traversal/typeahead; nonmodal dropdown can coexist with site ShadowRoot.                                                                                                                      |
| Popover / Tooltip                                                       | Radix dismissal/focus, accessible name for popover, semantic tooltip content and keyboard trigger.                                                                                                                                                 |
| Dialog                                                                  | Required title, optional description/trigger/control; native site dialog and Radix host dialog share the same tokens. Focus trap, Escape, close label, return focus.                                                                               |
| AlertDialog                                                             | Required identity/consequence description and original confirmation callback; cancel, async pending, duplicate-flight latch, visible localized error, no close before successful completion.                                                       |
| DialogPortal / AlertPortal / MenuPortal / PopoverPortal / TooltipPortal | Real Radix portals, explicit container override, scope/direction/token preservation and native fullscreen containment. Optional legacy projection only on the exact marked host surface.                                                           |

The site's pre-existing `ResultDialog` adapter still hosts the original platform
result-modal contract; it is an explicit legacy adapter, not a second new modal
implementation. Existing editor/native `PlatformControlsProvider` stays intact.

## Corrections discovered by actual browser verification

The first run found Radix 1.7's `document.activeElement` assumption in tab/menu
traversal inside ShadowRoot. Installed source inspection and the upstream
[Shadow DOM focus report](https://github.com/radix-ui/primitives/issues/3353)
support this diagnosis. A platform-owned `shadow-focus.ts` adapter handles only
ShadowRoot traversal/entry using its actual activeElement, retaining Radix state
and document behavior. No dependency patch, global DOM override or editor change.
Full menu entry, disabled-item skip, nested export and direction checks exercise
the adapter in both engines.

WebKit additionally let native dialog Tab traversal escape the site's shadow
boundary. The native dialog now explicitly traverses its visible enabled controls
for Tab/Shift+Tab while keeping browser modal/inert/top-layer ownership. Host
dialogs retain Radix focus ownership. The browser contract checks every one of
seven forward and seven backward steps, nested menu Escape, selection and trigger
focus return; no snapshot tolerance or interaction assertion was relaxed.

The first integration run also caught default `type="button"` breaking the old
account form's implicit submit. AccountGateway now marks its real submit button
explicitly. No account endpoints/validation changed. The fullscreen fixture
needed its own bounded scrolling container to keep long fixture controls visible;
the retained initial report distinguishes that harness defect from portal code.

Packaging: only the extension importer gains the already-locked optional Radix
1.7 peer reference (three lockfile lines). Frozen installation passes all 467
supply-chain entries; no version/snapshot upgrades. Normal lock-only resolution
was rejected by an unrelated floating root package's release-age policy; isolated
metadata generation pinned only that temporary copy to already-locked versions.
The real root package.json is unchanged; final frozen install is authoritative.

## Verified checkpoint

Run `bash extensions/qa/tds-phase04.sh` only in the isolated remote QA container.
Final run `phase04-r4-job.log` exits successfully with every recorded check zero:

| Check                                          | Result / evidence under `docs/extensions/qa-evidence/design-system-20261110/`              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Frozen install                                 | PASS; 467 policy entries, no upgrades, `phase-04-install.log`                              |
| Unit contracts and original primitive audit    | PASS 14/14; `phase-04-unit.json`                                                           |
| Extension and web TypeScript                   | PASS; `phase-04-types.log`, `phase-04-web-types.log`                                       |
| Real canonical interactions                    | PASS 18/18 Chromium/WebKit, no skipped fullscreen checks; `phase-04-browser.json`          |
| Token/negative-scope browser contracts         | PASS 6/6 Chromium/WebKit; `phase-04-token-browser.log`                                     |
| Production bundle + actual API full baseline   | PASS 1 complete scenario, 35.4s; `phase-04-integration.json` and `phase-04/`               |
| Protected hashes and cumulative seam bounds    | PASS 601 unchanged, only approved toolbar modified, 12/140 lines; `phase-04-boundary.json` |
| Generated registry / design rules / formatting | PASS; phase logs and local Prettier / diff checks                                          |

Four editor captures are **byte-identical to verified TDS-03**. Against the
independently built original-source control, unchanged raw-RGBA diagnostics remain
9/2 antialias edge pixels for question/media and zero for scene/timeline/settings;
the existing zero-threshold/maxDiffPixels comparator passes. See
`phase-04-editor-proof.json`; no new editor variation or source edits.

Reviewed actual dialog and fullscreen captures in both contexts; legible shared
surfaces, focus outlines and top-layer containment are visible. Component captures
are `phase-04-dialog-{host,site}-{chromium,webkit}.png`,
`phase-04-{host,site}-{chromium,webkit}.png`, and fullscreen equivalents. Real
site/Studio/host/roster/editor captures are in `phase-04/` (safe synthetic data).
Initial failures and intermediate diagnostics are retained in `phase04-r1`,
`phase04-r2`, `phase04-r3`; final reports overwrite neither original baseline nor
those failure records. Broader role/device/performance matrix remains TDS-12.
No push, merge, deployment, production writes or new authorization required.
Next: TDS-05 internal live catalog and governance, using these exact components.
# TDS-08 production host compositions

Current host additions are documented in [TDS_HOST.md](TDS_HOST.md):
`HostDisplayControls` forwards existing window/copy/presenter callbacks;
`HostControlBar` scopes existing footer controls; `HostAudioControls` skins the
original single audio component without owning its engine. `DialogPortal` accepts
an optional `returnFocusTo` selector for controlled dialogs without Radix Trigger;
it restores only otherwise-lost focus. Legacy host switches reuse canonical
track/thumb declarations. All selectors stay explicitly scoped; stage/editor
styles and state remain separate. The live catalog imports all three production
compositions and contains 41 runtime exports across the same nine families.
