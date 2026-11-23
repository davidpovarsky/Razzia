# Tadazz UI ownership and naming contract

Scope: specification version 1.0, 10 November 2026. New site, authenticated
customer Studio and host management use a coherent platform system. The content
authoring editor remains exactly as it is; selected show themes own the stage.

## Precedence and freeze

1. Current owner request and this initiative's canonical mandate.
2. Current initiative sections in AGENTS/GEMINI/WORKING_RULES and this policy.
3. Existing data, authentication, wire, theme and compatibility contracts.
4. Historical P0/V3 role/visual instructions only where compatible.

The initiative's precedence does not weaken its explicit safety gates. No editor
change (source, appearance, wording, providers, route, media, typography or
indirect portal/global CSS effects) is authorized. No new upstream `packages/**`
edit is authorized by this plan or by old P0 hook grants. Reject build-time
source rewrites, global alias replacement and hidden DOM modification as ways
to evade source ownership. A justified small seam requires exact path/symbol,
alternatives, maximum diff, regression plan, merge risk and explicit permission.

The separate scoped worktree owns downstream platform/site UI and initiative
documentation/tooling. Preserve the dirty original worktree and every other lab.
Game/browser checks run headlessly in the isolated quota-limited Linux container,
without published ports, live config, customer data or provider credentials.
Read-only public production inspection is allowed; production mutations and
push/merge/deploy require a separate release instruction. Commit only synthetic
evidence, no raw traces or credentials. Asana writes are explicitly requested.

## English and localized brand

Use **Tadazz**, **Tadazz Studio**, **Tadazz Editor** in ordinary English copy,
navigation, accessible names, metadata and translations. In en/fr/de/es/it/ja/tr/vi
the brand remains the same Latin title-case word; translate surrounding text
using the existing i18next namespace. Do not add Hebrew translations. RTL is a
platform QA fixture, not an editor migration. Keep URLs and logo art identical.
Uppercase logo lettering is artwork; upstream Razzia/license notices retain
their attribution. Existing translation _keys_ may remain historical strings
while translated _values_ receive scoped branding corrections. Do not globally
replace strings across editor/shared schemas.

## Internal code

| Item                                       | Convention         | Example                            |
| ------------------------------------------ | ------------------ | ---------------------------------- |
| New files / directories                    | kebab-case         | `host-toolbar.tsx`, `platform-ui/` |
| React components / types                   | PascalCase         | `HostToolbar`, `JoinDetails`       |
| Functions / variables                      | camelCase          | `resolvePortalContainer`           |
| Constants                                  | UPPER_SNAKE_CASE   | `PLATFORM_TOKEN_VERSION`           |
| Names inside an owned scope                | Generic semantics  | `Button`, `Dialog`, `Card`         |
| Brand namespace when ambiguity requires it | lowercase `tadazz` | `tadazzSite` namespace             |

Do not add temporary generation names such as V4/V5 to new platform APIs.
Existing imports remain stable via explicit aliases if a safe rename is useful.
No editor-only component is moved into the new library. Avoid a second component
framework; reuse installed compatible primitives and existing state/handlers.

## Compatibility classification before renaming

| Class                                             | Actual examples / source                                                                                                                         | Policy                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Internal safe rename                              | New downstream platform components, local variables                                                                                              | Rename only in edited scope; typecheck imports and retain public aliases where needed |
| External stable                                   | `TADA_SHOW_FORMAT = "tada-show"`, `TadaShowV1`, authored `version: 1`, `bundleVersion`, `schemaVersion`, `rendererApiVersion`, `manifestVersion` | Keep values and readers/writers; no in-place migration                                |
| External stable                                   | `tada-xlsx`, `tada-json` import discriminators in `show-import-preflight.ts`; authored XLSX headers in `show-workbook.ts`                        | Preserve imports, export headers and round-trip behavior                              |
| External stable                                   | `tadazz-classic`, `tadazz-classic-stage`, `razzia-original`, `razzia-native-stage`; installed package IDs/versions/digests                       | Persisted identities remain unchanged; no cosmetic rewrite                            |
| External stable                                   | `/game`, `/?pin`, `/party/*`, `/display/*`, account/media/API routes; room IDs/PINs, quiz/question IDs, grants                                   | Preserve URL and authorization/data contracts                                         |
| Historical load-only where explicitly implemented | Theme selection histories / pinned retired package versions / explicit `motionKit: legacy` rollback                                              | Continue resolution; never infer a stable format is obsolete just from its name       |
| Protected upstream                                | `@razzia/*`, upstream notices, package names, engine constants and shared controls                                                               | No rename/edit for cosmetic consistency                                               |
| Editor freeze                                     | Everything under `features/quizz/**`, `extensions/src/editor/**`, its styles and shared runtime effects                                          | Zero changes; future proposals only                                                   |
| Immutable artwork                                 | Product logo, source reference images, motion/audio asset bytes, rights metadata                                                                 | Hash-identical, preserve provenance and ownership                                     |

Source anchors: `extensions/src/core/show-authoring-schema.ts:35`,
`show-authoring-convert.ts`, `show-import-preflight.ts`, `show-workbook.ts`,
`show-themes/{definition,selection,registry,resolve}.ts`, both bundled manifests,
`extensions/src/core/packages/protocol.ts` and original session/media contracts.
`TADAZZ_PRODUCT_NAME` currently serves shared legacy/editor consumers: do not
rename its value globally; use scoped platform copy when migrating site/host.

## Validation and phase ownership

- Run `node extensions/qa/tds-boundary.mjs`: rejects protected paths and verifies
  602 hashes, including CSS/font/router/editor and graphical assets.
- Run existing authored JSON/XLSX/bundle/theme round-trip tests against actual
  validators; preserve discriminators instead of adding mirrored mock schemas.
- Any runtime CSS/provider/portal change additionally requires an actual-browser
  editor visual comparison and original save/play compatibility checks.
- Canonical UI/catalog must import actual production components and generated
  token definitions. Scope all selectors; no body/root/preflight overrides.
- Follow TDS-00 through TDS-12 sequentially. Record exact evidence commit and
  PASS/FAIL/NOT RUN; only VERIFIED phases get Asana completion. Parent stays open
  until implementation and the separately authorized release gate are accepted.

TDS-01 changes developer guidance only. All production module bytes remain
identical to TDS-00, so its captured editor appearance is unaffected. Later token
phases must prove that again with fresh production-bundle browser evidence.
