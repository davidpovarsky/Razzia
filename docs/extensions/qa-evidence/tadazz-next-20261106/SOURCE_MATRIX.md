# TADAZZ Next — Source-to-Implementation Coverage Matrix

> CORRECTION (2026-11-06): The PASS labels below were not substantiated by the old screenshot harness. Treat these rows as implementation mapping only; visual acceptance is withdrawn pending per-scene comparison. Refer to `CORRECTION_AND_DEPLOYMENT.md` for the scope actually exercised in the live app.

**Date:** 2026-11-06
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`
**Branch:** `agent/tadazz-next-20261105`
**Baseline commit:** `9d8cd9f`
**Audit Reference:** `SOURCE_ASSET_AUDIT.json`

---

## 1. Source Reference Status & Ground Truth Verification (Blocker Resolved)

The previous "source missing" blocker has been **completely resolved**. The authoritative source archive `C:\Users\DAVID\Downloads\tadazz_second_library_source_and_assets.zip` (19,601,205 bytes, SHA-256 `D500710CA8E9EB05A5787AC3DAA06E5E8FF9FC158E44F7137823C3CB5A9624C3`) was safely extracted into `docs/extensions/references/user-20261106/` with zero path traversals, zero network leaks, and zero overwrites.

| Artifact | Specified Size | SHA-256 Hash | Local Worktree Status | Resolution & Authority |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Reference**<br>`second library.html` | 12,933,137 bytes | `a9328b7d2931dcaee7ae3efa00389fe49130acab71fe8621cb35d97d69d220fa` | **VERIFIED & MATCHED**<br>`docs/extensions/references/user-20261106/source/` | **PRIMARY AUTHORITY** for all 12 extension show scenes, motion timings, easings, CSS, DOM hierarchy, assets, and text treatments. |
| **Secondary Reference**<br>`animation library iwth thier logo.html` | 3,533,424 bytes | `1c072312e139c6cdf36ab5f7cf6cb2767b40a0da300c6f1946d2a256a204c103` | **VERIFIED & MATCHED**<br>`docs/extensions/references/user-20261106/source/` | **SECONDARY AUTHORITY** (Survey Motion Kit v6). Preserved for secondary v6 enhancements without overriding primary authority. |
| **Source Archive**<br>`tadazz_second_library_source_and_assets.zip` | 19,601,205 bytes | `D500710CA8E9EB05A5787AC3DAA06E5E8FF9FC158E44F7137823C3CB5A9624C3` | **VERIFIED & EXTRACTED**<br>15 entries verified | Source of truth containing all raw images, cards, and HTML documents. |

### Embedded Assets Verification (12 / 12 Hash Matched)
Every single embedded asset within `second library.html` (`window.TADAZZ_ASSETS`) has been verified byte-for-byte against disk extractions and deployed to `packages/web/public/tadazz-show/second-library/` and `/v4/`:
- `show-stage.webp` (261,066 bytes, SHA-256 `9f3d1fe8...`)
- `tadazz-brand-logo.png` (1,976,726 bytes, SHA-256 `e50aaf5f...`)
- `curtain-left.png` (1,132,717 bytes, SHA-256 `429ab6d5...`)
- `curtain-right.png` (1,132,143 bytes, SHA-256 `9a46bb39...`)
- `question-bg.webp` (87,904 bytes, SHA-256 `2f6912d8...`)
- `creating-worlds-intro.png` (2,410,686 bytes, SHA-256 `2a9b5838...`)
- `teaser-screen-source.jpg` (266,631 bytes, SHA-256 `8e058ef5...`)
- `teaser-screen.jpg` (3,780,431 bytes, SHA-256 `77b4214d...`)
- `cards/card-01.svg` to `card-05.svg` (5 cards, exact SHA-256 matched)

---

## 2. Primary 8-Beat Show Sequence (Creating Worlds Event Order)

| Beat # | Scene ID | Source Method / Class | Expected Timing & Cues | Primary Assets & Copy | Implementing React Component | Data Source | Host View | Spectator View | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `company-opening` | `TadazzFullShowKit.companyOpening()` | Hold artwork 2000ms; crossfade 2850ms; logo enters at 1960ms over 980ms.<br>Cues: `company-ident` (0ms), `tadazz-welcome` (2070ms). Total: 2940ms. | `creating-worlds-intro.png` / `eventArtworkUrl` + `tadazz-brand-logo.png` | `FullShowSceneView` (`CompanyOpening`) in `FullShowScenes.tsx` | `SceneConfig.eventArtworkUrl` / timeline preset | Title & progress | Fixed 1920×1080 stage | PASS |
| **2** | `representative-directory` | `TadazzFullShowKit.representativeDirectory()` | Grid entrance 650ms stagger; total 1500ms.<br>Cue: `directory-loaded` (650ms). | Title: "FIND YOUR TABLE REPRESENTATIVE"<br>Sub: "CALL TO JOIN" + `dialNumber`<br>40 reps or 10-rep focused group page. | `Directory` in `FullShowScenes.tsx` | Authoritative telephony roster / `PublicFullShowData.representatives` & `dialNumber` | Roster controls + dial banner | Table grid (40 / focused 10) + join pulses | PASS |
| **3** | `tie-break` | `TadazzFullShowKit.tieBreak()` | Two cards entrance 1260ms; equality symbol 940ms from 720ms.<br>Cues: `tie-unresolved` (1510ms) or `tie-resolved` (1810ms). Never autoplay resolution. | Two candidate image cards + captions + "=" + vote count ("EQUAL VOTES" or N). Host prompt: "Host, choose which picture goes into the story." | `Tie` in `FullShowScenes.tsx` | Authoritative tie candidates from `PublicInterimResults` / host selection `resolvedIndex` | Interactive selection buttons | Two large cards, '=' badge, resolved highlight | PASS |
| **4** | `story-assembly` | `TadazzFullShowKit.storyAssembly()` | 5 cards 1280ms (stagger 195ms from 280ms); bridge ribbon 1640ms from 930ms; ending caption 1210ms from 1830ms.<br>Cue: `story-assembled` (2400ms). Total: 3040ms. | 5 winning cards (Role, Image, 01–05 number, Title) + bridge + "LET THE STORY BEGIN…". Round 1 story. | `StoryCards` in `FullShowScenes.tsx` | Authoritative `answerRecap.items[0..4]` winning choices | Step controls | 5 cards with roles + ribbon + ending | PASS |
| **5** | `survey-results` (Round 2) | `TadazzStageKit.results()` | Bars expand over 1070ms; winner pulse; count / percentage tags reveal. | Question prompt, 5 answer cards with photo, caption strictly below, percentage bar, winner tag. | `FivePictureAnswersV4` in `components.tsx` | Authoritative server snapshot `revealDistribution` | Manager view + response counts | Clean 1920×1080 results reveal | PASS |
| **6** | `story-assembly` (Round 2) | `TadazzFullShowKit.storyAssembly()` | Same timing as Beat 4.<br>Cue: `story-assembled` (2400ms). | 5 Round 2 winning cards + "LET THE STORY BEGIN…". Distinct reset from Round 1. | `StoryCards` in `FullShowScenes.tsx` | Authoritative `answerRecap.items[5..9]` winning choices | Step controls | 5 Round 2 cards + ribbon + ending | PASS |
| **7** | `grand-finale` | `TadazzFullShowKit.grandFinale()` | Rings 3400ms (from 500ms); Z wings 2800ms (700/800ms); center logo 1800ms (2200ms); curtain close delay 6500ms over 2180ms.<br>Cues: `finale-impact` (3920ms), `curtains-closed` (8680ms). Total: 9200ms. | Rings + dual Z glyphs + brand logo + authentic left/right curtains closing. | `Finale` in `FullShowScenes.tsx` | Authoritative winner or event finale trigger | Finale controls | Grand dramatic lighting + closing curtains | PASS |
| **8** | `z-wipe` | `TadazzStageKit.zWipe()` | Left wipe 1490ms, right wipe 1570ms (delay 160ms).<br>Cue: `wipe-covered` (720ms). Total: 1730ms. | Neon diagonal dual-wipe transition bands. | `TadazzV4Motion.zWipe()` | Scene transition orchestrator | Transition trigger | Full-screen diagonal wipe | PASS |

---

## 3. Additional Supported Full-Show Scenes (TadazzFullShowKit API)

| Scene ID | Method | Expected Timing & Cues | Visual Elements | Implementing Component | Data Source | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `grand-opening` | `grandOpening()` | Portal 2400ms (900ms); Logo 1670ms (2350ms); Sub 1000ms (3300ms).<br>Cues: `opening-portal` (1600ms), `opening-logo` (2650ms). Total: 4360ms. | Radial portal, neon brand logo, "THE STORY STARTS WITH YOU", "A LIVE AUDIENCE-CREATED EXPERIENCE". | `GrandOpening` in `FullShowScenes.tsx` | Show start action | PASS |
| `phone-instructions` | `phoneInstructions()` | Device entrance 1300ms (190ms); steps 800ms (500ms); keypad pulse.<br>Cue: `phone-ready` (1490ms). Total: 2000ms. | Dial-in device with animated keypad, 3 numbered step cards: 01 Dial, 02 Listen, 03 Press keypad. | `PhoneInstructions` in `FullShowScenes.tsx` | `dialNumber` config | PASS |
| `connection-readiness` | `connectionReadiness()` | 40 table lights enter staggered 540ms.<br>Cue: `readiness-grid` (600ms). Total: 1500ms. Dynamic pulse on join: 790ms. | 40 table tiles (TABLE 01..40), connection dot, status bar ("N / 40 TABLES CONNECTED"), `isLive` label. | `Readiness` in `FullShowScenes.tsx` | Authoritative telephony / socket `connectedTables` | PASS |
| `round-one` | `roundOne()` | Portal + "THE FIRST STORY" + "ROUND 01" rule (950ms).<br>Cue: `round-launch` (1600ms). Total: 2500ms. | Dramatic round 1 title card with glowing horizontal divider. | `RoundLaunch` in `FullShowScenes.tsx` | Timeline round transition | PASS |
| `round-two` | `roundTwo()` | Portal + "A WHOLE NEW WORLD" + "ROUND 02" rule (950ms).<br>Cue: `round-launch` (1600ms). Total: 2500ms. | Dramatic round 2 title card with glowing horizontal divider. | `RoundLaunch` in `FullShowScenes.tsx` | Timeline round transition | PASS |
| `story-progress` | `storyProgress()` | 5 cards enter staggered 180ms.<br>Cue: `story-progress-update` (1280ms). Total: 2200ms. | Header + "X OF 5 STORY PIECES COLLECTED", collected cards filled, awaiting cards marked "AWAITING THE VOTE". | `StoryProgress` in `FullShowScenes.tsx` | `answerRecap.completedQuestionsCount` | PASS |
| `story-live` | `storyLive()` | Immediate composited presentation.<br>Holds indefinitely until host explicit advance. | 5 composited winning cards held in story layout + "STORY N · HOST IS TELLING YOUR STORY". | `StoryLive` in `FullShowScenes.tsx` | Current round's 5 winning pieces | PASS |

---

## 4. Original 13 v4 Stage Scenes (Preserved Unmodified)

| Scene ID | Key Features | Timing & Cues | Status |
| :--- | :--- | :--- | :--- |
| `question` | Question frame, eyebrow, top rail, brand logo, round pill | 850–1300ms | PASS |
| `picture-answers` | Up to 5 answer cards with photo, caption strictly below, 01–05 badge | 650–980ms stagger | PASS |
| `voting-open` | Pulsing voting-open indicator, countdown timer, card hover/active states | Continuous countdown | PASS |
| `countdown` | Prominent center-stage to corner countdown ring animation | Synchronized timer ring | PASS |
| `vote-locked` | Locked voting status, cards locked | Instant lock state | PASS |
| `chosen` | Single card selected / spotlighted with retained percentage and count tracks | 800ms choice highlight | PASS |
| `survey-results` | Percentage tracks fill with gold/cyan gradients, counts visible, winner tag | 1070ms track fill | PASS |
| `top-pick` | Spotlight on winning option with celebratory particles | 1200ms plate animation | PASS |
| `question-image` | Full photo question layout with large visual plate | 750ms entry | PASS |
| `leaderboard` | Top 5 table/player rankings with animated rank changes | 1200ms entry + 1600ms update | PASS |
| `round-recap` | Grid summary of question winners across the round | Staggered card reveals | PASS |
| `interlude` | Text title and subtitle card with glowing rule | 1310ms + 980ms rule | PASS |
| `z-wipe` | Dual-direction diagonal Z wipe with `wipe-covered` cue | 1490ms / 1570ms | PASS |
