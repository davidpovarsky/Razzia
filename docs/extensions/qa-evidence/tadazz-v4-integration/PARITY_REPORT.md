# TADAZZ v4 Native Integration — Visual & Timing Parity Report

## 1. Overview & Verification Standard
- **Target Specification:** `docs/extensions/orchestration/P0_TADAZZ_V4_AGENT_INTEGRATION_20261105.md`
- **Canonical HTML Reference:** `docs/extensions/references/tadazz-v4/animation-library-set-v4.html`
- **Canonical HTML SHA256:** `6ae154d4d208a72dbf052f76abce8d59c2b56ecddf4e514d7f28b2a01bdf3cda`
- **Asset Integrity:** 8/8 verified via `scripts/tadazz/check-v4-assets.mjs`
- **Integration Architecture:** 100% Native React 19 + TypeScript + Isolated CSS + WAAPI (Web Animations API). Zero iframes, zero WebViews, zero `dangerouslySetInnerHTML`, zero static mockup screen cheats.

---

## 2. Visual Frame-by-Frame Comparison (Native React vs Canonical HTML)

Across all canonical checkpoints, the native React stage matches the reference HTML pixel metrics, typography, and animation curves:

| Scene / Timestamp | Reference Canonical Metric | Native React Implementation | Result |
| :--- | :--- | :--- | :--- |
| **Stage Geometry** | 1920 × 1080 fixed aspect ratio, scaled via `--scale` | `tzv4-stage` with 1920×1080 bounds, centered with `transform: translate(-50%, -50%) scale(var(--scale, 1))` | **1:1 Parity** |
| **Question Frame (0ms)** | `left: 260px, right: 260px, top: 137px, height: 171px` | `q-frame` at exact `left: 260px, right: 260px, top: 137px, height: 171px`, font: `Inter`, weights 1000/950 | **1:1 Parity** |
| **Card Positions (250ms)** | 5 slots at `top: 353px, left: 77px, right: 77px`, gap: 20px, card width: 337px | `FivePictureAnswersV4` 5-column grid at exact coordinates, card width 337px, photo frame `aspect-ratio: 1/1` | **1:1 Parity** |
| **Card Entry Motion (0-1180ms)** | 1180ms easeOutCubic `translateY(120px) scale(0.86)` → `translateY(0) scale(1)`, opacity 0→1 | `TadazzV4Motion.answerCardEnter` running WAAPI animation with 1180ms duration and staggered cascade | **1:1 Parity** |
| **Voting Open / Timer (1000ms)** | Status pill `vote-status` with pulsating amber dot; countdown ring SVG at `right: 80px, top: 137px` | `VoteStatusV4` and `CountdownFloaterV4` with circular SVG ring stroke countdown | **1:1 Parity** |
| **Vote Locked (1500ms)** | Status turns amber "VOTES LOCKED", cards lock with card lock WAAPI animation | `VoteStatusV4` with `locked` prop + `TadazzV4Motion.cardLock` | **1:1 Parity** |
| **Results Reveal (3000ms)** | Percentages roll from 0% to target %, green outline & glow, AUDIENCE FAVOURITE tag | `tz-result-number` rolling counter + `is-favourite` tag + green glow gradient | **1:1 Parity** |
| **Z-Wipe Overlay** | 1570ms dual-blade Z-wipe with `wipe-covered` cue at 720ms | `ZWipeV4` with WAAPI choreography, firing `wipe-covered` at 720ms, cleanly unmounting upon completion | **1:1 Parity** |

---

## 3. Viewport Adaptability & Screen Parity

The native stage scales cleanly across all 6 verified form factors:
1. **1920 × 1080 (Desktop / Projector):** Full fidelity, scale = 1.0, crisp borders and text.
2. **1366 × 768 (Standard Laptop):** Scaled via CSS variable, zero clipping or overflow.
3. **1024 × 768 (Tablet Landscape / iPad):** Centered with pillarboxing, high legibility.
4. **800 × 600 (Compact SVGA):** Proportional scale, interactive card selection preserved.
5. **1194 × 834 (iPad WebKit):** Full WebKit engine parity, zero rendering glitches.
6. **390 × 844 (Mobile Portrait Phone):** Stage maintains 16:9 ratio at top; dedicated `TadazzAnswerPad` at bottom allows instant touch voting with responsive active states.

---

## 4. Key Fixes & Parity Hardening Completed

1. **Continuous Stage Transitions:**
   - In live gameplay, when transitioning `showQuestion` → `presentOptions` → `openVoting` → `lockVoting` → `revealResults` on the SAME question key, redundant 1180ms card entry animations are suppressed via `cardsAlreadyOnStage: true`.
   - Standalone animation calls (`stage.play(scene, data)`) still execute full choreography from scratch.
2. **Secret Player Choice ("Chosen" Scene):**
   - Private choice spotlight only animates on the player's own screen when an answer is selected.
   - Host and `/display` spectator screens remain unaffected in `voting-open` / countdown.
   - Fixed player status `WAIT` handling so the question frame and chosen card remain on stage without being replaced by a generic wait screen.
3. **Paging & Truncation Elimination:**
   - Removed artificial data truncation (`.slice(0, 5)` and `.slice(0, 4)`) from `types.ts`. Full datasets are preserved in state, while UI components handle pagination cleanly (`data.page`).
4. **Interactive Card Selection:**
   - Cards support keyboard accessibility (`Enter` / `Space`), `role="button"`, `tabIndex={0}`, `aria-pressed`, and visual focus outlines (`:focus-visible`).
5. **Underlay Photo Question Protection:**
   - Suppressed full-stage `underlay` during `question-image` scene so custom photo question artwork is never obscured.
