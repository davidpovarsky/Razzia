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
