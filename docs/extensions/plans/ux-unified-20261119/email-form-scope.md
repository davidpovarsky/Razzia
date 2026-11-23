# Email form repair scope

## Canonical components

AccountGateway now uses the shared TDS Input for email address, password/new password and six-digit code fields across login, signup, verify email, forgot password and reset password. The primary submit button and navigation/resend buttons use the canonical SiteButton primary/ghost variants. Existing field validation, autocomplete, busy/disabled state and accessible labels remain connected.

The marketing Contact form now uses shared Input components for Event type and Email address, the new canonical Textarea for About your event, and a canonical primary SiteButton. The new Textarea uses the existing FieldFrame and shared input styling, with associated label, description/error IDs and aria-invalid/aria-describedby support. It is registered in the platform component catalog. Site/account styles were scoped to these canonical controls.

## Sending and service availability

The marketing Contact form was already intentionally unavailable before this repair: its submit button was disabled with Contact service unavailable, and its submit handler only prevented default and displayed Enquiry not sent / service not connected. It had no connected outgoing contact endpoint or configured recipient in that form. This repair retained that honest unavailable state. It did not implement contact-message delivery or configure an outbound provider.

The existing account flows remain connected to POST /api/accounts/login, /register, /verify, /forgot, /reset and /resend. Account availability remains governed by GET /api/auth/mode. The UI repair did not change these request handlers, payloads, endpoints or the server mail implementation, and did not disable any existing configured account sender flow.

No live outgoing email was sent during this UI work. Production provider configuration and actual inbox delivery were not newly verified, so the completion claim is canonical form design/accessibility and preservation of existing account wiring, not new mail delivery capability.

## Verification basis

The source diff from integration merge 1517158 to frozen source 3fdcbff changes AccountGateway field/button rendering only. MarketingSite's contact block changes field components/layout only and preserves its previous disabled state. The original site browser evidence includes the contact and account reset layouts.
