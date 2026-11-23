# Development Preview V2: F tool/resource to D/E consumer

This is an optional read-only development seam. It does not widen the frozen
MCP0.1 schemas, version1 identity, accepted V1 pin checks or native renderer ABI.
The original `preview_game` error remains `PREVIEW_UNAVAILABLE`, with `isError:true`.
Only a genuinely produced candidate adds `_meta["tadazz/preview-candidate-v2"]`.
An accepted V1 adapter always keeps precedence; no V2 fallback is used to bypass
an installed V1 adapter's failed admission.

## Host integration

Import `createPreviewCandidatePortV2` from
`@tadazz/mcp-foundation/preview-candidate-v2`. Supply the actual issuer's
`oauth.draftRepository(authoringPolicy)`. Set the returned port on
`dependencies.previewCandidateV2` when constructing `oauth.remote`.

The required `select(principal, draft, locale)` callback supplies the actual
stored D composition document, exact scope/card associations and read-only demo
context. Its `project(prepared)` callback uses the existing host/controller
snapshot and genuine D projection binding for that exact prepared object. F
creates the prepared D capability itself from the canonical account-owned draft,
its derived D identity map and exact revision. It does not accept a prepared
object, authored snapshot, owner or question supplied by the model. No new clock,
phase engine, fabricated outcomes or answer action exists in this adapter.

`canPreview(principal, prepared)` is a required explicit data-only development
policy. Absence/false is unavailable. It conveys no executable, media, export or
installation right. The actual repository checks issued principal/live grant/
session/account ownership before and after asynchronous callbacks, including
after the final policy callback. A changed revision/content is denied. D's real
native V2 producer and process-local association assertion validate the current
snapshot. Unsupported media/settings/player roles fail closed.

The metadata strict leaf is exposed at `./preview-candidate-contracts`. It has
version2, mode development-candidate, executableAcceptance:false, draftId,
revision, projectionDigest, inputDigest and the exact D payload-only native V2
input. F's existing `previewIdentityDigest` hashes D's entire prepared content and
context; a separate inputDigest detects transport/payload corruption. No token,
account ID, key, compiled manifest, full identity map, authored document, module
URL or renderer code enters the payload. A content hash is never a rights grant.

## G widget/resource integration

The actual G-reviewed static HTML artifact is optional
`dependencies.previewUiResource = { html, sha256, csp, canServe }`.
The SHA is of the exact UTF8 HTML; the serialized resource response is bounded
at4MiB including conservative CSP/envelope headroom. The existing smaller tool
response cap is unchanged; only a read of the configured exact UI URI uses the
resource allowance. Cancelled candidate promises stay tracked until actual host
work settles, including after the HTTP deadline. The host explicitly declares
connectDomains/resourceDomains/frameDomains as exact HTTPS origins; no default
remote domains are invented. The deployment owns actual artifact/runtime/media
permission and supplies `canServe()`; it is rechecked at each resource read, and
exceptions are sanitized. No per-user templating, OAuth/native keys or model
HTML is supplied. Missing artifact means no registered UI resource and no
`preview_game` resourceUri. This deliberately replaces the former empty HTML
placeholder. The two public authoring guidance resources remain unchanged.

G owns the HTML/SDK bridge, loader and artifact. F has not produced or licensed
that artifact. Once supplied, the same existing
`ui://tadazz/quiz-preview/v1.html` resource contains the reviewed widget and keeps
its declared MCP Apps CSP. The metadata successor has its own version2 key; no
V1 metadata is relabeled. Actual host handling of UI tool-error notifications
must be checked by G in its bridge/installed-host acceptance.

G imports `createPreviewCandidateConsumerV2` from `./preview-candidate-consumer`
and injects E's actual admitted `mountCompositionPreviewCandidateV2` function.
The mount node must already be inside the isolated ShadowRoot required by E.
No dynamic module URL/eval/loader authority is read from a tool result. Connect
the trusted SDK tool-input notification to `consumer.begin(arguments)` and pair
its returned ticket with the corresponding trusted result via
`consumer.receive(ticket, result)`. G's bridge must preserve that pairing; do not
pair an unrelated outstanding invocation to the latest ticket. Cancel/account
change/unmount calls cancel/dispose. A new or invalid selection invalidates the
previous ticket and disposes the previous stage before another result arrives.

The consumer checks the unchanged failure branch, strict V2 payload, exact
requested draft/revision/locale, false acceptance and input digest. E then checks
its real bundled family/definition SHA/all15 variants and renders. Any failed
admission disposes stale content and calls the injected unavailable handler.
No UI text/translation system, second timer, audio, room, scoring or vote owner
is introduced by F. G reuses the existing eight-locale i18next/Rubik/theme UI.

## Actual evidence and readiness boundary

The adjacent QA packet binds exact integrated D/core/account source and exact E
native21 JS/CSS. Tests use real first-party account/session/SQLite/OAuth and
standard SDK HTTP calls for the tool and resource. Browser checks pass those
actual tool results through this F consumer to E's real mount in private Edge.
The QA static shell is a synthetic owned artifact, not G's final widget, and the
browser is not an installed MCP Apps host. The host snapshot in QA is explicitly
deterministic synthetic paused input, not a new production controller.

Unknown E embedded-image provenance grants no rights. External native backdrop/
logo/image requests are denied in the private browser fixture and recorded.
This verifies current-card text/frame/admission/disposal, not backdrop/font/full
scene fidelity or a new E build. No executable pin, media license, public TLS,
provider, deployment or release is inferred. Manager/G may use the reviewed seam
for development; public release/full15-scene completion is not a prerequisite to
starting G's actual widget work.
