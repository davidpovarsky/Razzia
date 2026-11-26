# Live pricing preparation — 27 November 2026

Base: `70a117c83780d90e56d1a108ddf8859c3773aee3` on the isolated
`codex/tadazz-payments-live-20261126` branch. No upstream package or editor changes.

The owner replaced the earlier currency-conversion markup with GBP 100 for one
game with 50 participants. The corresponding one-game prices are GBP 72, 100,
128 and 200 for 20, 50, 100 and 250 participants. All four existing Paddle Live
prices were updated and read back. No fixed-term products were created.

## Scoped checks

- Focused Vitest run on the isolated Oracle development worktree: 48 passed,
  zero failed, seven test files. Coverage includes existing billing behavior and
  explicit public pricing with checkout disabled. Subsequent backend edits were
  whitespace-only formatting in contracts.ts and public-catalog.test.ts.
- Direct installed Prettier checks passed for seven modified source/helper files.
- Direct installed oxlint: zero warnings and errors, 233 rules over seven files.
- The actual Pricing component was exercised in an isolated Vite preview using
  a synthetic public catalog with the four owner-approved prices. Desktop and
  390px viewport showed all four offers, a closed-purchases notice and account
  links. Each narrow card stayed within the viewport. The temporary viewport was
  reset. This does not constitute production checkout or full-site acceptance.
- Local `git diff --check` passed.

Private receipts and screenshots are stored outside Git under the owner's Codex
visualization directory. No credentials, private seller address, customer data or
webhook secrets are included in this plan.

## Remaining activation work

The owner approved the complete three-document bundle and public seller details;
seven focused policy checks passed. The runtime key was created following explicit
approval and its live authentication and five scopes were verified. Five synthetic
deployment-environment tests passed. The notification destination exists but is inactive.

Publish through the normal release gates, complete Paddle business/domain review, install the live
runtime key and notification secret through the private configuration channel, and
resolve pilot entitlements and phone allowances before enabling billing. Production
billing remains disabled. No live payment or deployment has been performed here.

The existing runtime supports one-game and monthly plans. A genuine fixed-term
unlimited-use licence requires its own entitlement implementation before sale;
earlier provisional six/twelve-month prices are superseded.
