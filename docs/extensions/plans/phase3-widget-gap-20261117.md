# Phase 3 Unit B Compatibility Probe: MCP Widget vs. Phase 2 Full-Show Preview & `ScenePresenter`

- **Date**: 2026-11-17
- **Branch / Worktree**: `cez/c76cfcf7` (`c76cfcf7-a3d2-4bf5-98a7-ee98ba0001db`)
- **Baseline HEAD**: `fd3048402fb66cc22867635ea1fdbe39e08d1fa0` (baseline product commit `12ba2f4`)
- **Scope**: Strictly read-only architectural and QA gap probe under frozen MCP `0.1.0` contracts (no product code changes, no schema changes, no dependency installs, no heavy build/browser re-runs).

## 1. Verdict

**Compatibility Verdict: INCOMPATIBLE AS-IS.**

Existing `extensions/src/mcp-app/widget/{Widget,stage,controller,bridge}` and `extensions/src/mcp-app/client/preview-candidate-v2.ts` (`createPreviewCandidateConsumerV2`) **cannot** safely reuse Phase 2 native full-show preview (`ApplicationPreviewStage`, `createApplicationPreviewSession`, `application-runtime-entry.tsx`) or `ScenePresenter` under the current frozen MCP `0.1.0` contracts.

Across the full stack, there are **five structural blockers** preventing Phase 2 full-show / `ScenePresenter` reuse without an out-of-scope, manager-approved contract and resource architecture revision, plus **one immediate downstream-only integration & QA gap** inside existing `extensions/src/mcp-app/widget/**` and `extensions/qa/mcp-widget/**` that is independently testable right now while preserving all frozen `0.1.0` contracts.

---

## 2. Environment Distinction: Local Stage vs. Installed ChatGPT / Claude Hosts

To avoid overclaiming from Phase 1/2 evidence:

1. **Local QA Harnesses vs. Real Hosts**:
   - Phase 1/2 MCP widget verification (`extensions/qa/mcp-widget/{host-entry,fixture-entry,browser,server}.*`) runs inside an in-repo local Playwright + iframe PostMessage harness (`private-test-host`) and `createPublicPreviewProvider` / `createApplicationPreviewSession` inside first-party Vite routes.
   - It does **not** prove execution inside installed ChatGPT or Claude Desktop/Web MCP Apps hosts (viewport/display-mode negotiation, host-enforced CSP headers, external-link blocks, per-tool approval prompts, or production OAuth token brokerage).
2. **Fail-Closed & Non-Executable Baseline State**:
   - Under frozen MCP `0.1.0`, `preview_game` returns `isError: true` with `error.code = "PREVIEW_UNAVAILABLE"` (`extensions/src/mcp-app/server/dispatch.ts:138-169`).
   - V2 candidate payloads in `_meta["tadazz/preview-candidate-v2"]` explicitly require `executableAcceptance: z.literal(false)` (`extensions/src/mcp-app/contracts/preview-candidate-v2.ts:6-22`).
   - `list_themes` reports `previewAvailable: false, exportPermitted: false` (`extensions/src/mcp-app/first-party/oauth-catalog.ts:103-108`).

---

## 3. Producer vs. Consumer API Boundary Inventory

