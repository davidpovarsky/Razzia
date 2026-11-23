# Billing readiness and pricing follow-up — 19 November 2026

## What is connected

Paddle **sandbox** is connected. The earlier implementation recorded two real sandbox checkouts on 9 November, followed by signed webhook fulfillment. Those historical results describe the sandbox and do not establish that LIVE checkout is active.

The [fresh provider audit](../provider-readiness.json), observed at **13:25 UTC on 19 November**, used read-only Paddle sandbox API requests. All eight stored test prices are active and match their configured currency and amount. The four single-purchase prices have no recurring cycle; the four subscription prices recur monthly. The existing sandbox notification destination is active with the expected eleven transaction, subscription and adjustment event types. This audit did not create a transaction, make a payment, change a price or enable production billing.

The temporary prices of **10 currency units** in ILS, GBP, USD and EUR were approved for sandbox tests. They are not approved commercial prices. The available evidence does not establish LIVE credentials, LIVE checkout-domain approval or final commercial allowances. The production public billing endpoint was observed with billing disabled before this follow-up. Deployment of application code alone does not change that runtime setting.

## Implemented changes

The public pricing page now reads the application's actual billing catalog. The previous hardcoded Standard/Pro options and illustrative capacity estimator were removed. The page handles loading, temporary failure with retry, and a genuine unavailable state. When configured LIVE offers exist, it shows their exact configured prices, available currencies, purchase or monthly cadence, game credits, participant allowance and telephone-minute allowance.

The public call to action leads to **Account & licences**, where the existing authenticated purchase flow selects the plan and completes checkout. It does not claim that a public card selection has been preserved and does not create transactions while browsing.

`GET /api/billing/catalog` returns an explicit public projection: readiness, environment, available currencies and public single/monthly plans. Provider price IDs, API keys, client tokens, webhook secrets, account identity, grants and subscriptions are absent. Upgrade plans remain in the account/game context where ownership can be checked. Sandbox configurations return no public offers, even when sandbox account checkout is ready. Both public billing endpoints use `Cache-Control: no-store`.

Readiness now requires a nonempty API key, webhook secret, nonempty catalog and a valid client token for the selected environment. A missing, malformed or wrong-environment client token no longer makes the account snapshot or public config claim that checkout is configured. **Configured is a local configuration check**, not a claim that Paddle has accepted the business, domain or credentials. Existing checkout still verifies the provider price's active status, exact amount/currency and recurrence before creating a transaction.

Authentication, tenant ownership, signed-webhook fulfillment, quota enforcement and payment idempotency are retained. No LIVE setting, customer grant or commercial price was changed by this work.

## Verification

- **45/45** billing contract/server tests passed, including twelve new readiness/public-projection cases. [Initial focused execution](focused-test-execution.json).
- **9/9** socket/API tests passed, including four new anonymous public-catalog cases and the existing authenticated billing suite. The final rerun after the typed stage-accessor correction also passed, with **zero warnings/errors in typed lint across all fourteen billing source/test/QA files**. [Final typed verification](focused-typed-final.json).
- The credit-consumption fixture now follows the actual presentation sequence: standby → opening → lobby → running. It verifies one credit remains through opening and lobby, and exactly one credit is consumed on the actual game start. This was a correction to the test fixture; the presentation implementation did not require a billing change.
- **6/6 pricing browser cases passed** at 14:00 UTC: billing disabled, sandbox offers hidden, missing client token, exact LIVE-mode synthetic catalog/currency change, Hebrew RTL at 390 px, and a 503 followed by a successful retry. There were no page errors, unexpected console errors or horizontal overflows; Rubik loaded in every case. The intentional 503 is retained in the retry evidence. [Browser receipt](browser-final/receipt.json), [owned-process cleanup](browser-final/cleanup.json).
- **9/9 shared site smoke cases passed** on the same frontend with the corrected font fixture, covering exact-game launch, unavailable selection, retained request IDs and retry/history behavior, contact submission states, and Hebrew contact layout. Those site HTTP responses are synthetic; this is not proof of real mail delivery. [Shared site receipt](../site-browser-with-fonts/receipt.json).
- The pricing browser fixture uses the actual site and billing HTTP routes with fresh synthetic configuration. It blocks outgoing provider/email requests and never creates customer accounts or transactions. Synthetic prices shown in test screenshots are test data only. Desktop pricing, Hebrew mobile pricing and Hebrew mobile contact screenshots were visually inspected after the run.

The first browser run's functional, currency, RTL and bounded-layout assertions passed, but its strict console gate failed on missing synthetic branding and the physical Rubik dependency directory falling outside Vite's development file allow list. That failed receipt is retained in `browser/`. The isolated QA configuration supplies an empty branding document and explicitly allows only the repository, its dependency store and the Rubik package directory. It does not alter production file access or suppress resource errors.

