# Phase 3 Unit A Security & Quality Review — `phase3-service-review-20261117`

## Review Scope & Provenance

- **Reviewer:** Read-only independent review (`run 17edc638-3eae-492f-adde-76373a73db3e`), model `Gemini 4 Hydrogen (XHigh)` (`antigravity`).
- **Reviewed target:** Branch `cez/e0c87b17`, commit `8e13d00a7c36dd1b130018ca59499acf6fc1fa83` (`feat(mcp-app): compose opt-in protected MCP and OAuth service`).
- **Base commit:** `fd3048402fb66cc22867635ea1fdbe39e08d1fa0` (product baseline `12ba2f4f4a0185762cf43944aacafe2b5bc31dab`).
- **Review checkout:** `cez/17edc638` forked from `17752e3ea7e725acbfb425d90bfd8392c40b1332` (`cez/999ed90c`), kept strictly read-only on product code; all 7 target files inspected via `git show` / `git diff` over `fd3048402fb66cc22867635ea1fdbe39e08d1fa0..8e13d00a7c36dd1b130018ca59499acf6fc1fa83`.
- **Changed files verified (`7` files, `+2895 / -0`, zero `packages/**`, `contracts/**`, or `server/**` edits):**
  1. `extensions/src/mcp-app/first-party/index.ts` (+25)
  2. `extensions/src/mcp-app/first-party/service.ts` (+1076)
  3. `extensions/qa/phase3-mcp-service/tsconfig.json` (+8)
  4. `extensions/qa/phase3-mcp-service/mcp-client.ts` (+18)
  5. `extensions/qa/phase3-mcp-service/service.nodecheck.ts` (+1155)
  6. `extensions/qa/phase3-mcp-service/http-listener.nodecheck.ts` (+509)
  7. `extensions/qa/phase3-mcp-service/evidence/verification-receipt.json` (+104)
- **Manager independent Linux QA context (from `inbox/17edc638/20261117-manager-linux-qa.md`):**
  - RAM-only `/tmp/phase3-999ed90c/source` on `tadazz-quiz-server` (Node `v24.22.2`, Linux `aarch64`, `--network=none`): `service.nodecheck.ts` + `http-listener.nodecheck.ts` ran **8 PASS / 1 FAIL** (6.79s), failing unconditionally at `service.nodecheck.ts:727` where Windows C1 rejection (`outcome.ok === false`) was asserted on Linux where real C1 returns `true`; existing `tests/server/*.nodecheck.ts` **64/64 PASS**; existing `tests/first-party/*.nodecheck.ts` (excluding `native-save-client.nodecheck.ts`) **68/68 PASS**.
  - Unit A settled without calling `cez task report` (`units/e0c87b17/report.md` notes `"no structured report"`), though `units/e0c87b17/notes.md` and `verification-receipt.json` are present.

## Verdict

**`changes`** — Do **not** merge `8e13d00a7c36dd1b130018ca59499acf6fc1fa83` yet.

The composition boundary cleanly reuses existing first-party OAuth, SDK Streamable HTTP, tenant SQLite, and C1 Native Save authorities without touching `packages/**` or adding schemas, and stays fail-closed default-off. However, five concrete behavioral/security/QA defects prevent acceptance until repaired and re-verified on Linux:

1. **Critical:** `createPrincipalRateLimiter` LRU eviction resets active/exhausted rate-limit buckets within the same window and keys per `grantId` (`service.ts:230-261`, affirmed by `service.nodecheck.ts:1036-1039`).
2. **Important:** `outerBudget` (`32`-slot admission) and `active` tracking release early when `remote.fetch` returns `400`/`504` on abort/timeout while `remote`'s background `retire()` still holds live dependency work (`service.ts:634-641` vs `server/http.ts:447-470`).
3. **Important:** `createBoundedNodeBodyStream` lacks backpressure, destroys the TCP socket via `req.destroy(rejection)` before emitting `413` on chunked bodies `> 65_536` bytes (turning `413` into `400` internally and empty EOF on the wire), and leaks `"error"`/`"aborted"` listeners in `cancel()` while early rejections never cancel `webRequest.body` (`service.ts:767-835, 945-987`).
4. **Important:** Node TCP response buffering/writes (`await webResponse.arrayBuffer()` + `res.end(bodyBytes)`) occur outside `outerBudget`, `service.drain()`, and any response-write timeout, while pre-header/idle sockets lack `server.maxConnections` and `server.timeout` bounds (`service.ts:643-646, 951-975, 1016-1020, 1058-1074`).
5. **Important:** Reproduced QA portability failure at `service.nodecheck.ts:671-733` (`8 PASS / 1 FAIL` on Linux) plus unverified Linux ext4 C1 persistence/replay through `createProtectedMcpService` and stale Windows-only `verification-receipt.json`.