| Layer | Frozen MCP `0.1.0` Widget / Candidate Stack | Phase 2 Full-Show / `ScenePresenter` Stack | Compatibility Result |
| --- | --- | --- | --- |
| **Tool Request / Entry Port** | `inputs.preview_game` (`extensions/src/mcp-app/contracts/tools.ts:33-40`): `{ contractVersion: "0.1.0", draftId, expectedRevision, locale? }` | `GamePreviewProvider.open(selection, signal, preferences)` (`extensions/src/site/components/game-preview/contracts.ts:96-105`) -> `GamePreviewSession` (`contracts.ts:107-138`) with `play`, `pause`, `replay`, `seekChapter`, `seekMedia`, `setAppearance`, `setRole`, `setSoundEnabled`, `setMediaRevealed`, `previewLobby`, `auditionAudioEvent` | **Incompatible** — `preview_game` has no `chapterIndex`, `role`, `clock`, `appearance`, or playback control surface, and `GamePreviewProvider` explicitly notes (`contracts.ts:94`): *"Candidate V2/current-card data alone cannot satisfy this port's full-show gate."* |
| **Payload Schema & Redaction** | `previewCandidateV2Schema` (`contracts/preview-candidate-v2.ts:6-22`) wrapping `nativePreviewRendererInputV2Schema` -> `NativePreviewFrame` (`core/show-library/native-preview-frame-schema.ts:16-94`): single question card, `phase: "question" \| "answerCards" \| "voting" \| "voteLocked" \| "results"`, `role: "manager" \| "spectator"` (no `"player"`), `question.type: "single" \| "multi"` (no estimation), `choices` max 5 text-only items, strict visual redaction | `ApplicationPreviewFrame` (`core/show-library/application-preview-schema.ts:13-33`): full `show: tadaShowV1Schema`, `chapterIndex`, `clock`, `role: "manager" \| "player" \| "spectator"`, `stagePhase?: "lobby"`, `appearance?: { registry, document }`, `appearanceRevision`, `scopeIds?`, `audioAudition?`, `mediaRevealed`, `soundEnabled` | **Incompatible** — Passing `ApplicationPreviewFrame` / `tadaShowV1Schema` over MCP violates strict server visual redaction (`MCP_APP_ADR.md:349-355`, exposing unredacted `correctAnswers`, `card.note`, settings) and has no schema slot in `previewCandidateV2Schema` or `LIMITS.preview` (`262_144` B). |
| **Server Producer & Policy Gates** | `normalizeDraft` (`server/authoring.ts:11-30,66-134`) requires `show.settings.length === 0`, blocks `forbidden` visual/audio keys (`themeOverrides`, `audioCues`, `stageAnimations`, `questionDecoration`, `background`, `overlayAnimations`, `lottieUrl`, `audio`, `showTheme`, `extraJson`, `roster`, etc.), caps at `LIMITS.authored` (`32_768` B). `produceCompositionNativePreviewInputV2` (`core/show-library/native-preview-renderer-v2.ts:93-191`) fails closed on any non-empty composition section or media/audio/Lottie binding. `compiledManifest.pins` (`manifest.ts:9-15`) is `[]`. | `compileFullShowPreviewTimeline(frame.show)`, `authoredShowToNativeBundleDraft(frame.show, "preview")`, `ApplicationComposition`, `application-preview-build.json` (currently `available: false` on `fd304840`) | **Incompatible** — Producer fails closed on composition sections, non-text media, audio, and show settings; executable runtime pins are not shipped in baseline `fd304840`. |
| **Mounted Renderer ABI** | `createPreviewCandidateConsumerV2` (`client/preview-candidate-v2.ts:15-99`) -> `mountCompositionPreviewCandidateV2` (`presentation/show-library-preview/renderer-entry-v2.tsx:21-120`) mounts ONLY `<NativePreviewStage>` (Classic single-card `TadazzV4StageAdapter` with no `customScreen`/`ScenePresenter`/`AudioCuePlayer`/`NativeQuestionMedia`, throwing on Classic `stageAnimations !== "none"` or `questionDecoration`) or `<NativeRazziaPreviewV2>` (simplified 2-component `QuestionEntrance` + `AnswerButton`, not `RazziaApplicationStage`) | `ApplicationPreviewStage` (`presentation/show-library-preview/application-preview-stage.tsx:55-616`) mounts `RazziaApplicationStage` (with `<ScenePresenter>` at lines `324, 368`), `<TadazzV4StageAdapter>` (`customScreen` with `NativeClassicLobbyPanel`, `NativeClassicPlayerResult`, `<ScenePresenter>` at lines `537-550`), `<NativeQuestionMedia>`, `<AudioCuePlayer>`; `<ScenePresenter>` (`presentation/scene-presenter.tsx:168-2205`) renders `transition`, `animation`, `media`, `leaderboard`, `interimResults`, `answerRecap`, `countdown`, `opening`, `closing` and uses `LottiePlayer`, `CinematicLayerStack`, `TadazzLeaderboard`, `PlatformButton`, `lucide-react` | **Incompatible** — Neither V2 renderer entry mounts `ScenePresenter`, `ApplicationComposition`, `NativeQuestionMedia`, or `AudioCuePlayer`, and `NativePreviewFrame` contains zero non-question scene data. |
| **Sandbox Origin, CSP & Assets** | `preparePreviewUiResource` (`server/preview-resource.ts:17-58`) enforces `PREVIEW_UI_RESPONSE_LIMIT = 4_194_304` B envelope cap and strict HTTPS-only `cspSchema` (`connectDomains`, `resourceDomains`, `frameDomains`, defaults empty `[]`); `App` (`widget/bridge.ts:12`, `strict: true, webMcpBridge: false`) runs in opaque sandbox iframe with no site cookies or OAuth bearer (`MCP_APP_ADR.md:293,466`) | `loadApplicationPreviewRuntime` (`site/components/game-preview/application-runtime.ts:58-115`) fetches `/api/extensions/preview/[public-]runtime/<sha256>/<name>` + executes `import(URL.createObjectURL(blob))`; `createPublicPreviewProvider` (`site/components/game-preview/public-provider.ts:20-90`) & `application-session.ts` call `/api/extensions/preview/*`; `LottiePlayer` (`presentation/lottie-player.tsx:13`) defaults WASM to `/api/extensions/lottie-wasm`; themes/scenes reference `/tadazz-show/*`, `/sounds/*`, `/media/*` | **Incompatible** — Blob dynamic imports, relative `/api/extensions/*` fetches, unallowlisted media/audio/Lottie WASM URLs, and Tailwind CSS/font size (`2,040,068` B Phase 1 widget HTML + `2,389,979` B Phase 2 runtime JS vs `4_194_304` B limit) fail MCP Apps sandbox/CSP/size constraints. |
| **Widget Controls & Bridge Lifecycle** | `Widget.tsx:218-228` in real-SDK mode renders `<div hidden={state.status !== "candidate"}>{nativeSurface}</div>` and one `{t("title")}` button (`requestPreview()`); QA `CandidateStage` controls (`Widget.tsx:229-327`, `stage.tsx:12-76`) run only under `?fixture` (`privateFixture`); `bridge.ts:58,83` enforces single `toolinput` / `toolresult` notification per resource instance; `bridge.preview()` (`bridge.ts:186-229`) uses `hostLocale(app.getHostContext()?.locale)` | Full-show playback loop (`createDemoClock`, timeline seek, phase progression, sound toggle, role toggle, media reveal, appearance switcher) driven by `createApplicationPreviewSession` (`site/components/game-preview/application-session.ts:32-687`) | **Incompatible** for full-show playback; **Actionable Bug/Coverage Gap** for real-SDK current-card `bridge.preview()` lifecycle (Section 5). |

