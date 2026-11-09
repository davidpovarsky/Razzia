# Portable package API v1

Private workspace API; no marketplace endpoint. Existing `/api/themes`, compiled
renderers and JSON/XLSX import remain. The two switches
`TADAZZ_PACKAGE_INSTALLER_ENABLED` and `TADAZZ_PACKAGE_RUNTIME_ENABLED` default to
OFF. Installer additionally requires account mode (or the explicitly marked
disposable remote QA environment). Code uploads require the runtime switch too.
No production environment is changed by this implementation.

## Authentication and transport

Every management endpoint requires an existing verified manager Bearer session.
Tenant is the session subject. Optional `X-Tadazz-Workspace` must match the
server's assigned workspace grants; it never grants access by itself. Reviewers
use their own session and an assigned owner workspace. Never put account tokens
in URLs, archives, source, screenshots or logs. Binary uploads are ZIP bytes,
not base64 JSON, with a maximum compressed request of 180 MB. Manager operations
are limited to 30 writes and 180 reads per account per minute. Decoder/builder
resources are bounded independently; private expanded inventory quota is 1 GB
and 100 package versions per tenant.

| Method / path under `/api/packages`              | Body / result                                                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/capabilities`                              | `{installer:true,runtime:boolean}`; 404 while OFF                                                                                                   |
| POST `/preflight`                                | `.tadazz` bytes → manifest, contents, source digest, assets, bytes, review/build requirements; no writes                                            |
| POST `/uploads`                                  | bytes + `Idempotency-Key` (8–128 alphanumeric/underscore/hyphen) → receipt, 201                                                                     |
| GET `/uploads/:upload`                           | receipt, current phase/revision, exact source/build digest, independent review status, imported game IDs; accepts completed worker receipt          |
| POST `/uploads/:upload/build`                    | queues exact source for isolated decoder/compiler; 202; retry allowed from `failed`                                                                 |
| POST `/uploads/:upload/approval`                 | strict review receipt below; reviewer grant, every contributor excluded from self-review                                                            |
| POST `/uploads/:upload/install`                  | `{expectedRevision:positiveInteger,selected:contentId[]}`; atomic private install, 201; exact approved source/build required for themes             |
| GET `/`                                          | account-scoped versions/status/game IDs                                                                                                             |
| POST `/uploads/:upload/rollback`                 | select a previously installed immutable version for future catalog choices; active room pins remain                                                 |
| POST `/uploads/:upload/export`                   | original portable source archive, only if all rights permit export                                                                                  |
| POST `/uploads/:upload/games/:quizId/export`     | current saved game as a new data-only portable pack, with original permitted assets; roster excluded; foreign/new unlicensed assets fail explicitly |
| DELETE `/uploads/:upload`                        | delete an idle draft; 204. Installed versions are retained, 409, because games/history/rooms can reference them                                     |
| GET `/runtime/:sourceDigest/:themeId?roomId=...` | management preview or public room-authorized read-only render capability; see below                                                                 |

Successful private installation is the package lane's publication boundary. It
does not grant platform/marketplace publication. Existing platform publication
continues to require the old separate platform grant and trusted-build lane.
There is no API that converts a private author into a platform publisher.

## Review and revisions

```json
{
  "revision": 2,
  "sourceDigest": "64 lowercase SHA256 hex characters of the actual archive",
  "buildDigest": "64 lowercase SHA256 hex characters of the checked bundle",
  "qaEvidenceSha256": "64 lowercase SHA256 hex characters of the real evidence",
  "rightsReviewed": true,
  "contentReviewed": true,
  "accessibilityReviewed": true,
  "performanceReviewed": true
}
```

The strings above describe fields; they are not valid receipts. All live hashes
must be real digest values. The author and reviewer must differ. Grants come
from existing `TADAZZ_THEME_WORKSPACE_GRANTS`, not from payloads. Approval binds
exact revision/source/build/evidence using a domain-separated server HMAC.
Source versions are immutable. Correct source via a new version or delete an
uninstalled failed draft and upload anew; failed decoder/build jobs can retry
the same source. Build completion advances revision and invalidates stale
receipts. Game-only installation still requires successful media decoding,
but does not require a separate human theme review.

Phases: `validated → building → preview-ready → installed`, or `failed`.
`installing` is a private write-ahead state recovered before application traffic.
Review readiness is a separate signed property, never inferred from phase or a
claimed client digest. Demo/other contents can be deselected; selected games must
include their bundled theme dependency. Installing a previously installed upload
is idempotent and returns its immutable installed game IDs.

## Runtime and renderer contract

Only a configured separate origin receives executable artifacts. It mounts the
read-only `/render` and `/health` service, with no account/game/private APIs.
Five-minute capability URLs bind tenant, upload, source and exact build digest.
They authorize only that immutable presentation content, never account actions.
The dedicated origin never receives application auth/session tokens or cookies.
Use a different registrable domain in a deployment; QA uses localhost versus
127.0.0.1. The manager can preview only assigned workspaces. Public room access
uses the existing unguessable live-room model and additionally verifies that the
room references this exact package's immutable assets.

The iframe is opaque-origin `sandbox="allow-scripts"` without same-origin,
navigation, popups, forms or autoplay permissions. Exact script/style hashes,
data-only images/fonts and `connect-src/media-src/worker-src 'none'` apply.
The parent adds a restrictive frame-src policy so child self-navigation cannot
escape to an unrelated origin. Dedicated hosting must retain these headers.

Bridge messages use strict Zod contracts from `core/packages/protocol.ts`:
version, random 256-bit channel, room/question IDs, role, epoch and monotonically
increasing sequence. Window/source and opaque origin are checked before schema
validation. Invalid/stale/replayed/cross-room/cross-role messages fail closed;
message processing is limited to 30/second. Public state is an explicit
projection, not arbitrary extras: scene, text/options, revealed results,
public standings, own result, authoritative deadline/server time, locale and
motion preference. Account IDs, JWTs, phones, contacts, private API endpoints,
manager credentials and pre-reveal solutions never cross the bridge.

`ANSWER_INTENT` reaches the existing server-authorized answer route; it cannot
advance games, score, change timers, pause or manage participants. The existing
AudioCuePlayer owns music and events. Player answer-selection audio can be
requested once per event identity; core-driven timers/results are never
triggered by uploaded code. Errors, load failures and five-second missing
heartbeats fall back to the compiled stage while retaining game state. Browser
isolation does not provide a hard CPU/GPU scheduling quota; performance review
and device testing remain required.

## Errors and storage

400 malformed requests/idempotency/selection; 401 missing or invalid manager
session; 403 unauthorized grant/review/export rights/capability; 404 OFF, foreign
or missing upload; 409 immutable version/revision/review/dependency/reference
conflict; 413 byte/quota limit; 422 invalid manifest/archive/hash/media/source;
429 request limit with Retry-After. Errors expose stable `PACKAGE_*` codes,
never stack traces, secrets or arbitrary uploaded source. Network errors can
retry an upload with the same key and bytes; different bytes with that key get 409. An exact version collision gets 409.

SQLite holds metadata, review, active versions, audit and write-ahead targets.
Archives, per-tenant SHA256 objects and immutable build artifacts are separate
files. Objects are deduplicated only inside the tenant. All new game/question/
timeline identities come through existing composite import. Staging validates
all data before the synchronous commit section; pending target paths are
recorded first. Crash recovery removes only those fresh UUID targets and
returns the upload to preview-ready. Referenced installed versions/assets have
no automatic destructive garbage collection. Back up DB/WAL and object/build
directories consistently; restore them together.

## Explicit fallbacks and operational limits

GET `/uploads/:upload/preview/:themeId` returns a validated declarative definition
only after decoder/build readiness. It issues a five-minute HttpOnly media-only
capability bound to exact source/build/tenant; it never replaces an account
session. The existing trusted Classic preview consumes those assets. Assigned
reviewers can open `packageWorkspace=ASSIGNED_TENANT` alongside `packageUpload`;
the server validates the grant independently of that query/header. Multiple
themes in one package have an explicit preview selector.

The 1 GB expanded/100-version logical quota is supplemented by a 2 GB physical
tenant-store limit and 200,000-file ceiling, including retained/orphaned files.
Draft deletion reclaims its archive/job and unshared build and clears its replay
key, permitting an intentional retry. Objects remain conservative retained data;
they still count toward physical quota. Installed/history/reference-bearing
versions remain protected. Decode-approved objects are staged privately before
preview readiness and become ordinary account/room media only on installation.

Installation also accepts optional `useClassicWhenThemeSkipped: true`. This is
the user's explicit choice to replace a skipped bundled theme dependency with
Classic; without it, missing selected dependencies fail with 409. It never
silently rewrites an unsupported saved theme. The catalog/versions UI is the
existing manager Quizz tab's package panel; authenticated deep links use
`/manager/config?packageUpload=UPLOAD_ID` and the same sandbox preview.

At most two upload/preflight bodies are admitted concurrently per application
process; excess requests receive 429 `PACKAGE_IMPORT_BUSY` and Retry-After.
Media decoders validate actual images/audio/video, and FreeType opens WOFF2 in
the networkless resource-limited worker. Bounded Lottie validation is reused.
The renderer accepts React style attributes; executable script/style blocks
remain hash-bound. Scene video/Lottie and core audio remain composed by the
trusted foreground owner outside the iframe. Numeric/question-video slots use
the existing native stage. The bootstrap is retried until authenticated READY;
missing handshake/heartbeat still triggers the five-second fallback deadline.

Generated machine-readable contracts are shipped with the examples as
`package-manifest.schema.json` and `package-runtime.schema.json`. Review uses
`packageReviewSchema`, and install input is the strict Zod object beside the
route. These contracts and the endpoint table describe the implemented v1 API;
the broader endpoint names in the original plan were illustrative.
