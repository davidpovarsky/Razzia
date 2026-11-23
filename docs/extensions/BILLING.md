# Tadazz billing

Implementation is opt-in and defaults to **OFF**. It reuses the existing verified
account identity; it does not replace authentication or the game engine. The
owner confirmed Paddle's acceptance of this product on 8 November 2026.

## Modules

- `extensions/src/core/billing`: versioned catalog and public account DTOs.
- `extensions/src/server/billing`: SQLite, purchases/grants, quotas, metering,
  checkout, verified provider inbox and reconciliation, each in its own module.
- `extensions/src/editor/billing`: account UI with injected original Razzia
  primitives and translations. It has no dependency on socket internals.
- `packages/socket/src/{services/billing.ts,api/extensions/billing-routes.ts}`:
  configuration, account auth and minimal host adapters.
- `packages/web/src/features/manager/billing`: existing session, React Query,
  original Select/Button/Card adapters and lazy Paddle.js checkout.

No card information is received or stored. The server catalog determines prices;
the browser cannot specify amounts, grant recipients or price IDs. Checkout
callbacks only refresh UI. A signed server notification or authenticated canonical
Paddle API reconciliation is required for fulfillment.

## Configure a Paddle sandbox

The owner's Tadazz Sandbox account is connected and an isolated server was
deployed with explicit authorization on 9 November 2026. Two real sandbox
checkouts (single GBP and monthly USD), signed provider webhooks, entitlements,
portal access, tenant isolation, reconciliation and restart persistence passed.
See [sandbox deployment and evidence](BILLING_SANDBOX_20261109.md).

The owner approved temporary test prices of 10 units in each of ILS, GBP, USD
and EUR, without a trial. Commercial prices and allowances remain undecided.
Existing automated fixtures are still synthetic; the new sandbox evidence is
recorded separately from those fixtures. The following steps describe setup for
another environment, not changes to the active production service.

1. Create a sandbox account at <https://sandbox-vendors.paddle.com/>.
2. Create one-time and/or monthly products and prices. For a game-only upgrade,
   create a separate one-time price; no extra game credit is granted by upgrades.
3. Provide an explicit price per supported currency: ILS, GBP, USD, EUR. No
   exchange rate or commercial amount is invented by this implementation.
4. Set the default payment link to your staging origin plus `/manager/checkout`.
   This route understands `_ptxn` and validates transaction ownership on the server
   before opening checkout. Configure the allowed checkout domain in Paddle.
5. Create a client-side token and a server API key with transactions read/write,
   prices read, subscriptions read and customer portal sessions write permissions.
6. Configure the sandbox notification destination:
   `https://<staging-origin>/api/billing/webhooks/paddle`.
   Subscribe to `transaction.completed`, subscription lifecycle notifications and
   `adjustment.created`/`adjustment.updated`. Set its endpoint secret locally.
7. Copy `extensions/fixtures/billing/environment.example` into your ignored
   runtime environment; keep secrets outside Git. Enable accounts first.
8. Create the server catalog JSON and set its absolute path. Keep it outside Git
   for operational prices, or review and commit a deliberately public catalog.

`extensions/fixtures/billing/catalog.empty.json` is valid and publishes no plans.
The catalog is an array; each plan has:

| Field           | Meaning                                                  |
| --------------- | -------------------------------------------------------- |
| `id`, `version` | Stable lowercase plan ID and positive immutable revision |
| `kind`          | `single`, `monthly` or `upgrade`                         |
| `games`         | Game starts per purchase or paid monthly period          |
| `participants`  | Unique participants per game                             |
| `phoneMinutes`  | Server-observed telephone minutes per game               |
| `prices`        | Distinct `{currency, priceId, amountMinor}` entries      |

All four selected currencies use two decimal places. `amountMinor` is a positive
integer. Actual Paddle price currency, amount, active status and monthly interval
are verified before creating checkout. Final tax is presented by Paddle checkout.
Duplicate plan IDs, duplicate price IDs and duplicate currencies are rejected.
Restart the isolated server to load a reviewed catalog revision.

Live and sandbox keys, prices and endpoint secrets are separate. Live activation
requires a separate deployment decision and a verified seller/domain. Nothing in
the implementation changes the production configuration automatically.

## Accounting behavior

- SQLite file: `<CONFIG_PATH>/tadazz-billing.sqlite` with WAL and transactional
  mutations; private file permissions on Unix. Back up with SQLite's online backup
  facility, or a stopped service, rather than copying a live main file alone.