## What the owner must provide or confirm for LIVE activation

1. **LIVE Paddle account status.** Sign into the LIVE seller dashboard and confirm the Tadazz business/product is approved for LIVE payment processing. Sandbox acceptance, a sandbox API key or a sandbox checkout does not establish this. Complete any outstanding business, identity or payout setup requested by Paddle.
2. **Checkout website.** Confirm `tadazz.com` is approved for checkout, then configure the default payment link as `https://tadazz.com/manager/checkout`. This application route already handles Paddle transaction links and checks the signed-in account owns the stored checkout before opening it.
3. **Commercial plan table.** Supply the plans to sell: one-time and/or monthly, price in each supported currency, game starts per purchase or paid month, participants per game and telephone minutes per game. State which currencies should be offered; there is no need to invent prices for unsupported currencies. Also decide whether to offer game-specific upgrades. The software will use those exact approved values; it will not promote the temporary sandbox prices.
4. **Existing pilot allowance.** Confirm the allowance promised to each existing pilot account and whether it is permanent, expires on a date, or becomes a paid plan. Billing enforcement checks available grants when a game is reserved or started. These accounts need their agreed grants migrated before the production flag is enabled; otherwise existing users could be prevented from opening a new show. This change does not silently issue or revoke grants.
5. **LIVE credentials and notification destination.** Create or provide the LIVE server API key, LIVE client-side token and LIVE notification endpoint secret through the project's secure runtime-secret mechanism. Do not place them in a chat message, Git or screenshots. The API key must allow the operations the existing integration uses: reading prices/subscriptions/transactions, creating transactions and customer portal sessions. The client token must belong to LIVE. Configure the LIVE notification destination as `https://tadazz.com/api/billing/webhooks/paddle` and retain its generated secret.

The notification destination must subscribe to:

- `transaction.completed`
- `subscription.created`, `subscription.activated`, `subscription.updated`
- `subscription.canceled`, `subscription.past_due`, `subscription.paused`
- `subscription.resumed`, `subscription.trialing`
- `adjustment.created`, `adjustment.updated`

No LIVE credentials were found in the authorized known configuration inspected for this work. That is an access/configuration finding, not proof that the owner has no LIVE Paddle account.

## Remaining implementation after those inputs are available

The runtime mapping is:

| Setting                       | Required LIVE value or purpose                                                |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `TADAZZ_ACCOUNTS_ENABLED`     | `true`; retain verified existing accounts                                     |
| `PADDLE_ENVIRONMENT`          | `live`                                                                        |
| `PADDLE_API_KEY`              | LIVE server API key, stored privately                                         |
| `PADDLE_CLIENT_TOKEN`         | LIVE client-side token for that environment                                   |
| `PADDLE_WEBHOOK_SECRET`       | Secret of the LIVE notification destination                                   |
| `TADAZZ_BILLING_CATALOG_PATH` | Absolute path of the reviewed LIVE plan catalog                               |
| `TADAZZ_BILLING_ENABLED`      | Keep `false` while preparing; set `true` after the checks and pilot migration |
| `TADAZZ_BILLING_GRACE_HOURS`  | Existing past-due policy; defaults to 72 hours and allows 0–168               |

The catalog is a validated array of plans. Each plan has `id`, positive `version`, `kind` (`single`, `monthly` or `upgrade`), `games`, `participants`, `phoneMinutes`, and distinct price entries with `currency`, real LIVE `priceId` and integer `amountMinor`. ILS, GBP, USD and EUR use two decimal places. Plan IDs, provider price IDs and currencies must be unique within their respective validation scope. Monthly prices must have a one-month billing cycle. A game upgrade is separate from an additional game credit.

Once the owner supplies the business decisions and LIVE access, the remaining work is concrete: provision the approved LIVE product/price catalog, verify every price through read-only Paddle calls, install the LIVE runtime values, migrate the agreed pilot grants, restart with the reviewed configuration, and verify the public catalog/account checkout and signed notification fulfillment. Any live checkout/payment used for final acceptance must use the approved commercial plan and an explicitly designated test customer. Do not label LIVE billing operational merely because a local `configured` field is true.

## Official integration references

- [Sandbox and LIVE separation](https://developer.paddle.com/sdks/sandbox/)
- [Client-side tokens](https://developer.paddle.com/paddle-js/about/client-side-tokens/)
- [Default payment link and approved checkout domain](https://developer.paddle.com/build/transactions/default-payment-link/)
- [Checkout settings API](https://developer.paddle.com/api-reference/settings/update-checkout-url/)
- [Paddle.js environment selection](https://developer.paddle.com/paddle-js/methods/paddle-environment-set/)
