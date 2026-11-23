# Tadazz Paddle sandbox — 9 November 2026

Explicit owner authorization covers sandbox credentials, temporary test prices
and deployment to a separate test environment on the existing server. Live
Paddle, the production application, other worktrees and Asana were not changed.
No paid resource was purchased.

## Environment

- App: <https://billing-sandbox.132.145.25.168.sslip.io/manager>.
- Default payment link: same origin plus `/manager/checkout`.
- Signed notification endpoint: same origin plus `/api/billing/webhooks/paddle`.
- Container: `tadazz-billing-sandbox`, `127.0.0.1:3290 -> 3000`.
- Source: `ef35617456a44ff88460a383e7a294a73300ddbd` on the isolated billing branch.
- Image: `sha256:b1f53680debfb07c0ead707a23bdd11ab470ae802e962c4e560af74a206c0645`.
- Own data: `/var/lib/tadazz-billing-sandbox-20261109/config`.
- Private operation files: `/home/ubuntu/tadazz-billing-sandbox-20261109`.
- Resource caps: one CPU and 1536 MiB. No production data mounts or phone gateway.

Two synthetic accounts were provisioned. The owner's private local access file
is `C:/Users/DAVID/Downloads/Tadazz Sandbox access.txt`. No password is committed.
Registration and email reset/verification endpoints are disabled for this test
host. The application has an intentionally unusable mail key; login works with
the pre-verified accounts. This is not a production email configuration.

## Paddle and configuration

Account `slr_01m6yjts0rjmyc9x9my6sqf3ea` returned `api.environment=sandbox` through
both the API and authenticated official MCP. The installed official Codex plugin
is `paddle@paddle-agent-skills`, version 0.1.0. Its tool catalog is not hot-loaded
into the current chat; a fresh Codex tool session is needed for app visibility.

The functional local MCP entry `tadazz_paddle_sandbox` uses a private-file HTTP
header helper supported by the installed Codex CLI. The helper was verified via
MCP initialize, tool discovery, search and an authenticated `client.apiRoot.get`.
No key is embedded in Codex config. No Live connector was authenticated.

Private Windows files under `C:/Users/DAVID/.codex/.secrets/`:

- `tadazz-paddle-sandbox.env`: sandbox API key, public token, notification secret;
  billing remains disabled in this local configuration.
- `tadazz-paddle-sandbox-catalog.json`: reviewed test IDs and temporary allowances.
- `tadazz-billing-sandbox-runtime.env`: separate deployed runtime configuration;
  billing and accounts are enabled only in the isolated container.
- `tadazz-billing-sandbox-logins.json`: generated synthetic account credentials.

Remote runtime files and databases have restrictive permissions. Secrets never
entered Git, screenshots or task output. The API key expires 6 February 2027 as
shown by the Paddle dashboard; rotate the sandbox key before then and update the
private file and isolated runtime. Do not reuse it for Live.

The API key has product, price, transaction, client-token and notification-setting
read/write, subscription read and customer-portal-session write scopes. It has no
checkout/tax/balance settings scopes; those audit reads returned 403, so settings
were inspected through the dashboard instead. Existing tax/payment methods were
left unchanged. The default payment link was saved and marked Approved there.

Notification destination: `ntfset_01m6ympt64hnz915gqpwzv8879`, active, `traffic_source=all`,
sensitive fields disabled. Subscriptions cover `transaction.completed`, the
created/updated/activated/canceled/paused/resumed/past_due/trialing subscription
events and `adjustment.created`/`adjustment.updated`.

## Test catalog

Both products use `saas`. Each has distinct active prices for ILS, GBP, USD and
EUR, amount `1000` minor units, quantity exactly one, no trial. These are **10-unit
test prices**, not approved commercial pricing or currency conversion.

| Local test plan   | Paddle product                   | Test allowance                                           |
| ----------------- | -------------------------------- | -------------------------------------------------------- |
| `sandbox-single`  | `pro_01m6ym5a60j06jr95b5fxe9ke2` | 1 game, 20 participants, 0 phone minutes                 |
| `sandbox-monthly` | `pro_01m6ym5cnnz33bhkk83x38wphm` | 5 games per paid month, 20 participants, 0 phone minutes |

The allowance numbers are local test fixtures, not commercial decisions. Full
price IDs and verification results are in `qa-evidence/billing-sandbox-20261109`.

## Verification

- 32/32 focused billing contract/service tests passed in a fresh run.
- 8/8 real Paddle price reads passed using the application's actual `PaddleClient`
  and `billingCatalogSchema`, not a mock transport.
- Actual browser Paddle.js one-time GBP and monthly USD checkouts completed using
  Paddle's public test card. No real card or funds were used.
- Both signed `transaction.completed` events were fulfilled. Subscription created
  and activated events set the monthly subscription Active. Exactly two purchases
  and two grants resulted: one single game and five monthly games.
- Authenticated checkout completion works for its owner; the other test account
  receives 404, has zero grants and cannot create that customer's portal session.
- The owner's portal session points to `sandbox-customer-portal.paddle.com`.
- Canonical reconciliation returned 200 without creating duplicate grants.
- Public health, checkout route and billing config returned 200. Anonymous billing
  reads and unsigned webhook requests returned 401.
- Restarted only the sandbox container; completed intents, purchases, grants and
  event rows persisted. Browser reload retained the session and allowance.
- Production container ID/start time stayed unchanged; production health returned 200. The Caddy change preserved existing configuration bytes and added one host.

Evidence includes screenshots, sanitized provider/HTTP results, deployment and
persistence records, and the compressed focused test report. Earlier complete
suite/build/browser reports remain historical evidence in `billing-20261108`;
this configuration-only deployment does not claim a fresh complete suite pass.

No real recurring renewal, refund, chargeback or PSTN call was performed in this
sandbox run. Their existing automated checks do not establish live provider or
carrier behavior. Live onboarding, approved commercial terms and production
activation remain separate work.

## Rollback and maintenance

Disable this sandbox notification destination before taking its endpoint offline.
Stop only `tadazz-billing-sandbox`; retain its config directory for evidence and
recovery. Remove only the Caddy block marked
`isolated-billing-sandbox-20261109`, preserving any later concurrent additions,
then validate/reload Caddy. Do not restore the entire historical backup over newer
configuration. No main container, production data directory or phone route is part
of this rollback.