---

## 4. Reused Baseline Acceptance vs. Actual Missing Edges

### What Already Stands (Not Re-Run via Heavy Builds Here)
- **Phase 1 (`ab50f53`)**: Built MCP Widget HTML (`2,040,068` B, SHA-256 `d276cc4e...`), `13/13` controller unit checks, and `15+6` Chromium/WebKit Playwright checks (`phase1_final.py`) covering SDK handshake, `get_game_draft` / `update_game_draft` CAS, ACK/edit-loss preservation, single-invocation host limits, and `CandidateStage` synthetic fixture rendering (`executableAcceptance: false`).
- **Phase 2 (`12ba2f4`)**: First-party Site/Studio full-show preview Stage (`ApplicationPreviewStage` + `ScenePresenter`) verified in `20/20` Chromium, `20/20` WebKit, and `4/4` marketing compat tests (JS bundle `2,389,979` B `7e918a2e...`), with known exclusions recorded cleanly (`23` historical `packages/**` freeze mismatches, `52` missing CW assets, >5 choices / estimation unavailable).

### Actual Missing Edges on `fd304840`

#### A. Five Blockers Requiring Manager-Owned Revisions Outside `widget/` (Out of Frozen `0.1.0` Scope)
1. **Contract & Redaction Boundary (`contracts/**`)**: Full-show `ScenePresenter` requires chapter/scene progression, non-question scene types, optional player-role projection, and appearance settings, none of which exist in `inputs.preview_game`, `outputs.preview_game`, `previewCandidateV2Schema`, or `NativePreviewFrame`. Passing `TadaShowV1` directly breaks redaction rules.
2. **Producer & Theme Admission (`server/**`, `core/show-library/**`)**: `authoring.ts` rejects settings/visual/audio/forbidden keys; `produceCompositionNativePreviewInputV2` fails closed on non-empty composition sections and any media/audio URL bindings; `compiledManifest.pins` is empty and `application-preview-build.json` has `available: false`.
3. **Renderer ABI (`presentation/show-library-preview/renderer-entry-v2.tsx`)**: Neither `NativePreviewStage` nor simplified `NativeRazziaPreviewV2` mounts `ScenePresenter`, `ApplicationComposition`, `NativeQuestionMedia`, or `AudioCuePlayer`.
4. **CSP, Origin, Media/WASM & 4 MiB UI Ceiling (`server/preview-resource.ts`)**: Opaque sandbox iframe blocks Blob dynamic imports (`application-runtime.ts`), unauthenticated/relative `/api/extensions/*` calls, and `/api/extensions/lottie-wasm`; bundling `ScenePresenter` + `FullShowScenes` + CSS/assets in a single inline HTML risks exceeding `PREVIEW_UI_RESPONSE_LIMIT` (`4_194_304` B).
5. **External Host Validation Gap**: Live ChatGPT and Claude Desktop/Web host behavior (CSP strictness, tool-call latency/prompts, responsive container sizing) is unverified beyond local mock `host-entry.tsx`.