---

## Strengths

- **Genuine reuse without schema or upstream drift:** Composes `createFirstPartyOAuth`, `oauth.draftRepository`, `oauth.catalog`, `oauth.exports`, `oauth.storage`, `oauth.remote` (`createRemoteMcpApp`), and `createNativeCreationPort({ ..., enableOperationBindings: true })` with zero `packages/**`, `contracts/**`, or `server/**` edits and zero new SQLite tables (`service.ts:282-295, 488-526`).
- **Default-off fail-closed gating:** `PROTECTED_MCP_SERVICE_ENV` / `isProtectedMcpServiceEnabled` requires exact `"true"` (`service.ts:27, 190-194`); `createProtectedMcpService` with `options.enabled !== true` never opens `configRoot` or OAuth state and returns `404 SERVICE_DISABLED` / `503 SERVICE_CLOSED` with `STRICT_RESPONSE_HEADERS` (`service.ts:443-462`); `listenProtectedMcpHttpServer` refuses disabled services and non-loopback binds without explicit `allowNonLoopback: true` (`service.ts:996-1004`).
- **Route disjointness & proxy-header rejection:** `validateServiceRoutes` enforces separate `resourceMetadataUrl` path, rejects OAuth/MCP collisions and consent-page collisions (`service.ts:350-393`); both `validateHeaderSurface` and `inspectRawNodeHeaders` enforce `<= 32` header pairs, `<= 16_384` total header bytes, exact `Host` membership, and reject `Forwarded` / `X-Forwarded-*` (`service.ts:400-435, 670-765`).
- **Raw Node header & keep-alive smuggling guards:** `inspectRawNodeHeaders` rejects duplicate or missing `Host` (`400 INVALID_HOST`), duplicate or malformed `Content-Length` (`400`/`413`), invalid `BODY_LESS_METHODS` bodies (`400 UNEXPECTED_BODY`), protocol-relative `//` URLs, `#`, `\`, and control characters (`service.ts:107-156, 670-765, 876-916`); `createProtectedMcpNodeListener` sets `Connection: close` when `!req.complete` (`service.ts:971-973`).
- **Honest native-save separation & real protocol test coverage:** `service.nodecheck.ts` and `http-listener.nodecheck.ts` exercise real Ed25519/PKCE tokens, real SQLite account/grant/draft persistence, real `@modelcontextprotocol/client` `StreamableHTTPClientTransport`, real `createOAuthConsentClient` / `createNativeSaveConsentClient`, and real loopback TCP abort propagation (`http-listener.nodecheck.ts:431-502`), while `verification-receipt.json` explicitly separates `createSyntheticTestNativePort` and `previewCandidateV2` test doubles from real adapters.

---

## Issues

### Critical (Must Fix)

#### 1. `createPrincipalRateLimiter` LRU eviction resets exhausted rate-limit buckets and allows per-grant amplification

- **Location:** `extensions/src/mcp-app/first-party/service.ts:196-260` (specifically lines `225-258`) and `extensions/qa/phase3-mcp-service/service.nodecheck.ts:1014-1039`.
- **What is wrong:**
  1. `bucketKey` is `${principal.accountId}:${principal.grantId}:${isMutation ? "w" : "r"}` (`service.ts:225`). A single account may approve up to `1000` active OAuth grants in `grants.sqlite` (`oauth-grants.ts:326`), giving one account up to `1000x` the intended read/mutation budget and `2000` distinct map keys.
  2. When `buckets.size >= maxEntries` and no entries have expired yet, lines `248-254` evict `buckets.keys().next()` (the least-recently-used key) **even if that entry is unexpired and has already exceeded `limit`**. Any subsequent call for that evicted key inside the same `windowMs` creates a fresh `{ count: 1, resetAt: now + windowMs }` bucket (`service.ts:256`) and returns `true`.
  3. `service.nodecheck.ts:1036-1039` explicitly encodes and passes this bypass (`principalA` returns `true`, then `false`, gets evicted by `principalB`, then returns `true` again immediately).
- **Minimal reproducible case (verified on Node `v22.17.0` using exact `service.ts:196-260` logic):**
  - Configure `createPrincipalRateLimiter({ readsPerMinute: 1, maxEntries: 2, windowMs: 60_000 })`.
  - Send 9 calls alternating `grantId` `g1 -> g2 -> g3 -> g1 -> g2 -> g3 -> g1 -> g2 -> g3` for the same `accountId = "acct-A"`.
  - **Observed output:** `[ true, true, true, true, true, true, true, true, true ]` — 9/9 permitted within one millisecond despite `readsPerMinute: 1`. (With `maxEntries: 1`, even alternating 2 grants or 2 accounts resets every limit.)
- **Why it matters:** A single authenticated account rotating through grants (or multi-tenant load crossing `maxEntries`, e.g. 6 accounts x 1000 grants x 2 buckets > default `10_000`) can completely neutralize per-principal rate limiting.
- **How to fix:**
  - Key buckets by `${principal.accountId}:${isMutation ? "w" : "r"}` (and optionally enforce a secondary per-grant cap) so one account cannot multiply quota or spam entries via multiple grants.
  - Never evict unexpired active (especially already-blocked `count > limit`) buckets to admit new entries: when `buckets.size >= maxEntries` after purging expired entries, **fail closed (`return false`)** for uncached keys (or preserve exhausted entries and fail closed when capacity consists solely of active entries). Update `service.nodecheck.ts:1014-1039` to assert the limit **holds** rather than resets.

---

### Important (Should Fix)

#### 2. `outerBudget` (32-slot budget) and `active` tracking release early on aborted or timed-out `remote.fetch` calls

- **Location:** `extensions/src/mcp-app/first-party/service.ts:528-529, 606-646` vs `extensions/src/mcp-app/server/http.ts:447-470`.
- **What is wrong:**
  - `createRemoteMcpApp` (`server/http.ts:447-470`) returns `400` on abort or `504` on `responseTimeoutMs` immediately via `Promise.race([serving, interrupted])`, while spawning `retire()` in `finally` to hold `remote`'s 32-slot `IngressBudget` and `remote`'s `active` entry until `serving` and `work.drain()` (e.g., `verifyAccessToken`, `rateLimit`, `previewCandidateV2.render`, `storage`) actually finish.
  - By contrast, `createProtectedMcpService.fetch` (`service.ts:634-641`) awaits only `executeFetch(request, controller)` (`remote.fetch(scopedRequest)`), and immediately deletes `controller` from `active`, calls `release()` on `outerBudget`, and resolves `deferred` as soon as `remote.fetch` returns `400` or `504`.
- **Minimal reproducible case (verified in Node `v22.17.0` matching `service.ts:606-641` + `server/http.ts:447-470`):**
  1. Send 32 `POST /mcp` requests whose `rateLimit` or `previewCandidateV2.render` blocks on a `held` promise (or with `responseTimeoutMs: 50`).
  2. Abort all 32 `AbortController`s (or wait 50ms for timeout).
  3. Await all 32 `service.fetch()` promises and yield 1 tick (`setImmediate`).
  4. **Observed state:** `outerInFlight === 0` (all 32 `outerBudget` slots freed!), while `innerInFlight === 32` (`remote`'s 32 real operations are still running). A 33rd request to `GET /oauth/jwks.json` or `GET /.well-known/oauth-authorization-server/oauth` returns `200` instead of `429`, and additional `POST /mcp` calls pass `outerBudget` (`service.nodecheck.ts:1071-1146` missed this because it never aborted or timed out the 32 held requests).
- **Why it matters:** Breaks the unified 32-slot lifetime invariant across abort/timeout/cancel (`"32 admitted lifetimes through actual work/send/cancel"`), letting aborted/timed-out MCP work accumulate while OAuth and outer admission appear idle.
- **How to fix:**
  - Either expose a per-request settlement / admission hook from `createRemoteMcpApp` (Wait: `server/**` is protected/read-only unless approved! Wait — check downstream alternative first: `service.ts` can pass a wrapped `dependencies` / `rateLimit` / `preview` / `previewCandidateV2` tracker or track `remote.drain()` / per-call dependency promises inside `service.ts`! Specifically, `createProtectedMcpService` ALREADY constructs `dependencies` (`service.ts:506-518`) — wrapping async dependency methods passed into `oauth.remote(...)` with a per-request/service pending counter or awaiting completion before calling `release()` and `deferred.resolve()` requires **zero `packages/**` or `server/**` edits**! Note: `verifyAccessToken` is bound inside `oauth.remote()` (`oauth.ts:194`), so `rateLimit`, `catalog`, `preview`, `previewCandidateV2`, `storage`, `exports` are wrappable in `service.ts`, whereas tracking an aborted `verifyAccessToken` or `serving` directly inside `remote` would only need `server/http.ts` if `verifyAccessToken` can stall; document that exact boundary!).

#### 3. `createBoundedNodeBodyStream` lacks backpressure, turns chunked `> 64 KiB` `413` rejections into `400`/empty EOF, and leaks listeners / unread streams

- **Location:** `extensions/src/mcp-app/first-party/service.ts:767-835, 934-988`.
- **What is wrong:**
  1. **Eager flowing mode / no backpressure:** `start(controller)` attaches `req.on("data", onData)` (`service.ts:824`) immediately rather than pausing `req` and driving reads via `pull()` + `req.resume()`/`req.pause()` against `controller.desiredSize`.
  2. **`413` socket-destroy race on chunked > 64 KiB bodies:** When `bytesRead > HTTP_LIMITS.bytes` (`service.ts:800-804`), `onData` executes `req.destroy(rejection)` **before** `fail(rejection)` and **before** `cleanup()`. In Node `v22.17.0`, `req.destroy(rejection)` synchronously fires `req`'s `"aborted"` event, invoking:
     - `req.once("aborted", abortRequest)` (`service.ts:930`) -> `controller.abort()`;
     - `req.on("aborted", onAborted)` (`service.ts:822, 827`) -> `fail(new HttpRejection(400))`, setting `settled = true` **before** line 803 (`fail(rejection)`) runs, overwriting `413` with `400`;
     - socket destruction (`req.socket.destroyed === true`), so no HTTP `413` (or `400`) response reaches the client.
     - Even worse, on `POST /mcp` (`server/http.ts:317`), `await verified()` runs async WebCrypto/SQLite checks _before_ `bodyText(request)` reads the stream; because `start()` puts `req` into flowing mode immediately, a chunked > 64 KiB body triggers `req.destroy(rejection)` mid-auth, causing `res.close` (`writableFinished=false`) and `!canWriteNodeResponse(res)` (`service.ts:953`) to drop the response completely.
  3. **Incomplete `cancel()` and unread-body leak:** `cancel()` (`service.ts:829-833`) removes only `"data"` and `"end"` listeners, leaving `"error"` and `"aborted"` listeners attached and never calling `req.pause()` or `req.destroy()`. Moreover, when `service.fetch()` returns an early error (`401`/`403`/`404`/`415`/`429`) without reading `webRequest.body`, `createProtectedMcpNodeListener` never cancels `webRequest.body`.
- **Minimal reproducible case (empirically verified on Node `v22.17.0`):**
  - Send `POST /oauth/token HTTP/1.1` (or `POST /mcp` with async `verifyToken`) with `Host: example.invalid`, `Transfer-Encoding: chunked`, and a single 70,000-byte chunk (`> 65_536`).
  - **Observed result (direct read case):** `req.aborted` fired synchronously inside `req.destroy(rejection)`, reader caught `status=400` instead of `413`, `controller.signal.aborted === true`, `req.socket.destroyed === true`, and TCP client received `{ ok: true, data: '' }` (0 bytes, no HTTP `413`).
  - **Observed result (async auth case, 50ms):** `req.aborted` and `res.close writableFinished=false` fired before auth finished; TCP client received `{ ok: true, data: '' }`.
- **Why it matters:** Chunked HTTP clients exceeding 64 KiB receive dropped TCP connections / `400` instead of deterministic `413` security rejections, and stalled/early-rejected requests lack clean stream teardown and backpressure.
- **How to fix:**
  - Read `req` via `pull()` / `req.pause()` / `req.resume()` bounded by `controller.desiredSize`.
  - On `bytesRead > HTTP_LIMITS.bytes`, set `settled = true`, `cleanup()` (removing all 4 listeners), `req.pause()` (and do **not** call `req.destroy()` synchronously before the response is sent!), and `controller.error(new HttpRejection(413))`; let `createProtectedMcpNodeListener` send HTTP `413` with `Connection: close` (already triggered by `!req.complete`) and destroy/close the socket once `res.end()` finishes.
  - In `cancel()`, call `cleanup()` (all 4 listeners), pause `req`, and destroy `req` only after response handling or if not already ended; in `createProtectedMcpNodeListener`'s `finally` (or right after `service.fetch` returns when `!webRequest.bodyUsed`), cancel unread `webRequest.body` cleanly and destroy incomplete `req` after `res` flushes.

#### 4. TCP response buffering/writes escape admission, `drain()`, and timeouts; pre-header/idle sockets lack connection limits

- **Location:** `extensions/src/mcp-app/first-party/service.ts:636-646, 951-975, 1006-1020, 1058-1074`.
- **What is wrong:**
  1. `createProtectedMcpNodeListener` runs `const bodyBytes = Buffer.from(await webResponse.arrayBuffer())` (`service.ts:957`) and fire-and-forget `res.end(bodyBytes)` (`service.ts:975`) **after** `service.fetch()` (`service.ts:951`) has already exited `finally` (`service.ts:636-641`), releasing `outerBudget` and resolving `active`. Thus:
     - `service.drain()` (`service.ts:643-646`) can resolve **before** `webResponse.arrayBuffer()` completes or TCP response bytes flush (`'finish'`/`'close'`).
     - `outerBudget`'s 32-slot limit does **not** cover slow-reading TCP clients receiving large responses (up to `4_194_304` bytes for `previewUiResource` `resources/read` or `262_144` bytes for `/oauth/downloads/...`).
     - `res.end(bodyBytes)` does not check `res.writableNeedDrain` or await socket flush/error, and `ProtectedMcpHttpServer` exposes no `drain()` method (`listener.close()` immediately aborts active requests via `service.close()` and calls `server.closeAllConnections()`).
  2. `listenProtectedMcpHttpServer` sets `server.requestTimeout = responseTimeoutMs` (`service.ts:1019`), which in Node `http` bounds **only incoming request reception (`req` until `'end'`)**, NOT handler latency after `req` finishes (`oauth.fetch` has no `responseTimeoutMs` at all!) and NOT slow TCP response writes (verified on Node `v22.17.0`: with `server.requestTimeout = 200`, `req.end` at 0ms, and handler sleeping 500ms or client pausing reads, `server.requestTimeout` never fired and `200 OK` still ran at 500ms). `server.timeout` (socket inactivity) is left at `0`, and `server.maxConnections` is left `undefined` (unlimited pre-header/slow-header/idle keep-alive TCP sockets outside `outerBudget`).
- **Why it matters:** Slow response readers and pre-header/slow-header connection floods bypass the 32-slot resource budget and can queue multiple 4 MiB buffers / FDs indefinitely without triggering `responseTimeoutMs`, while `service.drain()` can report drained prematurely on TCP listeners.
- **How to fix:**
  - Track active Node listener response lifetimes (including `arrayBuffer()` and `res` `'finish'`/`'close'`) under the service's admission budget (or a dedicated listener admission wrapper + `drain()` hook) and enforce a real response/socket write deadline (`res.setTimeout(...)` / `server.timeout`) when `res` stalls.
  - Bound `server.maxConnections` explicitly (e.g., capped alongside `outerBudget` + small keep-alive headroom) and consider an explicit `responseTimeoutMs` deadline on `oauth.fetch` paths as well as `remote.fetch`.

#### 5. QA portability defect fails `service.nodecheck.ts` on Linux (`8 PASS / 1 FAIL`) and leaves real C1 persistence untested via `createProtectedMcpService`

- **Location:** `extensions/qa/phase3-mcp-service/service.nodecheck.ts:671-733` (specifically lines `727-729`), `service.nodecheck.ts:392-395`, and `extensions/qa/phase3-mcp-service/evidence/verification-receipt.json`.
- **What is wrong:**
  1. Test `"real C1 createNativeCreationPort on Windows fails closed after native-save approval without fake commit"` (`service.nodecheck.ts:671-733`) runs unconditionally on all platforms and asserts `outcome.ok === false` (`line 727`), `outcome.error.code === "DEPENDENCY_UNAVAILABLE"` (`line 728`), and `existsSync(join(f.root, "quizz")) === false` (`line 729`). On Linux, `createFirstPartyNativeSaveOperations` uses real C1 and succeeds (`outcome.ok === true`), causing a **reproduced `8 PASS / 1 FAIL` failure** in the Manager's Linux QA container (`inbox/17edc638/20261117-manager-linux-qa.md`).
  2. Notice `service.nodecheck.ts:1000` properly gates POSIX `0o600` assertions with `if (process.platform !== "win32")`, whereas line `727` omitted the platform branch and did not add the corresponding Linux C1 assertion (checking `outcome.ok === true`, persisted `tenants/<owner>/quizz/*.json` + `extensions/quizzes/<quizId>.json`, absent global `quizz/`, untouched foreign tenant `quizz/`, idempotent replay returning identical `quizId`, and `REQUEST_KEY_REUSED` on modified expectedRevision).
  3. `verification-receipt.json` was committed inside `8e13d00` before `8e13d00` existed (recording `baseCommitSha: fd304840...` instead of `8e13d00`, Windows-only `win32` run).
- **Why it matters:** Candidate `8e13d00` fails its own Phase 3 QA suite on the target Linux server runtime, and real C1 native-save persistence through `createProtectedMcpService` remains unverified in `service.nodecheck.ts`.
- **How to fix:**
  - Branch `service.nodecheck.ts:671-733` by `process.platform === "linux"`: on non-Linux retain the fail-closed `DEPENDENCY_UNAVAILABLE` assertion; on Linux assert real C1 `save_game` `ok === true`, genuine tenant `quizz/` + `extensions/quizzes/` files, replay idempotency, and `REQUEST_KEY_REUSED` / cross-account isolation (and note tmpfs vs ext4 boundary cleanly). Update `verification-receipt.json` after Linux verification.

---

### Minor (Nice to Have)

1. **`204 No Content` emits `content-length: 0` (`service.ts:969`):**
   - `res.setHeader("content-length", String(bodyBytes.byteLength))` runs for all statuses including `204` (`OPTIONS /mcp` CORS preflight). Verified on Node `v22.17.0`: writes `HTTP/1.1 204 No Content\r\ncontent-length: 0\r\n...`, which violates RFC 9110 §15.3.5 / RFC 9112 §6.3 and can trigger strict proxy/fetch rejections. Omit `content-length` for `204`/`304`/`1xx` (or `HEAD` when no body length desired, though `HEAD` is allowed `Content-Length`).
2. **Direct `service.fetch(Request)` OAuth URL userinfo (`service.ts:550`):**
   - `executeFetch` checks `!url || url.hash` (`service.ts:550`), and `oauth.ts:206` checks `url.origin !== issuer.origin`. Because `new URL("https://user:pass@host/oauth/jwks.json").origin` strips credentials, direct `service.fetch()` calls with embedded `username`/`password` pass OAuth routing (unlike `server/http.ts:256` on `/mcp`, and impossible via `createProtectedMcpNodeListener` because `rawUrl` starts with `/` not `//`). Reject `url.username || url.password` in `executeFetch`.
3. **Defense-in-depth in `inspectRawNodeHeaders` (`service.ts:696-764, 890`):**
   - `inspectRawNodeHeaders` does not explicitly reject `hasTransferEncoding && contentLengthCount > 0`. Node 22 `llhttp` already rejects `CL+TE` with `400 Bad Request` before the listener runs (verified empirically), so this only affects hypothetical synthetic `IncomingMessage` callers.
   - `inspectRawNodeHeaders` is called at line `890` outside the `try/catch` (`933-984`), while `isTokenString` (`137-156`) accepts delimiter ASCII (`()<>@,;:\"/[]?={}`) that `headers.append(name, value)` (`756`) rejects with `TypeError`. Safe behind `llhttp`, brittle against direct synthetic callers.
4. **Defensive cloning & consent-page disjointness (`service.ts:375-389, 480, 500, 507`):**
   - `validateServiceRoutes` checks `consentPageUrl` and `nativeSave.consentPageUrl` against OAuth/MCP routes, not against each other (nor `/oauth/downloads` prefix when missing trailing slash), and `createProtectedMcpService` passes `options.authoring` by reference rather than cloning like `first-party/http.ts:138-145`.
5. **Single unauthenticated `IngressBudget` front-loading (`service.ts:528, 614`):**
   - Placing `IngressBudget` (`120/min` process-wide anonymous counter) in front of `404`/`403`/`400`/JWKS/metadata means 120 unauthenticated `404` or wrong-Host requests/minute exhaust `outerBudget` for authenticated MCP/OAuth callers (inherited from `IngressBudget`'s fixed anonymous budget design; consider separating per-connection or post-routing/authenticated work vs cheap static rejection if DoS resilience is required).

---

## Executable Negative & Distinguishing Tests

### Verified Locally in Read-Only Node `v22.17.0` (Zero Repo Writes)

1. **Rate-limit LRU reset bypass (`createPrincipalRateLimiter` exact logic):**
   - `readsPerMinute: 1, maxEntries: 2, windowMs: 60_000`; 9 alternating calls across `g1, g2, g3` for one `accountId` -> `[true, true, true, true, true, true, true, true, true]` (never hits `false`).
2. **`outerBudget` early-release vs `remote` `retire()`:**
   - 32 aborted requests blocking inside `remote` -> `outerInFlight === 0`, `innerInFlight === 32`.
3. **Chunked `> 64 KiB` body stream destruction:**
   - `POST /oauth/token` with `Transfer-Encoding: chunked` + 70,000-byte chunk -> `req.aborted` fires inside `req.destroy()`, `caught=400`, `req.socket.destroyed=true`, client receives `data: ''` (0 bytes).
   - `POST /mcp` with 50ms async auth + 70,000-byte chunk -> `req.aborted` + `res.close writableFinished=false` before auth returns; client receives `data: ''`.
4. **`server.requestTimeout` stops after `req.end`:**
   - `server.requestTimeout = 200`, `POST` finishes `req.end`, handler sleeps `500ms` -> returns `200 OK` at `500ms` (`server.timeout` never fires).
5. **`cancel()` listener retention & `204` `Content-Length: 0`:**
   - Stalled `POST` cancelled after 100ms -> `req.listenerCount("error") === 1`, `req.destroyed === false` until `Connection: close` flushes; `204` with `res.setHeader("content-length", "0")` emits `content-length: 0` on wire.
6. **`CL+TE` on Node 22 `http.Server`:**
   - `Content-Length: 5` + `Transfer-Encoding: chunked` rejected by `llhttp` before handler (`reachedHandler: false`, `HTTP/1.1 400 Bad Request`).

### Proposed Commands for Manager's Existing RAM-Only Linux QA Container (Not Executed by Reviewer)

After Unit A fixes the 5 issues above, the Manager can validate on `/tmp/phase3-999ed90c/source` (`network-none`, `Node v24.22.2`) using:

```bash
# 1. Re-run repaired Phase 3 service + TCP listener suites (expect 9+/9 PASS including real Linux C1 persistence)
node /cleanup/extensions/node_modules/tsx/dist/cli.mjs --tsconfig extensions/qa/phase3-mcp-service/tsconfig.json --test --test-concurrency=1 extensions/qa/phase3-mcp-service/service.nodecheck.ts extensions/qa/phase3-mcp-service/http-listener.nodecheck.ts

# 2. Re-run existing server + first-party regression suites
node /cleanup/extensions/node_modules/tsx/dist/cli.mjs --tsconfig extensions/src/mcp-app/tsconfig.json --test --test-concurrency=1 extensions/src/mcp-app/tests/server/*.nodecheck.ts
node /cleanup/extensions/node_modules/tsx/dist/cli.mjs --tsconfig extensions/src/mcp-app/tsconfig.json --test --test-concurrency=1 extensions/src/mcp-app/tests/first-party/*.nodecheck.ts

# 3. Typecheck, lint, format on changed paths
node /cleanup/extensions/src/mcp-app/node_modules/typescript/bin/tsc --noEmit -p extensions/src/mcp-app/tsconfig.json
node /cleanup/extensions/src/mcp-app/node_modules/typescript/bin/tsc --noEmit -p extensions/qa/phase3-mcp-service/tsconfig.json
node --experimental-strip-types /cleanup/node_modules/oxlint/bin/oxlint -c oxlint.config.ts extensions/src/mcp-app/first-party/service.ts extensions/src/mcp-app/first-party/index.ts extensions/qa/phase3-mcp-service/*.ts
```

(Note: for real ext4 durability acceptance of Linux C1 `save_game`, `native-save-client.nodecheck.ts` / Phase 3 Linux C1 must run on an ext4 path rather than `/tmp` tmpfs.)

---

## Declined to Judge

- **Express / Studio HTML & HEAD routes (`/studio/oauth-consent`, `/studio/native-save-consent`, `/manager/quizz/:quizId`) and browser Playwright E2E:** Outside Unit A's scope (`order.md` explicitly left HTML route mounting, Studio reopen, and browser UI consent clicks to downstream integration).
- **Physical Linux ext4 durability & crash/power-loss recovery under `createProtectedMcpService`:** Not observable on Windows and not exercised on ext4 by Manager's `/tmp` tmpfs run.
- **Real external ChatGPT / Claude host OAuth + Streamable HTTP interoperability and TLS/Caddy/proxy deployment:** External hosts and TLS termination are outside this local loopback/in-process scope.
- **Unit B Widget / Host Bridge (`cez/c76cfcf7` / `cez/df544d57`) and Phone / Recovery / Site units:** Distinct concurrent scopes not reviewed here.
- **Full local `tsc` / `oxlint` / `prettier` / `nodecheck` execution inside review worktree `17edc638`:** `node_modules` and `8e13d00` are intentionally absent from `cez/17edc638`, and installing dependencies or mutating product files is forbidden by review rules; relied on source inspection, targeted Node `v22.17.0` probes, and Manager's observed Linux test receipts.

---

## Recommendations

1. Fix Critical #1 (`createPrincipalRateLimiter` account-level key + fail-closed capacity without evicting unexpired/blocked buckets) and remove the bypass assertion at `service.nodecheck.ts:1039`.
2. Fix Important #2 (`outerBudget` / `active` waiting on `remote` dependency settlement across aborts/timeouts) and Important #4 (track TCP `arrayBuffer()` + `res` completion under admission/drain/write-timeout, plus set `server.maxConnections` and `oauth.fetch` timeout).
3. Fix Important #3 (`createBoundedNodeBodyStream` `pull()`/`pause()`/`resume()` backpressure, clean `413` emission before socket teardown, full listener cleanup in `cancel()`, and unread body cancellation on early errors).
4. Fix Important #5 (`service.nodecheck.ts:671-733` Linux C1 branch + `verification-receipt.json` provenance) and add TCP regression tests covering: (a) 32 aborted/timed-out MCP requests holding `outerBudget` until dependency settlement, (b) chunked `> 64 KiB` POST over TCP returning HTTP `413` cleanly, (c) rate-limiter saturation resisting eviction reset, and (d) slow response write timeout / drain semantics.
