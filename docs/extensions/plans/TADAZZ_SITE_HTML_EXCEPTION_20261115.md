# Site HTML metadata exception

Lead approval, 15 November 2026; base `8a43c99c65d8923bd23d8c57ac3607e9a09b5764`.
Only `packages/web/index.html` may change: replace `TADAZZ` with `Tadazz`
in the existing application-name, description and title values (three lines,
six added/removed lines maximum). The initial HTML has no downstream runtime
composition point before it is delivered; a build-time rewrite is prohibited.
No logo, favicon, script, editor or other protected file is authorized. Rollback:
restore those three values. Compare the protected diff against this exception,
run the unchanged freeze guard and report its result; it is not waived.

## Reviewer packet — 15 November 2026

Worktree `codex/tadazz-hq-site-20261115`, base
`8a43c99c65d8923bd23d8c57ac3607e9a09b5764`; uncommitted, pending QA.
The protected HTML diff is exactly three substitutions, 3 additions/3 deletions,
for application-name, description and title. No other `packages/**` file is
changed in this worktree. The unchanged boundary guard reports FAIL, identifying
`packages/web/index.html` as both denied and mismatched; this is the approved
exception above, not a guard PASS. `git diff --check` passed.

Source review: `bootstrap.tsx` strips only `appName` from the branding object
passed to `applyBranding` on platform entry, preventing a late branding response
from replacing the platform title; native entry still applies the original theme.
Marketing, account and Studio mount `ReferenceCanvas` and `SiteMetadata`.
The catalogue now uses the same translated-title filter for cards and empty state;
the three home route headings use site translations. All metadata label and
description keys exist in all eight locale dictionaries. The metadata fallback
was corrected here: unknown views resolve to home, and missing/unknown product IDs
use the same first catalogue item as the actual marketing page. A browser case
was added for those fallbacks and the canonical product URL.

SHA-256 (working files, uppercase hex):

```
F7338A95110A16E3601D61040A9CB2B4720AED6828233B515387E9783D24BBD9 extensions/src/site/bootstrap.tsx
2C2B92E0595F0881AEE3F1617A4AAB7E03356F48921D2E86A77BB1270B29AD16 extensions/src/site/web/shared/ReferenceCanvas.tsx
65381621B1FC5162FC6D50B7E6993F93B7C1116177B6146A6A3FF85246BBC4D8 extensions/src/site/web/shared/SiteMetadata.tsx
75C061177867A941246A75F060AC5CC16DD3C9490D522B55B763D3596CDBCD8C extensions/src/site/web/marketing/MarketingSite.tsx
9BD8C44661456BE6EA8F9CED59E4A4360A538EAB2FCEF513D210BEB583FDADF8 extensions/src/site/tests/browser/marketing-locales.spec.ts
9F3F2952FEB779859FAED515CEF30BFBAB1801D54F6C336B7EB0ECF33B61D37F packages/web/index.html
```

Prior manager locale receipt: `Codex-Agent-HQ/docs/tadazz/preservation/
fresh-manager-20261115-044120/site-locales-vitest.json` reports 15/15 passed;
the locale dictionaries and locale test are unchanged. This does not validate
the new metadata fallback or browser spec. The first `ui:check` attempt under
Node 22 failed at the TypeScript token import. On Node 24.22.1, design, token
registry and catalog checks passed, followed by the boundary failure above;
therefore `ui:check` overall FAILED. No build, browser, deployed or physical-device
acceptance is claimed here. Memory observed approximately 1.46 GiB free and the heavy runner
is assigned to QA, so no competing browser/build was launched.

QA should use the final hashes above and test the actual site entry in Chromium
and WebKit: eight locales, translated headings/search/empty state, marketing
views, product valid/missing/unknown IDs and unknown view, navigation/reload/back,
canonical/OG/Twitter/title/description, `/site`, account and authenticated Studio
routes, delayed tenant branding, and native entry/editor branding/cleanup. Check
initial HTML/PWA and route heads separately from client-side DOM metadata. Record
the actual browser/build revision and screenshots; no live acceptance is implied.
Source tasks 1220482524632790, 1220482735946993 and 1220482471684895 remain open.

### Open native-route coverage gap

Independent QA source review at `Codex-Agent-HQ/docs/tadazz/qa/
fresh-team-20261115/site-review.md` identified that `/manager`, `/game`,
`/party/*` and `/display/*` use the native route tree and do not mount
`ReferenceCanvas` or `SiteMetadata`. Their hydrated titles therefore are not
covered by this patch. The task requires distinct editor, host, player, join and
display titles. Native `applyBranding` remains unchanged, including tenant
`appName`. This is an unresolved source finding, not a browser result.

Do not accept this as complete or create a release commit. A native metadata
composition must preserve the editor freeze and tenant branding, use existing
translated labels or separately authorized locale changes, and be reviewed for
route/provider effects before implementation. No additional upstream hook is
proposed as proven necessary; no fresh build provenance exists yet. QA must
recheck final source hashes and use a producer-proven artifact after that gap is
resolved. The existing `packages/web/dist` is not evidence for these sources.

