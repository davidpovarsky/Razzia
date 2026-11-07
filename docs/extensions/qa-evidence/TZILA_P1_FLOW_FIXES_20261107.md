# Tzila P1: Clean start, single question, single results reveal, stable timer

Date: 2026-11-07
Project: `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`
Branch: `agent/tadazz-next-20261105`

## Root causes verified in code

1. `RoundManager.newQuestion()` sent `SHOW_PREPARED`, then `SHOW_QUESTION` with zero answer cards, and only later `SELECT_ANSWER` with five picture cards. Both previews were visible on the stage and could mix old/new question metadata.
2. The Creating Worlds authored timeline included an additional `interimResults` scene after each of the ten questions, despite the normal server `SHOW_RESPONSES` reveal.
3. The browser reopened the v4 countdown animation when a fresh `COOLDOWN` synchronization event arrived, even if the same question was already voting.
4. Several pre-show scenes repeated the artwork, logo, directory and connection instructions after Start Game. Four 10-table directory pages were previously removed; the full list still did not appear in the join lobby.

## Implemented source changes

- **Pre-show sequence:** clean original Creating Worlds artwork first (temporary overlay), then TADAZZ motion branding and game background, then an integrated public join lobby containing six-digit PIN, QR, 40 representatives in four columns, real-time connected indicators, and a large dial-in field. The phone number is read from authored directory scene metadata and is **not invented** when unconfigured.
- **No duplicate introductions:** Starting the game jumps to `round-one` directly, without `company-opening`, `grand-opening`, duplicated `representative-directory`, `phone-instructions` or `connection-readiness` timeline screens. The settings-only representative-directory scene is retained for phone-number configuration.
- **One question screen:** Creating Worlds mode skips the legacy `SHOW_PREPARED` and `SHOW_QUESTION` preview statuses and immediately broadcasts the five-card `SELECT_ANSWER`. Other quiz types retain their existing preview behavior.
- **Question graphics synchronization:** For Creating Worlds, per-question extension state is broadcast before the question status; `SELECT_ANSWER` initializes correct per-question metadata even though `SHOW_QUESTION` is omitted.
- **One results reveal:** No authored `interimResults` screens. Normal server results display with the correct five cards/percentages for five seconds (independent of global manual auto-advance configuration), then advance through genuine tie resolution when necessary to `top-pick` and `story-progress`.
- **Single visual timer entrance:** Incoming countdown synchronization patches an existing voting display rather than replaying its entrance.
- **Previous commit** `ca6d79a`: removed duplicated top answer-number badges, enabled soundtrack loops and stopped stale manual track overrides.

## Verified data migration

Command (on Windows, `py -3`, not the nonfunctional `python` launcher):
```powershell
py -3 scripts/patch-tzila-presentation-config.py --source work/successor-release-extras.json --output work/tzila-51-steps-20261107.json
```

- Original Tzila sidecar timeline: **70 steps**
- Updated sidecar timeline: **51 steps**
- **10 / 10 question IDs unchanged**
- **40 / 40 representatives unchanged**, original roster JSON identical
- **0** `interimResults` timeline steps
- **1** settings-only `representative-directory` scene preserved for phone number
- First authored timeline step: `round-one`
- Previous music/12-second intro preservation checks still pass

The generated JSON is a *local candidate*, not a verified copy of the currently active live quiz. To release, apply the script to a snapshot of the current **live** sidecar and inspect the semantic diff, do not simply overwrite the live sidecar with `work/tzila-51-steps-20261107.json`.

## Tests and release safety

- Full workspace tests (common/socket/web): **326 / 326 passed**
- Full extensions suite (including real local telephony transport): **485 / 485 passed**
- Targeted Tzila timeline tests: **passed**
- Web and socket TypeScript checks: **passed**
- `pnpm build` web + socket: **passed**
- Playwright staged and live specifications updated to the new sequence, **not run against production**.
- Production inspected at approximately 20:54 Asia/Jerusalem: HTTP health **200**, current `tadazz` container up, logs reported **one remaining live room**. **No production deployment, restart, live-room mutation, or sidecar overwrite** performed.

## Safe follow-up release

1. Confirm active live rooms/sockets are zero and current deployed container/sidecar versions match expectations.
2. Back up currently live tenant/quiz sidecar and current image; compare hashes and preserve exact 40 contacts, 10 questions, photos, soundtrack references, roster and authentication.
3. Apply the migration to a copy of the *current* live quiz sidecar and validate only the intentional 19 timeline removals (four directory slices, ten interim results, five prejoin/duplicate screens) and two music flags.
4. Build and stage the new image with the existing media volume mounts; validate local Chromium E2E from the beginning through the 10th question, automatic results -> top pick, single timer, full roster and host-only fullscreen.
5. Atomically activate only once the live room is idle; retain one-step tested rollback. Verify https://tadazz.com and do not publish a dial-in number until its route is separately verified.

No claim is made that these fixes are already live.
