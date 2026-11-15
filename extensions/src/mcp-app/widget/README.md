# Tadazz MCP Apps widget — development packet

This is G's React resource for `ui://tadazz/quiz-preview/v1.html`, using the
installed `@modelcontextprotocol/ext-apps` 2.1.0 SDK. It consumes F's actual
`./preview-candidate-consumer` export and E's
`mountCompositionPreviewCandidateV2`. It creates no game renderer, timer, audio
player, score owner, room connection or generated-code loader.

The static resource is optional and closed until the host supplies F's existing
`dependencies.previewUiResource = { html, sha256, csp, canServe }`. Use the exact
UTF-8 `dist/widget.html` and `widget-artifact.json`. The host owns per-read
permission and exact HTTPS CSP origins. This packet does not set `canServe` or
register a public endpoint. F's accepted V1 admission and error contract remain
unchanged. V2 renders as a labeled development candidate with
`executableAcceptance:false`, while `preview_game` remains an honest
`PREVIEW_UNAVAILABLE` tool error.

## Runtime and lifecycle

- App handlers are registered before SDK initialization. Tool-error metadata is
  forwarded intact to F's strict consumer; text/HTML is never an input format.
- A resource instance accepts its single SDK tool-input/result invocation. SDK
  notifications have no per-result invocation ID. A second complete input is
  rejected rather than paired with whichever ticket is latest. A host should
  instantiate a new resource for a new conversational invocation.
- Widget-initiated `preview_game` calls retain their exact ticket in the returned
  Promise closure. Cancel, teardown, host invocation change, transport closure
  and unmount invalidate the ticket and dispose the native Stage.
- Draft read/update uses only F's app-visible tools. Revision CAS, bounded strict
  results, fresh idempotency keys and server acknowledgment govern changes. A
  cancelled write may have reached the server; Refresh reconciles it. An unsent
  edit retains its base revision and cannot overwrite a newer refreshed draft.
- Direct title edits preserve the rest of the complete authored document. Undo
  makes a new CAS tool call. No native-save proof, native token, grant, account ID
  or approval key is passed into the widget. Acknowledged draft edits are never
  described as library saves.

## Local build and focused QA

From the repository root, with the existing installed graphs available:

```powershell
node extensions/src/mcp-app/widget/build.mjs
node extensions/src/mcp-app/widget/build.mjs --private-fixture
node extensions/src/mcp-app/widget/build.mjs --private-host
node node_modules/typescript/lib/tsc.js --noEmit -p extensions/qa/mcp-widget/tsconfig.json
node --import ./extensions/node_modules/tsx/dist/loader.mjs --test extensions/qa/mcp-widget/controller.nodecheck.ts
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/mcp-widget/server.ts
# Use the emitted loopback port:
node extensions/qa/mcp-widget/browser.mjs http://127.0.0.1:PORT
node extensions/qa/mcp-widget/packet.mjs
```

`fixture.html` and `host.js` are separate QA artifacts; never supply them as the
MCP resource. The private fixture uses the delivered D prepare/producer/assert
port. Its question/answer/results, two-card navigation, replay, two native
families, eight locales, reduced motion and separate simulated-vote counters
are explicitly synthetic. Those counters do not change native projected votes.
No play/audio clock or fabricated live-room outcomes are added. Audio remains
unavailable until its media rights and gesture contract are supplied.

The actual-widget SDK test uses the real AppBridge in an opaque sandboxed
iframe. Draft response handlers in that browser fixture are synthetic. The V2
candidate test replays the exact JSON result object retained from F's genuine
OAuth/native-account/SQLite/official-SDK HTTP test at evidence commit
`7f0d4d89e0f77be49c6543411937d977212f132f` (candidate-07). The consumer is the
manager-accepted product `b49e847`, locally integrated as `cce32f2`. This is
reused authenticated producer provenance plus newly executed widget transport
and rendering tests, not a new OAuth grant or live authenticated browser edit.

## Fidelity and limits

The widget reuses upstream Button/Input, Rubik, native Tailwind tokens and the
actual native Stage inside a ShadowRoot. The build embeds fonts and exact CSS;
no renderer URL or model-supplied CSS/JS is loaded. Build receipts record the
physical source/package file hashes. Existing native backdrop/logo paths are
served only from the explicit local synthetic fixture allowlist. Their presence
does not grant media rights for a real MCP host.

| Acceptance surface                                   | Evidence / remaining limit                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Local Edge Chromium, real widget SDK iframe          | Current focused browser packet and screenshots under `docs/extensions/qa-evidence/mcp-widget-20261115` |
| ChatGPT private installation                         | NOT_RUN; no account connection, remote service or installation changed                                 |
| Claude connector installation                        | NOT_RUN; no account connection or host support inferred                                                |
| WebKit / physical iPad                               | NOT_RUN in this G packet; no browser download or device claim                                          |
| Full 15-scene / image cards / native audio           | Not delivered by this packet; current-card contract only                                               |
| Theme/media/audio editing                            | F v0.1 forbids these settings; no misleading widget controls added                                     |
| Native library Save / permission page                | Separate E/F/native surface; no widget approval capability                                             |
| Release / public TLS / executable pin / media rights | OPEN; no deployment or production enablement                                                           |

Original tasks MCP06–MCP11 remain open until their complete original criteria
pass. A development handoff or locally rendered candidate is not completion of
those product tasks. The shared progress document remains under its current
owner; this README and the evidence handoff provide G's integration entry.