### Revised source milestone — approved native composition

The preceding hashes and unresolved source finding describe the earlier snapshot. Under the manager decision `Codex-Agent-HQ/docs/tadazz/decisions/SITE_METADATA_COMPOSITION_20261115.md`, `InnerWrap` mounts a single null-rendering metadata owner next to unchanged children, and the ReferenceCanvas owner was removed. The policy maps native editor, manager, host, player, join and display and platform paths. Native branding remains fully applied; its resolved custom appName supplies the native suffix, with legacy TADAZZ normalized to Tadazz. Platform titles remain Tadazz. Canonical URLs allow only public view/product parameters, excluding PIN and reset/auth queries. Six role labels were added in each of the eight dictionaries.

Node 24.22.1: `pnpm --dir extensions exec vitest run src/site/tests/metadata-policy.test.ts src/site/tests/locales.test.ts --maxWorkers=1` PASS, 34 tests. These are policy/dictionary checks, not browser proof. Scoped Prettier check and `git diff --check` PASS. `pnpm --dir extensions ui:check` again passes design, token registry and catalog, and FAILS the unchanged boundary on the approved HTML exception. No typecheck, build, browser, device or live acceptance is claimed. All source tasks remain open.

Build provenance remains pending: existing `packages/web/dist` has unknown provenance and `extensions/site.vite.config.ts` copies assets into that exact directory at `closeBundle`, even if another output directory is selected. Do not overwrite that artifact; arrange a bounded isolated build with an exact source-input manifest and output hashes once resources and an isolated destination are available. QA must independently test the full matrix above, including brand timing, native direct loads/navigation and editor visual parity.

Current working-file SHA-256 hashes (absolute paths):

```text
6982A5C231294292CA2870DD05439808F0A998F9CE437AB33FBA9BE6DCF29DCB C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\bootstrap.tsx
CE0A380FBFBA369DBC768BD1A8E46E8875C8B864D68226152AC0072877340819 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\web\shared\ReferenceCanvas.tsx
5AABEFA6FE5A677DB6385E6933E7338DFA2126A67A550EA7AEF9845A1C2AE854 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\web\shared\SiteMetadata.tsx
41CE3A469F7083EBB46E48D8FDC96E236DCF0D2E9103255360D5580DF0514AD9 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\web\shared\site-metadata-policy.ts
75C061177867A941246A75F060AC5CC16DD3C9490D522B55B763D3596CDBCD8C C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\web\marketing\MarketingSite.tsx
53806C77950B74168FA8EAD7AD845D8600A847954F6D4393D526CFC6C21E99F5 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\tests\browser\marketing-locales.spec.ts
97A9E744B791191CDAE6F4A5DE6F62B4C0DD28BC806FA8376866898A946FF0C9 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\tests\metadata-policy.test.ts
9F3F2952FEB779859FAED515CEF30BFBAB1801D54F6C336B7EB0ECF33B61D37F C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\packages\web\index.html
35DA95623BB09F317DE99DC76D8FBAA12DE4A491238873669A5D4C60164B8B2F C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\locales\de.json
28424B7888675354344F5BF8400607ABEE8E2BEE0559F39B9FE849B382E78362 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\locales\en.json
C31FCDA126AE9E194ECB40031574C90C396FE2AFBF17A7D64622333F17BAB228 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\locales\es.json
6BC3EB566C71DBBE6C56BB0E688B1FC655C5925BFDB97F92323C07DCF60AFE44 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\locales\fr.json
521DE1F981DFED0D7FAB43DB2EA20C0CAB5EF06E5A1B74F17C205054CDCDA591 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\locales\it.json
92848385E9D4E7F86355E5C58D0A4CCCEA4A9B6464EE4DBCDC723F5F1105366E C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\locales\ja.json
F2C5F3EF08AEB3EC7A9276A36A8480998E829E6F49CEB9061A1D453146218E24 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\locales\tr.json
9F19DBA7C129BE9750D2919FDD0DFC02C316C23A0025F43735BB85571AA72356 C:\Users\DAVID\Code\Razzia-worktrees\tadazz-hq-site-20261115\extensions\src\site\locales\vi.json
```

Scoped oxlint on the changed TypeScript files PASS after corrections; the focused 34 tests were rerun and passed.

### Isolated-build preparation

`extensions/site.vite.config.ts` now captures Vite's resolved root and build.outDir through `configResolved` and copies reference assets into that output; the default remains `packages/web/dist`. Scoped Prettier and oxlint passed on the current changed TypeScript/config files. Build is deferred: immediately before starting, free physical memory was 1,999,208 KiB and total CPU sampled 100%, with other projects active. No build was started and no output or existing dist was changed. Before attempting again, reacquire the runner, recheck resources, create a unique empty output under the approved HQ artifact root, and capture complete input and existing dist hash/mtime manifests before and after. The hashes in the previous section predate this config edit and are not a full build-input manifest.
