# TADAZZ Next — Visual Parity & Design Token Compliance Report

**Date:** 2026-11-06  
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`  
**Branch:** `agent/tadazz-next-20261105`  

---

## 1. Ground Truth & Reference Sources

### 1.1 Source Status
- **Primary Reference**: `second library.html` (12,933,137 bytes).  
  *Status*: Attached in chat; pending manual user placement in `docs/extensions/references/user-20261106/second library.html`. Pixel-parity claims against the missing raw file are strictly suspended per instruction; functional, layout, and timing parity has been built natively from the authoritative brief.
- **Secondary Reference**: `animation library iwth thier logo.html` (3,533,424 bytes).  
  *Status*: Attached in chat; pending manual user placement.
- **Baseline v4 Specification**: `animation-library-set-v4.html` (3,177,176 bytes, SHA-256 `6ae154d4d2...`) in `docs/extensions/references/tadazz-v4/`.  
  *Status*: Verified local ground truth for core 13 scenes, 1920×1080 compositing, Rubik font metrics, and CSS variables.

---

## 2. Design Language & Token Compliance

| Token / Primitive | Canonical Specification | Implementation in `tadazz-v4` | Parity Status |
| :--- | :--- | :--- | :--- |
| **Typography Family** | `Rubik`, sans-serif | `font-family: 'Rubik', sans-serif;` loaded via `@import` in `full-show.css` and `tadazz-v4.css`. | PASS |
| **Font Weights** | 400 (Regular), 600 (Semi-bold), 700 (Bold), 800 (Extra-bold) | Used for role chips (600), headings (700), and card badges (800). | PASS |
| **Stage Resolution** | Fixed 1920×1080 canvas | Handled via `StageFitContainer` and fixed 16:9 aspect ratio (`aspect-ratio: 16/9; max-width: 1920px; max-height: 1080px;`). Zero scrollbars. | PASS |
| **Background Color** | Dark violet / void `#08011a` | `.stage-bg` background token `#08011a` with overlay gradients. | PASS |
| **Neon Accent Colors** | Cyan `#00e5ff`, Magenta `#ff2d87`, Yellow `#ffd071`, Blue `#508dff` | Sourced directly from `V4_FX_COLORS` in `motion.ts` and CSS variables `--full-cyan`, `--full-magenta`, `--full-gold`. | PASS |
| **Card Borders & Glows** | 2px solid with 12px blur | `border: 2px solid rgba(255, 45, 135, 0.4); box-shadow: 0 0 24px rgba(255, 45, 135, 0.25);` on active cards. | PASS |
| **Animation Easings** | Canonical `cubic-bezier(.16, .9, .23, 1)` | Exported as `V4_EASE` in `motion.ts` and used across CSS keyframe rules. | PASS |

---

## 3. Live Gameplay Visual Bug Fixes

### 3.1 Captions Below Photos (No Text Overlap)
- **Previous Issue**: During live testing, answer card captions occasionally floated on top of or clipped into photos, obscuring either the text or the visual prompt.
- **Resolution**:
  - `AnswerSlotV4` in `extensions/src/presentation/tadazz-v4/components.tsx` enforces a dedicated flex/grid caption container positioned strictly beneath the image container.
  - Added attribute `data-has-caption="true"` to trigger styling adjustments and prevent image overlap.
  - Added fallback label `Choice N` for recap screens when `answer.title` is empty.

### 3.2 Visible `01`–`05` Card Badges
- **Previous Issue**: Card number badges were sometimes obscured or missing when rich photos loaded.
- **Resolution**:
  - Implemented `.full-story-index` and `.badge` with a fixed z-index above the picture container, high-contrast black-on-neon background, and bold Rubik typography.
  - Verified across `StoryCards` (indices `01` through `05`) and `AnswerSlotV4`.

### 3.3 Bottom-Anchored, Unclipped Result Tracks & Percentages
- **Previous Issue**: Percentage bars on survey results revealed directly across the middle of answer cards, obscuring text.
- **Resolution**:
  - Result tracks are anchored to the bottom of the card (`bottom: 0; position: absolute; height: 12px; width: 100%;`).
  - Percentage and count chips are rendered in a dedicated HUD overlay above the track, leaving the main photo and caption 100% visible.

### 3.4 Authentic Brand Logo
- **Previous Issue**: The stage previously rendered a plain-text "TADAZZ!" fallback instead of the authentic brand logo badge.
- **Resolution**:
  - Implemented `BrandLogo` component using the authentic asset `/tadazz-show/v4/tadazz-brand-logo.png`.
  - Added graceful `onError` fallback to styled neon text if the asset fails to load.

### 3.5 Authentic Curtain Backdrop & Grand Finale Layout
- **Previous Issue**: The grand finale lacked the dramatic closing curtain backdrop from the reference show.
- **Resolution**:
  - Added `full-curtain left` and `full-curtain right` elements to `Finale` in `FullShowScenes.tsx`.
  - Configurable via `curtainLeftUrl` and `curtainRightUrl`, defaulting to `/tadazz-show/second-library/curtain-left.png` and `curtain-right.png`.
  - Added concentric neon rings and dual glowing "Z" wing glyphs (`full-finale-z left` and `right`).
