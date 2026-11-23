# Separate Native Save consent UI — 15 Nov 2026

E's separate client/page are ready for selective source integration. Actual B/F
consumer + mounted host/browser/native Save acceptance remains OPEN. This page
records exact-revision approval only. It never allocates a game, calls save_game,
returns a native editor URL, creates an OAuth grant or publishes a renderer pin.

## Canonical dependency and source boundary

The only F browser dependencies are its unchanged committed pure DTO files from
5cba04f399d10c597f4cd6dc1cbfbb2b77041d58:

- `mcp-app/contracts/native-save.ts`: ce672e956524b2fe7487d778a1a1a88abf6c45b55f99bd255db4bf0e139b3b8c.
- `mcp-app/contracts/schemas.ts`: 8d2ab36da1292c178e0a974e9c331eed05e59adb97f530df11ae3ad3de812656.

E consumes their canonical relative paths; neither F product file was added or
edited in E's repository. Isolated QA uses read-only canonical-path aliases of
exact Git-verified foreign inputs, separately identified by producer commit/SHA.
No server/auth/key/native-creation implementation enters the browser bundle.
Do not substitute an E-owned DTO or import F's oauth-native-save server module.
Frozen0.1.0 schemas, backend authorization and B's C1 port remain their authorities.

`components/native-save-consent/client.ts` exports
`createNativeSaveConsentClient({issuerBasePath,accountId,getNativeToken,request?})`.
Its methods are inspect(requestId,signal?), approve(requestId,inspection,signal?)
and invalidate(). The issuer base is existing trusted same-origin OAuth base;
machine paths append `/native-save/inspect` and `/native-save/approve`.

Inspect uses F's strict input/envelope/DTO, validates actual native account and
request ID, and checks SHA-256 of the exact authoredShowJson UTF-8 bytes. It freezes
all snapshot data and binds only a genuine live pending inspection/proof to the
exact native token, current generation and request. A new inspect supersedes prior
proofs. Approve consumes authority before I/O and accepts only the exact matching
request/draft/revision/future bounded expiry in F's approved response. Clones,
foreign instances, stale sessions/generations, nonpending states, contradictory
data and native-save results disguised as approval are rejected. Unknown outcomes
never cause a retry. Failure consent URLs are never followed.

Native bearer authority stays on same-origin POST JSON with no-store, redirect
error and no-referrer. No proof, snapshot, native token or grant is put in a query,
hash, pending-ticket store or MCP widget. Existing scope-consent client remains
byte-identical9f3cda2cbaacf9191eab30f30da34a9f564491a0f39e25bd00027600d6aac07b.
Native Save's final formatted client SHA is
560c2828bb7fb70368c776602e0b63acefa36596bdcfd2f3eac7e33dc35efbed.

## Page and actual root seam

`NativeSaveConsentPage` accepts actual verified native Account plus trusted
issuerBasePath and pathname/search/hash. It requires the exact54-ID pathname,
actual manager token/account identity, live profile before inspection and again
before approval, unframed execution, and actual HEAD no-referrer/no-store plus
frame-ancestors none. It displays the account/client/draft/revision/digest, the
complete DTO summary and untouched authoredShowJson as escaped plaintext. The
snapshot is never parsed into HTML, normalized, pretty-printed or rewritten.
Rubik/TDS Card/Button/PlatformScope and all eight existing locales are reused.

Only a trusted native button event starts approval; its synchronous controller
reference prevents double submission. Cancellation aborts inspection and discards
local proof. There is no backend deny endpoint, so cancellation does not claim a
persisted server decline. Pending/approved expiry and native storage/session
replacement invalidate proof and clear the private snapshot, including the native
session module's in-memory-token case. Existing approved/publishing/saved/expired
states are readonly. Approval tells the human to return to the connected app;
the model must retry its original save_game/key through the actual backend.

