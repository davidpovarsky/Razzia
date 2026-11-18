# Theme Builder account boundary — 16 November 2026

Changing `StudioThemeBuilder.accountId` used to replace its API client while
retaining the previous account's opened document, edit history, dirty state and
author permission. The actual old component reproduces that retained draft in
both Chromium and WebKit while the new workspace request is still pending.
This is a component lifecycle finding; no customer-data incident is claimed.

The exported component now keys its internal account-scoped component by the
verified account ID. React replaces its complete editing session in the same
commit as the account change, including the nested ThemeBuilderShell. That
shell's existing unmount cleanup cancels its pending save. The new account
starts without an opened draft or cached author permission and checks its own
workspace grant. Server-side document storage is unchanged.

Opening a draft also owns an AbortController. Unmount aborts the request, late
results cannot set opened/error state, and a synchronous request ref prevents
duplicate opens before React commits the pending state. All product edits are
in E's `StudioThemeBuilder.tsx`. Root bootstrap/auth/routes/safeReturnTo and the
Native Save/OAuth DTOs remain under their existing ownership. The manager's
decisions in inbox topics `1220548038356495` and `1220548100130126` were read;
those integration requests remain independent of this source correction.

## Actual focused validation

The new fixture mounts the actual component with the existing session module,
i18next and Rubik. It supplies a signed **synthetic** token and intercepts the
workspace/document API. It changes the account prop through a React parent,
without replacing the product component with a mock.

- Fresh baseline build substitutes only the exact committed pre-fix Studio
  component at its canonical module ID. The two expected regression failures
  show the old private draft is still present after switching the account.
- Fresh fixed build passes **6/6** browser cases: edited draft, in-flight read
  and in-flight save, each under Chromium and WebKit. The old draft disappears
  while the new workspace check is held, Save is disabled, the new account's
  draft opens correctly, and releasing the old response cannot replace it.
  Recorded requests contain no old-account draft PUT to the new account.
- Focused corrected TypeScript exits 0. The first type check's single
  `HTMLElement | SVGElement.value` test diagnostic remains recorded. Adding the
  explicit HTMLInputElement cast emits **byte-identical** Vite/Oxc JavaScript
  to the exact browser-tested spec; it changes no runtime assertion.
- All six final formatted TypeScript/TSX/MJS files also emit byte-identical
  JavaScript and have matching executable ASTs. The test-only type correction
  and formatting receipts are in `corrected/source-bridge.json`.
- Both build graphs contain 2,189 distinct physical inputs plus one virtual
  input, with actual input/output SHA256 records in
  `build-inputs-and-outputs.json`. Both forbidden browser-authority lists are
  empty. The final Studio source SHA256 is
  `d63a4b74488cf04940823c4fbab2e9b5374aa9628c1488c475e5d5027fe34f68`.

This is production-React component evidence with intercepted APIs. It does not
establish actual root account switching, backend RBAC, persistent storage,
development StrictMode effect replay, positive Native Save or release acceptance.
The existing native45/consent suites were not repeated.

## Custody and intake

Archive `show-ui-E-boundary27-evidence.tgz`: **1,262,098 bytes**, SHA256
`ca7ef389c57b680dd3429df185ec657f667eb069efb004a48a02680dbeac5e8c`.
All 65 original and 73 supplemental checksum rows were verified locally before
the retrieval marker. The baseline failures and initial type diagnostic are
preserved. The original runner remains exit1 because of that diagnostic;
fixed-browser and corrected-TypeScript results are separately exit0.

Container is terminal, PID0, no OOM. E's cumulative measured charge is
94,322,688 bytes inside the existing 90MiB ceiling; 49,152 bytes remain. The
compute claim is released. No new capacity, package install, cache copy or
source/evidence deletion was needed. The pre-existing dirty
`builder-host.test.ts` is untouched and excluded from this delivery.

Root may intake this one-component correction and its focused regression
fixture at the next normal merge boundary. The source tasks SB08/SB09/SB10 and
the handoff inbox parent remain open; there is no deployment request or urgent
decision. The existing Native Save and font integration handoffs are not
duplicated or treated as acceptance of the full product gate.
