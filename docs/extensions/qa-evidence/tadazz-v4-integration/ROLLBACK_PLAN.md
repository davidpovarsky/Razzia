# TADAZZ v4 Native Integration — Rollback Plan & Compatibility Matrix

## 1. Rollback Mechanism
The integration preserves complete backward compatibility and provides two instantaneous rollback tiers:

### Tier 1: Per-Show Rollback via Configuration (`motionKit`)
Each show or quiz can independently configure its motion kit in `studioTimelineDefaults.motionKit` (or show extras):
- `"tadazz-v4"` (Default): Active native TADAZZ v4 React + WAAPI presentation stage.
- `"goldy-20261105"`: Uses the previous working `TadazzStage` implementation with motion engine.
- `"legacy"`: Bypasses the TADAZZ stage entirely and falls back to vanilla Razzia UI components.

Implementation in `TadazzShowView.tsx`:
```tsx
const useV4 = isTadazzV4Active(extensionState)

{useV4 ? (
  <TadazzV4StageAdapter ref={stageRef} ... />
) : (
  <TadazzStage ref={stageRef} ... />
)}
```
Where `isTadazzV4Active(envelope)` returns `false` if `defaults.motionKit === "goldy-20261105"` or `defaults.motionKit === "legacy"`.

### Tier 2: Instant Code Rollback
If a full code-level revert is ever requested:
1. Revert `TadazzShowView.tsx` to unconditionally render `<TadazzStage>`.
2. The `TadazzStage` component remains completely untouched and functional in `extensions/src/presentation/tadazz-show/TadazzStage.tsx`.
3. All existing quiz data and timeline schemas remain valid (`"goldy-20261105"` and `"legacy"` are preserved in `studioTimelineSchema`).

---

## 2. Compatibility Matrix

| Feature / System | Status under TADAZZ v4 | Verification Evidence |
| :--- | :--- | :--- |
| **Opening Cinematic** | Fully operational (MP4 + Lottie) | Gate A01/A02 passed in Playwright |
| **Lobby & Registration** | Fully operational (PIN, QR, names) | Gate A03 passed in Playwright |
| **Host Controls & Toolbar** | Fully operational (Next, Exit, Players modal) | Verified in `tadazz-full-show-parity.spec.ts` |
| **Telephony Integration** | Fully operational (Real Hono + Socket.IO) | 100 concurrent callers test passed (0% failure) |
| **Spectator / Projector (`/display`)** | Fully operational (mirrors stage, omits footer) | Gate A14/A15 verified in Playwright |
| **Interactive Voting (Desktop/Tablet)** | Fully operational (direct card click & keypress) | Verified on Alice & Bob viewports |
| **Interactive Voting (Mobile Phone)** | Fully operational (dedicated `TadazzAnswerPad`) | Verified on Dana (390×844) viewport |
| **Leaderboard & Ranks** | Fully operational (supports >4 teams, individual/team mode) | Gate A10 passed in Playwright |
| **Round Recap & Story Finale** | Fully operational (mapped to `RoundRecapV4`) | Verified in unit tests & show director |
| **8 Locales Parity** | 100% complete (`en`, `fr`, `de`, `es`, `it`, `ja`, `tr`, `vi`) | `locales.test.ts` passed (9/9) |
