# TADAZZ Next — Architecture & Implementation Report

**Date:** 2026-11-06  
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`  
**Branch:** `agent/tadazz-next-20261105`  
**Author:** Antigravity AI Engineering  
**Baseline Git Remote:** `davidpovarsky/Razzia`  
**Protected Baseline:** Commit `5161eb7022144ee26d46a5f94cdbc714ec8b560d`  

---

## 1. Executive Summary & Architecture Overview

The TADAZZ "Creating Worlds" full-show motion system has been completely integrated and verified directly on top of the native React and Web Animations API (WAAPI) engine (`tadazz-v4`). This replaces simulated iframe embeds and HTML interpreters with clean, modular, and type-safe components.

### Core Architectural Pillars
1. **Native React & WAAPI (Zero Iframe / Zero HTML Interpreters)**:
   Every visual scene is rendered through standard React 19 JSX components with hardware-accelerated CSS and WAAPI animations. The DOM structure strictly preserves the canonical 1920×1080 stage resolution without horizontal or vertical scrollbars.
2. **Authoritative Timeline & Scene Data**:
   Full-show data fields (`round`, `completed`, `dialNumber`, `connectedTables`, `representatives`, `winners`, `contestants`, `voteCount`, `resolvedIndex`, `eventArtworkUrl`, `curtainLeftUrl`, `curtainRightUrl`, `groupPage`, `storyRoles`) are formally validated in `extensions/src/core/studio-timeline-schema.ts` and passed through `ActiveSceneData.fullShow` without being stripped or dropped.
3. **Reactive State Updates Without Remounting**:
   The stage exposes an `updateFullShowData(patch)` imperative handle via `TadazzStageHandle` and `TadazzV4StageAdapter`. Live incoming phone calls and table connections update the DOM in place (e.g. triggering `@keyframes full-join-pulse`) without restarting running WAAPI animations or remounting the stage.
4. **Upstream Source Protection & Complete Isolation**:
   No core Razzia upstream files under `packages/**` were altered for business logic. Changes are confined entirely to `extensions/**` and public static assets under `packages/web/public/tadazz-show/`. Live production (`https://tadazz.com`) and the reference worktree `tadazz-full-show` remain untouched.

---

## 2. Component & File Implementation Details

### 2.1 Timeline Schema & State Contract
- **File**: `extensions/src/core/studio-timeline-schema.ts`
- **Enhancements**:
  - Extended `animationSceneSchema` with full-show fields:
    - `round`: integer 1..10
    - `completed`: integer 0..10 (number of collected story cards)
    - `dialNumber`: phone dial-in string (e.g. `079-999-9999`)
    - `connectedTables`: array of connected table numbers (1..100)
    - `representatives`: array of `{ table: number, name: string }`
    - `winners` / `contestants`: array of `{ title: string, imageUrl?: string, alt?: string }`
    - `voteCount`: integer count of votes cast
    - `resolvedIndex`: nullable integer (host's chosen winner in tie-breaks)
    - `eventArtworkUrl`, `curtainLeftUrl`, `curtainRightUrl`: safe media URL strings
    - `groupPage`: integer 0..4 (0 = 40 tables; 1..4 = 10 focused tables)
    - `storyRoles`: array of 5 custom role strings
  - Extended `ActiveSceneData` interface with `fullShow?: PublicFullShowData | null`.

### 2.2 Safe Media URL Validation
- **File**: `extensions/src/core/media.ts`
- **Enhancement**:
  - Updated `isSafeMediaUrl` to recognize `/tadazz-show/` root-relative paths alongside `/media/` and `/sounds/`, while maintaining strict anti-traversal checks (`!trimmed.includes("..")`).

### 2.3 React Full-Show Scene Components
- **File**: `extensions/src/presentation/tadazz-v4/FullShowScenes.tsx`
- **Scenes Implemented**:
  1. `CompanyOpening`: Displays event artwork (`creating-worlds-intro.png` or `eventArtworkUrl`) with brand ident badge.
  2. `GrandOpening`: Radial portal background, glowing Tadazz brand logo, title, and subtitle.
  3. `Directory`:
     - Group 0: Full 40-table grid (tables 01–40) with connection statuses and join pulses.
     - Groups 1–4: Focused 10-table pages (e.g., Group 1 = tables 01–10).
  4. `PhoneInstructions`: Dial-in device graphic, keypad pulses, and step-by-step instructions.
  5. `Readiness`: Table readiness grid, connection count indicator, and live connection bar.
  6. `RoundLaunch` (`round-one`, `round-two`): Cinematic round banners with glowing horizontal divider rule.
  7. `StoryCards`:
     - 5-card layout with role chips ("THE THREAT", "THE MISSION", "THE TWIST", "THE CLIMAX", "THE RESOLUTION").
     - Distinct `01` through `05` card badges.
     - Cards beyond `completed` show "AWAITING THE VOTE" empty state.
     - Completed cards display winning option artwork and title.
  8. `Tie`:
     - Shows two tied candidate cards with "=" badge and equal vote counts.
     - When unresolved: prompts "Host, choose which picture goes into the story."
     - When resolved via `resolvedIndex`: marks winning card `chosen` and other card `muted`, displaying "CHOICE SELECTED".
  9. `StoryAssembly`: 5 winning cards assembled with connecting ribbon and "LET THE STORY BEGIN…".
  10. `StoryLive`: Persistent held stage view during live host narration.
  11. `Finale`: Authentic curtain backdrop (left and right), concentric neon rings, dual "Z" wing glyphs, and Tadazz brand logo.
  12. `BrandLogo`: High-resolution logo component sourcing `/tadazz-show/v4/tadazz-brand-logo.png` with text fallback.

### 2.4 Styling & Hardware-Accelerated Animations
- **File**: `extensions/src/presentation/tadazz-v4/full-show.css`
- **Rules Added**:
  - `.full-brand-badge` and `.full-brand-img`: Neon styling and layout for brand identity.
  - `.full-directory-focused`: Layout adjustment for 10-table group views.
  - `.full-story-index`: Glowing `01`–`05` card indices.
  - `.full-tie-index`: Badges for candidate cards.
  - `@keyframes full-join-pulse`: 790ms scale/glow pulse triggered when a table joins.

### 2.5 Native WAAPI Choreography & Clock Mechanism
- **File**: `extensions/src/presentation/tadazz-v4/motion.ts`
- **Choreography Engine**:
  - Implemented `holdScene(durationMs)` using a DOM clock element animated via native WAAPI, ensuring accurate tracking of active animations, pause, resume, and completion promises.
  - Dispatched all canonical cues at exact millisecond offsets:
    - `company-ident` (0ms) & `tadazz-welcome` (2070ms)
    - `opening-portal` (1600ms) & `opening-logo` (2650ms)
    - `directory-loaded` (650ms)
    - `phone-ready` (1490ms)
    - `readiness-grid` (600ms)
    - `round-launch` (1600ms)
    - `story-progress-update` (1280ms)
    - `tie-unresolved` (1510ms) / `tie-resolved` (1810ms)
    - `story-assembled` (2400ms)
    - `story-live-hold` (900ms)
    - `finale-impact` (3920ms) & `curtains-closed` (8680ms)
  - `reducedMotion: true` provides an instant resolution path for accessibility and automated testing.

### 2.6 Player & Display Stage Visual Bug Fixes
- **File**: `extensions/src/presentation/tadazz-v4/components.tsx`
- **Fixes Applied**:
  - `AnswerSlotV4`: Cleanly falls back to `answer.title || answer.alt || answer.label || (recap ? 'Choice N' : '')` without rendering empty captions.
  - Added `data-has-caption="true"` to prevent photo clipping.
  - Preserved `01`–`05` card badges and bottom-anchored percentage tracks.

### 2.7 Transition Director & Stage Adapter
- **Files**: `extensions/src/presentation/tadazz-show/show-director.ts`, `TadazzStage.tsx`, `TadazzV4StageAdapter.tsx`
- **Integration**:
  - Updated `planTransition` to inject `activeSceneData?.fullShow` and compute authoritative `isLive` status.
  - Wired `updateFullShowData` to `v4Ref.current.patchData` on the stage handle.

---

## 3. Static Asset Manifest

| Asset Name | Source Path | Target Public Paths | Size | SHA-256 |
| :--- | :--- | :--- | :--- | :--- |
| `teaser screen.jpg` | `tadazz-full-show/docs/extensions/orchestration/prompts/assets/` | `packages/web/public/tadazz-show/second-library/teaser-screen.jpg`<br>`packages/web/public/tadazz-show/v4/teaser-screen.jpg` | 3,780,431 bytes | `77b4214d75bbb2c3f61af285b0aca09678bbc78d217c47c904fb5e082eddf34d` |
| `tadazz-brand-logo.png` | Pre-existing in v4 | `packages/web/public/tadazz-show/v4/tadazz-brand-logo.png` | 27,270 bytes | `9a756b107e05fc9fe01460773d4d31481b22db9ff78bc70c64ff3f3a8bce6995` |
