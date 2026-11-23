# Site touch scrolling — fixed and deployed, 10 November 2026

> **Superseding release:** the scrolling fix is included in the later Studio and
> performance update. For future container recreation use
> `tadazz:site-audit-final-ba64f49`
> (`sha256:8bc2c0dc796151f0e9b8584773a980142bebdb0e14b30e704d3f207505196c2a`),
> public entry `/assets/index-I6QCz3Vn.js`. See the
> [current review](SITE_REVIEW_HE_20261110.md). The earlier image and entry below
> are retained as historical evidence of the touch-only deployment.

The owner's iPad report was reproduced on production with trusted compositor
touch input: an upward swipe left `window.scrollY` at **0**. The original HTML
sets `touch-none` on `body` for the game. The new site's ShadowRoot styles could
not override that ancestor restriction. Prior deployment checks tested responsive
screenshots but missed native touch scrolling.

The downstream `ReferenceCanvas` now temporarily sets the body's `touchAction`
to `auto` while marketing, account or Studio screens are mounted and restores
the prior inline value on unmount. No upstream HTML, editor, game layout, overflow
locking, engine, account data or server code changed. It allows normal browser
panning/zoom behavior rather than implementing a JavaScript scroll substitute.
The relevant semantics are specified in
[W3C Pointer Events](https://www.w3.org/TR/pointerevents3/#determining-supported-direct-manipulation-behavior).

## Evidence

- Before fix: production native-touch regression **failed**, expected scroll
  greater than 100 px, observed 0.
- After fix: **7 local browser scenarios passed**, including native touch on
  iPad Pro 11 portrait/landscape and iPhone 13 emulation, actual owned Studio games
  with enough content to scroll, account-screen policy, original editor policy,
  and the existing real account/editor/import/export/results/security scenarios.
- After hot deployment: **2 production browser scenarios passed (17.5s)**,
  including trusted touch swipes on all three emulated devices and the original
  read-only public/account/guest-boundary smoke.
- Extension TypeScript, scoped oxlint and Prettier checks passed. All
  `packages/**` sources remain unchanged. These are Edge Chromium device/touch
  emulation checks on Windows, not a claim of physical iPad/Safari execution.

Reproduction/production check:

```powershell
node extensions/node_modules/@playwright/test/cli.js test --config extensions/site.production.playwright.config.ts
```

Local regression:

```powershell
node extensions/node_modules/@playwright/test/cli.js test --config extensions/site.playwright.config.ts --reporter=list
pnpm exec tsc -p extensions/tsconfig.json --noEmit
pnpm exec oxlint extensions/src/site/web/shared/ReferenceCanvas.tsx extensions/src/site/tests/browser/site.spec.ts extensions/qa/site-touch.ts extensions/qa/site-public-production.spec.ts
```

Logs, device screenshots and deployment/patch manifests are in
`qa-evidence/unified-site-20261110/touch-scroll/`. Baseline release screenshots
were preserved; generated repetitions were restored from the prior commit.

## Exact hot release and preservation

- Fix commit: `db1539974c82389e05c5152f66a95a74ba4c1e39`.
- Future recreate image: **`tadazz:site-touch-db15399`**, immutable ID
  `sha256:99f0d83cb4277c2dd852db4f3a17156a11be476c21fee6220c383ae29cb2991a`.
- Current container retains base image `6b08742f…` with the verified web patch
  in its writable layer; **use the hotfix image above for any future recreate**.
  Restarting the existing container retains its patched files.
- New public entry: `/assets/index-Ce9j7yUX.js`; SHA-256
  `7290224208fa8d31cacc9ef6d189e303d014d081d59fbc39206f2d1f65cfcc81`.
- Only two public artifact files changed: new fingerprinted JS and `index.html`.
  New assets were staged first; the HTML shell was replaced by atomic file move.
  Old fingerprinted assets remain available to existing clients. The separate
  web-only Dockerfile reproduces the release over the exact previous image.
- Live app container ID/start time, socket PID/start ticks, socket bundle hash,
  complete environment/mounts and telephone gateway identity were verified
  unchanged. **No application or Nginx restart/reload**, no room reset, provider
  action, credential change, production account mutation, data migration or Git
  push was performed.
- The original full private production backup remains retained. This hotfix
  writes only `/app/web` and its staging directory; it does not touch the data
  mount. The original shell is also saved privately at
  `/home/ubuntu/tadazz-site-touch-20261110-db15399/index-before.html`.

Rollback, only if needed: atomically restore that original HTML shell after
staging it with readable permissions. Its old assets remain present. For a
container recreate rollback, use the preceding `6b08742f…` release image with
the original runtime configuration. Do not restore customer data for this web
change. Refresh an already-open tab to load the corrected bundle.