#### B. One Immediate Downstream-Only Integration & QA Edge Inside `widget/` + `qa/mcp-widget/`
Even for **current-card V2 candidate preview under frozen `0.1.0` contracts**, real-SDK `Widget` (`entry.tsx` without `privateFixture`) -> `bridge.preview()` -> `preview_game` -> `createPreviewCandidateConsumerV2` -> `mountCompositionPreviewCandidateV2` has **zero test coverage** and two verified concurrency/state defects:

1. **Untested `preview_game` Tool-Call Path in QA Harness (`extensions/qa/mcp-widget/host-entry.tsx:52-94`)**:
   - `bridge.oncalltool` handles only `get_game_draft` (lines `64-66`) and `update_game_draft` (lines `68-77`).
   - Any widget-initiated `bridge.preview()` call (`app.callServerTool({ name: "preview_game", ... })`) falls through to lines `79-93`, returning `REVISION_CONFLICT` (`isError: true`). All Phase 1/2 V2 candidate stage tests relied either on `?fixture` (`fixture-entry.tsx` / `CandidateStage`) or initial host-pushed `?candidate=` notifications (`host-entry.tsx:96-119`), never interactive `Widget` `Preview` button execution after `get_game_draft` or `update_game_draft`.
2. **Pre-Consumer `controller.receivePreview(result)` Flash & In-Flight Concurrent-Edit Clobber (`extensions/src/mcp-app/widget/bridge.ts:186-229`)**:
   - At lines `218-222`, `bridge.preview()` runs:
     ```ts
     controller.receivePreview(result)

     if (consumer?.receive(ticket, result)) {
       controller.candidate()
     }
     ```
   - On a valid V2 candidate (`isError: true`, `error.code: "PREVIEW_UNAVAILABLE"`, valid `_meta["tadazz/preview-candidate-v2"]`), `controller.receivePreview(result)` runs first, fails `dataSchemas.preview_game`, and **immediately transitions `controller` to `status: "unavailable", preview: null`** before `consumer?.receive(ticket, result)` runs and transitions to `"candidate"`.
   - Worse: if the user triggers `Refresh draft` (`get_game_draft`) or `Apply draft edit` (`update_game_draft`) while `app.callServerTool("preview_game")` is in flight, `controller` enters `"loading"` -> `bridge.ts:130-138` calls `cancelPreview()` (cancelling `consumer`'s ticket), **without advancing `generation` in `bridge.ts`**. When the delayed `preview_game` call resolves, `generation === request` (`bridge.ts:214`) still passes; line `218` calls `controller.receivePreview(result)`, **clobbering newer `"loading"` / `"draft"` / `"acknowledged"` / `"conflict"` state to `"unavailable"`**, while `consumer?.receive(ticket, result)` returns `false` and leaves the controller stuck on `"unavailable"`.
   - In addition, `bridge.preview()` has no in-flight duplicate-click guard (`Widget.tsx:223` disables only on `state.status === "loading"`, which `bridge.preview()` never sets) and pulls `locale` exclusively from `app.getHostContext()?.locale` (`bridge.ts:197`).

---

## 5. Exact Next Independently Testable Task (Disjoint Downstream Scope)

### Scope & Invariants
- **Allowed Paths**: `extensions/src/mcp-app/widget/**`, `extensions/qa/mcp-widget/**` (and pure bridge unit check file inside `extensions/qa/mcp-widget/` or `extensions/src/mcp-app/tests/`).
- **Untouched / Preserved**: `extensions/src/mcp-app/contracts/**`, `packages/**`, `extensions/src/mcp-app/server/**`, `extensions/src/presentation/**`, `extensions/src/core/**`, V1 `PREVIEW_UNAVAILABLE` (`isError: true`), V2 `executableAcceptance: false`, `ui://tadazz/quiz-preview/v1.html`, and all ACK/edit-loss protections (`dirty`, `editRevision`, CAS `expectedRevision + 1`, `idempotencyKey`).

### Concrete Proposed Change
1. **Fix `bridge.preview()` & `toolresult` Candidate-First State Ordering + Race Cancellation (`extensions/src/mcp-app/widget/bridge.ts`)**:
   - Track an explicit preview-request guard/token invalidated both on `cancelPreview()` (including `controller` transitions into `["cancelled", "closed", "loading", "conflict", "acknowledged"]` and draft mutation clearing stale preview) and on overlapping `preview()` clicks (`inFlightPreview` single-flight guard so rapid clicks cannot race).
   - Check stale token **after** `await app.callServerTool("preview_game")` resolves before touching `controller` or `consumer`.
   - Validate V2 candidate metadata via `consumer.receive(ticket, result)` **before** falling back to `controller.receivePreview(result)` on non-candidate responses, eliminating the `"unavailable"` state flash and preventing stale `preview_game` responses from overwriting refreshed draft / ACK / conflict states.
   - Keep `hostLocale` synced across `hostcontextchanged` and local UI locale policy deterministically (preserving `inputs.preview_game` schema and consumer `locale === frame.locale` check).
2. **Add Real-SDK `preview_game` Tool Support to Local Host Harness (`extensions/qa/mcp-widget/host-entry.tsx`)**:
   - Extend `bridge.oncalltool` in `host-entry.tsx` to handle `name === "preview_game"`: verify `args.contractVersion === "0.1.0"`, `args.draftId === id`, `args.expectedRevision === revision`, and return a retained `PREVIEW_UNAVAILABLE` (`isError: true`) response with `_meta["tadazz/preview-candidate-v2"]` (or configurable tampered / stale-revision error modes for adversarial assertions) without altering frozen production contracts.

### Executable Deterministic Verification Proposal
1. **Unit Checks (`controller.nodecheck.ts` + widget bridge unit check under `node --test`)**:
   - *Happy path*: loaded `draft` -> `bridge.preview()` sends `inputs.preview_game` (`contractVersion: "0.1.0"`, `draftId`, `expectedRevision`, `locale`) -> `consumer.receive` accepts valid V2 candidate -> single transition to `status: "candidate"` with no intermediate `"unavailable"` notification and preserved `draft`.
   - *In-flight race protection*: start `bridge.preview()` -> start `controller.refresh()` or `controller.save()` (`status: "loading"` -> `"acknowledged"` / `"draft"`) before `preview_game` resolves -> verify stale `preview_game` resolution is ignored, `candidate` is not mounted, and `acknowledged` / `draft` / dirty local edit state is intact.
   - *Adversarial*: tampered `inputDigest`, mismatched `expectedRevision`, `toolcancelled`, `hostContext.toolInfo` teardown, and overlapping `preview()` double-invocation all fail closed (`unavailable` / cancelled) cleanly.
2. **Browser Checks (`extensions/qa/mcp-widget/browser.mjs` Chromium + WebKit against `host-entry.tsx`)**:
   - Real-SDK `<Widget>` (no `?fixture`) receives initial `toolinput` + `toolresult` -> calls `get_game_draft` -> user clicks the `Preview` button -> `bridge.oncalltool("preview_game")` executes -> ShadowRoot native candidate surface mounts inside real widget without `CandidateStage` fixture controls -> user edits title and clicks `Apply draft edit` -> ACK hides stale preview -> clicking `Preview` again after `revision + 1` mounts updated candidate; racing `preview_game` behind held `update_game_draft` preserves ACK without clobbering state.

> **Deferred Beyond Wave 1B**: Reusing `ScenePresenter` / `ApplicationPreviewStage` inside the MCP widget remains **not actionable inside `widget/`** until a separate manager-approved design revision defines a redacted chapter/scene wire contract, compliant asset/Lottie WASM delivery under MCP CSP, and a payload architecture under the 4 MiB UI limit.

---

## 6. Checks Run in This Isolated Worktree (`fd304840`)

No files in product directories or `packages/**` were modified, and no dependencies were installed in this read-only probe worktree. Observed command runs:

1. `node extensions/qa/tds-boundary.mjs`
   - **Exit Code**: `1`
   - **Observed Output**: Fails at `extensions/qa/tds-boundary.mjs:78` against historical baseline `fb6c7631999f33c8fb47638a99920e450f326fbf` with `23` `mismatches` under `packages/**` plus `denied` phase 1/2/3 downstream paths outside the older TDS-only allowlist (matching the baseline disclosure already documented in Phase 2 `00_PHASE_2_RESULT.md`).
2. `node --import file:///C:/Users/DAVID/Code/Razzia-worktrees/tadazz-one-agent-consolidation-20261116/extensions/node_modules/tsx/dist/loader.mjs --test extensions/qa/mcp-widget/controller.nodecheck.ts`
   - **Exit Code**: `1` (`0 pass, 1 fail`)
   - **Observed Output**: `ERR_MODULE_NOT_FOUND: Cannot find package 'zod' imported from ...\extensions\src\mcp-app\widget\controller.ts`, because `node_modules` is absent inside this isolated Cezar worktree (dependency installs and heavy browser/build runs were explicitly disallowed in this read-only probe).