- Lobby reservations do not spend game credits. A successful start spends one;
  repeated start, opening animations, previous/replay and reconnect do not spend
  another. A lobby without players does not consume a credit.
- A game captures its limits at start. Subsequent expiry, cancellation, outage or
  refund does not terminate it. New games require an available grant.
- New identities are admitted atomically at the shared web/phone limit. Reconnect
  uses the existing roster/client identity. This counts logical identities, not
  unverifiable physical people using multiple anonymous browser sessions.
- Monthly entitlements follow paid billing periods, not calendar months. Paid
  upgrades in overlapping periods increase the same allowance without resetting
  games already used. Renewal establishes a new period. Scheduled cancellation
  preserves access until it takes effect. Past-due grace defaults to 72 hours,
  bounded to the last paid period; configurable from zero to 168 hours.
- Full refunds/chargebacks revoke that purchase's future allowance. Partial
  refunds leave the allowance intact. Refunding one upgrade does not erase the
  original period purchase. Active games retain their captured limits.
- Telephone minutes are a separate meter based on server-observed call polls and
  hangups, with cumulative imports available for a future trusted provider
  adapter. They are not a certified carrier invoice. A used-up allowance prevents
  new calls; ongoing calls continue until hangup. Poll retries do not double bill,
  and a missing hangup cannot accumulate unobserved time after the last poll.

## Recovery and security

Paddle signatures use the exact raw body, HMAC-SHA256, constant-time comparison
and a five-second timestamp window. Only whitelisted identifiers and provisioning
fields enter the durable inbox; customer addresses/emails/card payloads are
discarded. Event IDs deduplicate intake; purchase IDs deduplicate effects.
Effects and processed markers commit together. Out-of-order events are retried;
invalid provisioning payloads are quarantined (`processed=-1`). New events are not
starved by older unresolvable ones.

An intent is saved before the provider call. An uncertain response cannot produce
another transaction under the same request ID. Signed Paddle `api` origin plus a
known unbound intent can recover the lost response; arbitrary web checkout custom
data cannot bind another transaction. Authenticated Refresh reconciles canonical
transactions and subscription state. Background maintenance retries the inbox
every ten seconds and reconciles one known customer each minute in round-robin
order. Provider requests never run inside the game timer/answer loop.

## API

Public feature discovery: `GET /api/billing/config`.
Signed provider endpoint: `POST /api/billing/webhooks/paddle`.
All remaining endpoints require the existing verified manager session:

- `GET /api/billing`: own plans, available grants, subscriptions and game usage.
- `POST /api/billing/checkout`: `{planId,currency,requestId,gameId?}`.
- `GET /api/billing/checkout/:transactionId`: own saved checkout only.
- `POST /api/billing/portal`: fresh own customer portal link; never cached.
- `POST /api/billing/sync`: canonical reconciliation, rate limited.

Tenant identity comes only from verified claims. Billing information never enters
the player/projector state. Existing tenants need an explicitly provisioned plan
before enabling billing enforcement; do not turn it on for the private pilot
without migrating its agreed allowance.

## Original UI fidelity

Account UI reuses Razzia `Button`, `Card`, Radix-backed `Select`, the manager card,
language switcher and existing layout. It inherits Rubik Variable, active branding
and Tailwind theme tokens. No new palette, stylesheet, UI kit or font is added.
All labels/states/errors cover en/fr/de/es/it/ja/tr/vi; billing translations live
separately from the concurrent theme translations. Playwright screenshots render
the actual app, rather than standalone HTML fixtures.

## Verification

Focused suites:
`pnpm --filter @razzia/extensions exec vitest run src/server/billing src/core/billing`
and `pnpm exec vitest run packages/socket/src/api/billing.test.ts`.
Browser suite after `pnpm build`:
`pnpm --filter @razzia/e2e exec playwright test --config playwright.billing.config.ts`.
It uses fresh synthetic accounts/SQLite, ports 3190/3191 and headless browsers.
Only external Paddle is simulated; account, billing and game APIs run real code.

Before calling the payment integration operational, complete an actual Paddle
sandbox purchase/renewal/cancellation/refund and verify signed live deliveries
with the configured products, keys and webhook destination. This last check is
pending the owner's account and chosen prices.

Official integration references: [signatures](https://developer.paddle.com/webhooks/about/signature-verification/),
[transactions](https://developer.paddle.com/api-reference/transactions/create-transaction/),
[portal](https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session/),
[currencies](https://developer.paddle.com/api-reference/currencies/list-currencies/).
