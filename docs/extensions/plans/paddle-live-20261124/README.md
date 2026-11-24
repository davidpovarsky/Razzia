# Paddle LIVE preparation — 24 November 2026

Base application: `142c178de33737b6fdfff87fefa466fe6652363d`.
This change prepares policy publishing without inventing the seller's legal identity,
commercial prices, refund promises or privacy practices. The game release can proceed
independently of Paddle account approval.

## What is ready in source

- Accessible Terms and conditions, Privacy policy and Refund policy rendering.
- Ordinary router links in the site footer, direct URLs, page titles and canonical URLs.
- Shared platform typography and spacing, readable mobile layout and print styles.
- Plain-text content rendering; no HTML is interpreted from policy content.
- All three documents are published together from one versioned, approved bundle.
- Empty sections, missing seller/approval information, invalid dates and template
  placeholders fail validation and expose no policy pages or legal links.

The public bundle in
`extensions/src/site/web/marketing/legal-policies.public.ts` is currently `null`.
It does not import the draft files. There are no public incomplete policies or
"coming soon" pages. The renderer is ready; actual policy publication remains incomplete.

## Complete the reviewable draft

`policy-bundle.draft.json` contains all three documents as editable sections.
Text in `{{double_braces}}` identifies a fact or decision the owner must provide.
General proposed terms also require owner review. Their presence in this draft does
not mean the business has adopted them.

`owner-inputs.json` is the companion business/commercial input sheet. It contains no
sample prices and is not read by the application. Keep bank details, verification
documents, API keys, client tokens and webhook secrets out of both files and out of Git.

Provide the actual seller identity, applicable business address if needed, supported
customer territories and audience, plan terms, refund/cancellation decisions, data
practices, service commitments and applicable jurisdiction. Do not infer these from
the sandbox account, an individual's profile or a template.

The implementation publishes approved English policy text with `lang="en"` and
`dir="ltr"`, even when the rest of the site is displayed in Hebrew or another language.
It does not machine-translate legal terms. Add another policy language only with
approved translated content and corresponding validator/renderer support.

A parallel editor branch is preparing browser-local unsaved-draft recovery scoped
to account and quiz. It has not been verified as deployed. When that branch ships,
include its actual storage, retention and deletion behavior in the privacy inventory;
no retention period is assumed here.

## Publish the owner's approved bundle

1. Complete every required fact and replace every placeholder in the draft.
2. Review the actual whole text with the owner. Record the real approver and timestamp.
   A validator checks completeness, not legal sufficiency or truth.
3. Set `status` to `approved`, an actual version, effective date and approval timestamp.
4. Put that approved public object in `legal-policies.public.ts` in place of `null`.
   Do not make the application import the draft.
5. Run `validateLegalPolicies(bundle)`; require no errors and all three documents.
   Change the intentionally-unpublished assertion in the focused test to assert the
   completed bundle's approved facts once publication is authorized.
6. Validate the real integration in desktop and phone browsers, including direct links,
   footer navigation, Back, refresh, readable line lengths and the canonical titles.
7. Release through the normal build and deployment gates. Policy changes alter the
   application candidate; do not attach them to an already-running release under its old SHA.

Resulting public URLs after publication:

- `https://tadazz.com/?view=terms`
- `https://tadazz.com/?view=privacy`
- `https://tadazz.com/?view=refunds`

Before a bundle is published these follow the existing unknown-view behavior and
show the home page; they are not usable proof of published policies for Paddle.

## Existing billing and contact work to preserve

Checkout, signed/idempotent webhooks, account licences, credit accounting, public
catalog filtering and sandbox price hiding already exist. Asana records 54 focused
billing server/API checks and six pricing browser cases. Reuse those receipts only
when their relevant code and environment remain equivalent.

Keep `hello@tadazz.com` as the contact recipient and retain the existing email sender.
The actual form test already returned HTTP 202. Do not send another contact test
to validate this policy change.

Paddle LIVE still requires actual account/business verification, approval of
`tadazz.com`, an owner-approved catalog and pilot entitlement migration, live
credentials through the existing secret channel, and the live notification destination.
Do not promote the eight sandbox prices or the experimental amount into commercial prices.

- Default payment link: `https://tadazz.com/manager/checkout`.
- Notification destination: `https://tadazz.com/api/billing/webhooks/paddle`.
- The default payment link can be configured via `PATCH /settings/checkout-url`
  after domain approval, or through the Paddle dashboard.
- Domain review may use a screenshot of approved pricing before the live catalog
  is public. It still needs accessible policies and clear product/deliverable information.

No real transaction, charge, account verification, domain approval, commercial price,
pilot migration or LIVE activation is represented as completed by this change.

## Sources and acceptance

- [Paddle go-live checklist](https://developer.paddle.com/build/go-live-checklist/)
- [Paddle domain review](https://www.paddle.com/help/start/account-verification/what-is-domain-verification)
- [Paddle default payment link](https://developer.paddle.com/build/transactions/default-payment-link/)
- [Paddle task](https://app.asana.com/0/0/1220704776639666)
- [Contact task](https://app.asana.com/0/0/1220720111240379)

See `VALIDATION.md` for the exact focused checks and result commit of this preparation.
