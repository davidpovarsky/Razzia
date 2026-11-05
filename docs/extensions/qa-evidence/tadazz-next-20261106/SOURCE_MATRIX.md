# TADAZZ Next — Source-to-Implementation Coverage Matrix

**Date:** 2026-11-06  
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`  
**Branch:** `agent/tadazz-next-20261105`  
**Baseline commit:** `ef4535a5ace49c0232ef36b15f376e5ea9227249`  

---

## 1. Source Reference Status & Ground Truth Blocker Record

| Artifact | Specified Size | Specified Title / Hash | Local Worktree Status | Resolution / Action Required |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Reference**<br>`second library.html` | 12,933,137 bytes | *TADAZZ! × Creating Worlds — Complete Show Motion System* | **BLOCKED**<br>(Attached in ChatGPT conversation; not yet saved to local filesystem) | Awaiting user placement in `docs/extensions/references/user-20261106/second library.html`. Pixel-parity claims against missing raw HTML held pending upload; functional/timing parity implemented natively from canonical spec. |
| **Secondary Reference**<br>`animation library iwth thier logo.html` | 3,533,424 bytes | *TADAZZ • Survey Motion Kit v6*<br>Stripped SHA-256: `73c2a18991...` | **BLOCKED**<br>(Attached in ChatGPT conversation; not yet saved to local filesystem) | Awaiting user placement in `docs/extensions/references/user-20261106/`. |
| **Verified v4 Baseline**<br>`animation-library-set-v4.html` | 3,177,176 bytes | SHA-256: `6ae154d4d2...`<br>Original 8 embedded assets | **VERIFIED LOCAL**<br>`docs/extensions/references/tadazz-v4/` | Authoritative source for 13 baseline scenes, tokens, and core assets. |
| **Teaser Screen Asset**<br>`teaser screen.jpg` | 3,780,431 bytes | SHA-256: `77b4214d75bbb2c3f61af285b0aca09678bbc78d217c47c904fb5e082eddf34d` | **EXTRACTED**<br>`packages/web/public/tadazz-show/second-library/` | Copied and verified. |

---

## 2. Primary 8-Beat Show Sequence (Creating Worlds Event Order)

| Beat # | Scene ID | Source Method / Class | Expected Timing & Cues | Primary Assets & Copy | Implementing React Component | Data Source | Host View | Spectator View | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `company-opening` | `TadazzFullShowKit.companyOpening()` | Hold artwork 2000ms; crossfade 2850ms; logo enters at 1960ms over 980ms.<br>Cues: `company-ident` (0ms), `tadazz-welcome` (2070ms). Total: 2940ms. | `creating-worlds-intro.png` / `eventArtworkUrl` + `tadazz-brand-logo.png` | `FullShowSceneView` (`CompanyOpening`) in `FullShowScenes.tsx` | `SceneConfig.eventArtworkUrl` / timeline preset | Title & progress | Fixed 1920×1080 stage | PASS |
| **2** | `representative-directory` | `TadazzFullShowKit.representativeDirectory()` | Grid entrance 650ms stagger; total 1500ms.<br>Cue: `directory-loaded` (650ms). | Title: "FIND YOUR TABLE REPRESENTATIVE"<br>Sub: "CALL TO JOIN" + `dialNumber`<br>40 reps or 10-rep focused group page. | `Directory` in `FullShowScenes.tsx` | Authoritative telephony roster / `PublicFullShowData.representatives` & `dialNumber` | Roster controls + dial banner | Table grid (40 / focused 10) + join pulses | PASS |
| **3** | `tie-break` | `TadazzFullShowKit.tieBreak()` | Two cards entrance 1260ms; equality symbol 940ms from 720ms.<br>Cues: `tie-unresolved` (1510ms) or `tie-resolved` (1810ms). Never autoplay resolution. | Two candidate image cards + captions + "=" + vote count ("EQUAL VOTES" or N). Host prompt: "Host, choose which picture goes into the story." | `Tie` in `FullShowScenes.tsx` | Authoritative tie candidates from `PublicInterimResults` / host selection `resolvedIndex` | Interactive selection buttons | Two large cards, '=' badge, resolved highlight | PASS |
| **4** | `story-assembly` | `TadazzFullShowKit.storyAssembly()` | 5 cards 1280ms (stagger 195ms from 280ms); bridge ribbon 1640ms from 930ms; ending caption 1210ms from 1830ms.<br>Cue: `story-assembled` (2400ms). Total: 3040ms. | 5 winning cards (Role, Image, 01–05 number, Title) + bridge + "LET THE STORY BEGIN…". Round 1 story. | `StoryCards` in `FullShowScenes.tsx` | Authoritative `answerRecap.items[0..4]` winning choices | Step controls | 5 cards with roles + ribbon + ending | PASS |
| **5** | `survey-results` (Round 2) | `TadazzStageKit.results()` | Bars expand over 1070ms; winner pulse; count / percentage tags reveal. | Question prompt, 5 answer cards with photo, caption, percentage bar, winner tag. | `FivePictureAnswersV4` in `components.tsx` | Authoritative server snapshot `revealDistribution` | Manager view + response counts | Clean 1920×1080 results reveal | PASS |
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
| `story-live` | `storyLive()` | Immediate composited presentation.<br>Cue: `story-live-hold` (900ms). Holds until explicit advance. | 5 composited winning cards held in story layout + "STORY N · HOST IS TELLING YOUR STORY". | `StoryLive` in `FullShowScenes.tsx` | Current round's 5 winning pieces | PASS |

---

## 4. Original 13 v4 Stage Scenes (Preserved Unmodified)

| Scene ID | Key Features | Timing & Cues | Status |
| :--- | :--- | :--- | :--- |
| `question` | Question frame, eyebrow, top rail, brand logo, round pill | 850–1300ms | PASS |
| `picture-answers` | Up to 5 answer cards with photo, caption, 01–05 badge | 650–980ms stagger | PASS |
| `voting-open` | Pulsing voting-open indicator, countdown timer, card hover/active states | Continuous countdown | PASS |
| `countdown` | Prominent center-stage to corner countdown ring animation | Synchronized timer ring | PASS |
| `vote-locked` | Locked voting status, cards locked | Instant lock state | PASS |
| `chosen` | Single card selected / spotlighted | 800ms choice highlight | PASS |
| `survey-results` | Percentage tracks fill with gold/cyan gradients, counts visible, winner tag | 1070ms track fill | PASS |
| `top-pick` | Spotlight on winning option with celebratory particles | 1200ms plate animation | PASS |
| `question-image` | Full photo question layout with large visual plate | 750ms entry | PASS |
| `leaderboard` | Top 5 table/player rankings with animated rank changes | 1200ms entry + 1600ms update | PASS |
| `round-recap` | Grid summary of question winners across the round | Staggered card reveals | PASS |
| `interlude` | Text title and subtitle card with glowing rule | 1310ms + 980ms rule | PASS |
| `z-wipe` | Dual-direction diagonal Z wipe with `wipe-covered` cue | 1490ms / 1570ms | PASS |