Studio adds only a lazy native-save child after its existing real profile query.
Root owns the still-required actual nested route and policy:

1. Register `/studio/native-save-consent/$consentRequestId` to existing Studio with
   the real native auth/profile guard. The page validates exactly
   `/studio/native-save-consent/[A-Za-z0-9_-]{54}` with no extra slash/query/hash.
2. Add only that exact pathname pattern to safeReturnTo after its existing
   query/hash/external rejection. Keep pathname-only login returnTo. Reject extra
   query/hash at the actual native-save route guard before stripping them during
   an unauthenticated redirect. A path ID alone supplies no authority.
3. Apply additive actual HTML **and HEAD** frame-ancestor denial, DENY,
   no-referrer and no-store policies to that exact route. Preserve existing CSP.
   Header constants already exist in site/oauth-consent-headers.ts; E did not edit
   bootstrap, the root route table, safeReturnTo, backend issuer or host headers.
4. Configure F's separate nativeSave option with B's actual operations port and
   the real same-origin consentPageUrl only through the approved root composition.
   Missing page policy/issuer/config stays unavailable. Defaults remain off.

## Actual executed evidence, with limits

NativeSave22: focused TypeScript exit0; client10/10 tests; actual React component
browser30/30 Chromium/WebKit; UI/server builds0; actual closure/physical receipt0.
Cases cover all8 locales, exact escaped snapshot/digest/revision, phone390 layout,
programmatic-click denial then one real click, cancellation/loading late result,
real cross-tab token replacement, expiry, readonly statuses, query rejection and
missing actual HEAD no-store. The test also checks no page/console/CSP errors and
host jitless=false restored. I inspected the actual WebKit JA390 screenshot:
readable labels, wrapped IDs/JSON and both controls within the scrolling page.

The fixture has a signed **synthetic** native session and an explicit DTO emulator.
It imports no B native port, F real issuer or allocator. Its approval is not a real
native Save, root route/login, dev StrictMode replay, physical device or G proof.
The standalone production fixture's StrictMode wrapper is not dev effect replay.

Browser graph2150 modules,2149 actual physical inputs; only the two exact F DTO
files appear under mcp-app, forbidden modules empty. Actual compiled UI JS:
ff1983170695ba15e54ff0cc0cadbaf36548f52ed0fb6ab1d10b84975e6bb434
(455196B), CSS5e3dfc7b75349c1938d05a9e1282407813147e4a7f5790f051ac8e729431b410
(2190B). Full source/dependency/font/output hashes are in native-save-build-receipt.
This is not a new renderer ABI or pin, nor a font/glyph certification.

Final formatting of12 own files follows the actual executed snapshot. Every
Vite8.3.4/Oxc emitted JS body is byte-identical before/after, and Babel7.29.9
executable ASTs match. Three raw TS/JSX AST comparisons differ only in type/JSX
formatting; they are explicitly retained rather than labeled source-AST-equal.
See native-save-format-bridge.json and authoritative direct-child verifierexit0.
F DTO files were never formatted. Actual TS0 is the executed pre-format snapshot;
no separate final root/Studio type pass is claimed here.

Raw archive5fc322c0ce30f0f5e0630534aab47f9d27f5c21f1a6e8a30a5f5fd377dde6e4e
has55 original+supplemental files validated before exited0/PID0/noOOM. Raw binaries
and screenshots stay local; curated text/JSON/log receipts are committed separately.
Cumulative remote owned blocks93904896B within90MiB94371840B, remaining466944B;
E compute released. RAM output was streamed before stopping. No evidence, sources,
caches or peer services were deleted. Existing manager-pool grant and resource
admission are recorded in HQ; no new install/root graph reconstruction occurred.

Positive Native Save, actual B/F+page+host proof, root development route/login,
native reopen/preview, renderer pins and G remain unavailable/OPEN. Do not mark
SB08/SB09/SB10 complete based on this scoped client/page packet.
