# First-party consent UI source handoff

The actual authenticated Studio child is `/studio/oauth-consent`, reached through
the existing `/studio/$section` route after the native profile check. It reads
F's real `oauth_request` query parameter and displays the native profile, exact
inspected client ID and every requested scope. This is separate from native-save
consent; no native-save adapter or permission is created.

The trusted build setting `VITE_TADAZZ_OAUTH_ISSUER_PATH` must contain the actual
same-origin issuer base path. There is no default issuer or query-selected server.
The UI sends `{ticket}` to `/inspect`, then only an explicit trusted native click
sends `{ticket, decision: "allow", proof}` to `/approve`. It accepts F's actual
`{redirectUrl, grantId}` reply and navigates to that exact HTTPS redirect string.
It never forwards the native manager token to the MCP host or widget.

Proofs are bound to the returned inspect object, ticket and current native token.
Ticket/account/session changes, expiry and cancellation invalidate them. A single
in-flight approval consumes its proof before awaiting IO. Canceled or superseded
requests cannot overwrite a newer state. The page has all eight existing i18next
locales and uses existing platform components and Rubik conventions.

## Root integration boundary

The root host owns HTTPS, issuer/client registration, persistent keys and the
actual HTML/HEAD response. It must apply `site/oauth-consent-headers.ts` to that
exact route: no-referrer, frame-ancestors 'none', DENY and no-store. Merge the
frame-ancestors directive with the existing root CSP; do not remove other policy.
The page checks the real HEAD policy and refuses to inspect if it is missing or
if the page is framed. The configured F consentPageUrl must be the actual mounted
same-origin HTTPS route, not a fixture URL. Missing configuration fails closed.

The Studio hook adds only the lazy child and current search string. It does not
replace existing account, Studio or Theme Builder behavior. Root's actual accepted
`/builder` mount remains manager-owned and is not recreated here. Preserve the
manager's `./server/startup-owner-snapshot` package export when integrating E's
separate future media leaf; never replace the whole package manifest.

## Executed evidence

E followup14: focused TypeScript exit0; four source files42 tests passed; actual
React consent browser26/26 passed across Chromium/WebKit, covering all eight
locales, no automatic approval, ignored programmatic click, exact callback after
native click, cancellation while inspecting, expiry, native-session rotation and
missing real page headers. Raw archive SHA256:
`fe61c26096de7cdfa338b068e1370dd8aacc090f492990386919eb7827efaf08`.
Its exact executed inputs and final AST-equal formatting bridge are retained in
`followup14-evidence` and `followup14-format-bridge.json`.

These browser tests use a signed synthetic manager session and an explicitly
emulated inspect/approve backend. They do not establish a real F issuer browser
connection. Manager separately reports F63e1094/ad702a8: three actual first-party
tests and focused TypeScript0 against the exact `createOAuthConsentClient` source
SHA256 `9f3cda2cbaacf9191eab30f30da34a9f564491a0f39e25bd00027600d6aac07b`.
That is a separate real-backend client proof, not an E-run browser/TLS receipt.

Actual browser click through the mounted real issuer, ChatGPT/Claude installation,
production activation and native-save consent remain NOT RUN/unavailable here.
SB08/SB09/SB10 remain OPEN. Native preview/WebKit evidence is independently scoped;
the consent successes do not establish executable renderer pins or G readiness.

## Pending login handoff (new, route execution still pending)

`components/oauth-consent/login-handoff.ts` exposes a lazy
`browserConsentLoginHandoff()` using one sessionStorage record: only a bounded
base64url opaque ticket and a local five-minute `expiresAt`. No native token,
proof, callback, grant, state, scopes or client identity is stored. The real issuer
must still decrypt/validate the ticket and its own expiry. Identical capture never
extends the deadline; a new request replaces the old one; malformed/expired data
is cleared. `resume` is non-destructive so repeated guards/StrictMode do not consume
the ticket before a URL and native profile are established. Authenticated page
acknowledgement only clears the matching ticket; stale mounts cannot erase a newer
replacement. Explicit cancel/session invalidation clears pending state.

Root integration contract (root files remain manager-owned):

1. In actual Studio `beforeLoad`, if unauthenticated call
   `handoff.capture(location)` **before** the existing pathname-only login redirect.
   Do not put a ticket in `returnTo` or change `safeReturnTo`. The exact query-free
   `/studio/oauth-consent` allowlist addition already made by the manager is retained.
2. In that same authenticated guard, `const resumed = handoff.resume(location)`;
   if non-null redirect only to `/studio/oauth-consent`, `search: resumed`,
   `replace:true`, `throw:true`. Existing query-bearing consent URLs bypass resume.
   Pass `location.hash` as well as pathname/searchStr. This guard does not approve.
3. Attach one actual bootstrap `storage` listener: if `event.key === "token"` or
   `event.key === null`, clear the pending handoff. Cross-tab native session
   replacement is unexpected, while the intentional same-tab AccountGateway
   `setToken` followed immediately by navigation emits no storage event. Explicit
   logout/abandoned consent login must also call `clear()`. Do not store a session
   fingerprint in this record. Preserve existing session/query/socket semantics.
4. E's Studio401 effect now captures the bounded request before its existing
   pathname-only login redirect. The consent page acknowledges only after Studio's
   actual native profile and local matching native session are present, and clears
   on cancel/expiry/session change. Root does not need to modify AccountGateway's
   native login success navigation or broaden its return URL handling.

`site/tests/browser/oauth-login.spec.ts` is a new **actual site route** test packet,
not the isolated consent component fixture. It uses the existing real isolated
account register/verify/login API, actual AccountGateway form, actual bootstrap's
React StrictMode and actual Studio profile/consent mount. Four cases cover login
reload/repeated guards and cancel/no replay, expiry, replacement, and real cross-tab
native storage change. Its opaque synthetic ticket is intentionally not valid at
the issuer; it never approves. It proves login transport only, not real issuer,
page headers, TLS or full consent acceptance. Execution is pending root wiring and
the manager's retained root test surface; do not claim these four tests passed.

Helper6 tests executed PASS in native16. Exact two executed source SHAs,
AST-equal final formatting bridge and actual log/exit are retained in native16-evidence.
Full native16 exit1 is preserved (four separate V2 TypeScript nullability errors);
V2 browser4/4 passed. The subsequent page acknowledgement ordering change and
Studio401 capture/hash hook await actual root route execution; they are not covered
by the six helper unit tests. Existing client9f3cda2c remains byte-identical.

Actual StrictMode route execution must use the site Vite DEVELOPMENT server.
The existing site-preview-server.mjs builds production, where StrictMode does not
replay effects. The first actual-route case now requires two actual initial
AccountGateway auth/mode requests before any reload, observing its initial effect
replay instead of assuming it from the JSX wrapper. This is an execution condition,
not a new router or a production deployment.

Consent19 follow-up: direct token/null storage events revoke the inspected proof
even while native session.ts retains its old in-memory token. The one new actual
cross-tab browser regression passed in Chromium and WebKit (2/2); focused TC0.
Raw archive f08bbf638ceca5e9584cdcdc665bfcb6d47460550523ab2ffbeb8185be2b5841,
34files validated before exited0/PID0/noOOM. Test-only final formatting has a
same-AST bridge. Studio explicit logout now clears pending state before the
existing native clearToken in its unchanged finally block. The isolated component
proof does not replace the actual root development StrictMode route4 or real issuer
browser acceptance. Existing createOAuthConsentClient stays byte-identical9f3cda2c.
