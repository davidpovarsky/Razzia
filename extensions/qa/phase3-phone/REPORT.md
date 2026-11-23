# Phase 3 Unit C — Phone Trusted Identity & Live Fixture QA Report

- **Unit**: `44fdfcc0` (`44fdfcc0-aeb6-46d4-8707-b2f6e8a59d3a`)
- **Branch**: `cez/44fdfcc0`
- **Base commit**: `17752e3ea7e725acbfb425d90bfd8392c40b1332` (Phase 3 baseline `12ba2f4f4a0185762cf43944aacafe2b5bc31dab`)
- **Model**: Gemini 4 Hydrogen (XHigh)
- **Feature flags / default posture**: All v2 phone flags / native adoption remain default-OFF. Zero changes to `packages/**`, `storage/**`, `MCP/**`, `extensions/src/editor/**`, or lockfiles.

## 1. Reproduced Gap & Minimal Fix

### Root cause

In [game-facade.ts](../../src/server/phone-lifecycle-v2/game-facade.ts), `RealGameFacade.operate` mapped every `!answer.accepted` result from `GamePhoneController.submitPhoneAnswerByRosterId` to `"answer_outcome_unknown"`.
Because `LifecyclePrototype.operate` skips `store.completeOperation(...)` whenever `result.status.endsWith("_unknown")`, the `operations` row stayed in `state = 'PENDING'` indefinitely, causing `PrototypeStore.pending(callerHash)` to lock the caller out of all subsequent `poll`, `answer`, `hangup`, and replacement `register` calls (`binding_pending_unknown` / `operation_pending_unknown`).

This broke legitimate server-authority rejections that share the active question `epoch` without mutating `Game`:

- pre-start (`no_active_question`) and entrance / post-20s-timeout (`not_accepting_answers`)
- duplicate answer (`duplicate_answer` with a new `operationId`)
- out-of-range digit on `< 5`-option questions (`invalid_answer_index`)
- paused game (`game_paused`) and active Creating Worlds scene (`scene_active`)
- unsupported PSTN question types (`isSupportedOnPstn === false`, mapped to `"unsupported_question_type"` because `PrivateGatewayAdapter.operationReceipt` requires `/^[a-z][a-z_]{0,63}$/u`)

### TDD reproduction & fix

1. **RED**: Added [phone-lifecycle-live-game.test.ts](phone-lifecycle-live-game.test.ts) against real `Game` + `RoundManager` + `PlayerManager` + `GameRoster` + `GamePhoneController` + `RealGameFacade` + `PrototypeStore` + `LifecyclePrototype`. Observed 2 failures where `"answer_outcome_unknown"` was returned instead of `"no_active_question"` / `"unsupported_question_type"`.
2. **GREEN**: Updated [game-facade.ts](../../src/server/phone-lifecycle-v2/game-facade.ts) with an explicit `DETERMINISTIC_ANSWER_REJECTIONS` allowlist plus `!isSupportedOnPstn` mapping via `answerStatus(...)`, keeping `"rejected_by_engine"` and any unrecognised failure fail-closed as `"answer_outcome_unknown"`.

## 2. Files Modified / Added (Owned Scope Only)

- Modified: `extensions/src/server/phone-lifecycle-v2/game-facade.ts`
- Added QA suite (Vitest local + real `Game`): `extensions/qa/phase3-phone/phone-lifecycle-live-game.test.ts`, `extensions/qa/phase3-phone/vitest.config.ts`
- Added QA full-chain Linux container fixture: `extensions/qa/phase3-phone/phone-v2-live-fixture.node.ts`, `extensions/qa/phase3-phone/tsconfig.json`, `extensions/qa/phase3-phone/REPORT.md`

## 3. Local Verification Evidence (Windows `win32`, Node `v24.22.1`)

> Note: `PrototypeStore` skips the POSIX `0o077` mode check on `win32` (`store.ts:57`). Custody modules that strictly enforce POSIX `0o600`/`0o700` and `constants.O_NOFOLLOW` (`PrivateAuthorityFiles`, `PrivateGatewayAdapter`, `PrivateCallPrecommit`, `PrivateCallOperationHost`, `PrivateOperationPrecommit`) require Linux container execution (`NOT_RUN_LOCAL_LINUX_CONTAINER_REQUIRED`, prepared in Section 4).

| Check                                                | Command / Target                                                                                                                      | Result                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format (`prettier --check`)                          | `game-facade.ts` + 4 files in `extensions/qa/phase3-phone/`                                                                           | Exit `0` (all matched files clean)                                                                                                                                                                                                                         |
| Lint (`oxlint`)                                      | `extensions/qa/phase3-phone/`                                                                                                         | Exit `0` (`0` warnings, `0` errors)                                                                                                                                                                                                                        |
| Typecheck (`tsc --noEmit`)                           | `extensions/qa/phase3-phone/tsconfig.json`                                                                                            | Exit `0`                                                                                                                                                                                                                                                   |
| Route typecheck                                      | `node extensions/src/telephony/pilot-runtime/phone-route-typecheck.mjs`                                                               | Exit `0` (`typescript 7.0.2`)                                                                                                                                                                                                                              |
| Pilot-runtime Node tests                             | `node --test --test-concurrency=1` (`tada-audio-logic.test.cjs`, `tada-pilot-gateway.test.cjs`, `tada-pilot-gateway.faults.test.cjs`) | Exit `0` (`34 pass / 0 fail / 0 skip`)                                                                                                                                                                                                                     |
| New live-game Vitest regression                      | `vitest run --config qa/phase3-phone/vitest.config.ts qa/phase3-phone/phone-lifecycle-live-game.test.ts`                              | Exit `0` (`4/4 pass`: 20s window + deterministic rejections + Q2 vote/score, unsupported estimation + manual skip + A->B replacement + delayed A hangup/answer/poll/register + terminal post-hangup, `scene_active`, fail-closed `answer_outcome_unknown`) |
| Existing extensions Phone Vitest                     | `vitest run --config extensions/vitest.config.ts` (`telephony.test.ts`, `participation.test.ts`, `roster-native-admission.test.ts`)   | Exit `0` (`48/48 pass` across 3 files)                                                                                                                                                                                                                     |
| Socket game Vitest (`creating-worlds`, `downstream`) | `vitest run --config vitest.config.ts creating-worlds-repair.test.ts downstream-game.test.ts`                                         | Exit `0` (`15/15 pass`: 10 + 5)                                                                                                                                                                                                                            |
| Legacy `pilot-phone.test.ts`                         | `vitest run --config vitest.config.ts packages/socket/src/api/pilot-phone.test.ts`                                                    | Exit `1` (`1 pass / 3 fail`, pre-existing on protected `packages/socket`: unauthenticated `POST /api/games/pilot-phone` fails closed `401` when `TADA_PILOT_SECRET` is unset; `enforces TADA_PILOT_SECRET when configured` passes)                         |
| Upstream / editor guard                              | `git diff --name-only 12ba2f4 -- packages extensions/src/editor`                                                                      | Exit `0`, empty diff (`0` files)                                                                                                                                                                                                                           |

## 4. Full-Chain Linux Fixture (Prepared for `/tmp/phase3-999ed90c/source`)

- **Status**: **NOT RUN LOCALLY** (`win32` lacks POSIX `0o600`/`0o700` & `O_NOFOLLOW` enforcement required by `PrivateAuthorityFiles` & `gateway-v2`). Typechecked (`tsc --noEmit` exit `0`) and linted (`oxlint` `0` errors) locally.
- **Fixture**: [phone-v2-live-fixture.node.ts](phone-v2-live-fixture.node.ts) — exercises REAL `AccountDb` / `UnmountedPhoneAuthority` (`nativeAdoption: true, gatewayDelivery: true`) + `PrivateGatewayAdapter` + `PrivateCallPrecommit` + `PrivateCallOperationHost` + `PrivateOperationPrecommit` + real Socket.IO manager (`127.0.0.1:0`, synthetic `*.example.invalid` & `+15550100...` callers, `network NONE` safe, temp dir cleaned in `after` with secret-leak scan) across:
  1. Negative host auth (`unverified`), uninvited `phoneInviteOnly` denial (`admission_outcome_unknown`), 35-char pre-registered invited caller join + lost-ACK register replay + Q1 score.
  2. Real 20s question (`time: 20`), pre-start (`no_active_question`), out-of-range digit (`invalid_answer_index`), pause/resume (`game_paused`), duplicate answer (`duplicate_answer`), post-20s late answer (`not_accepting_answers` + lost-ACK replay unbricked), Q2 Estimation (`unsupported_question_type`), manual skip (`stale_epoch` + Q3 advance), explicit `A -> B` replacement while delayed `A` hangup returns `registration_retired` with `B` score/socket intact, Q3 scoring, and `B` clean hangup (`TERMINAL` blocks redial `C` with `binding_pending_unknown`).

Exact remote container command inside `tadazz-phase2-20261116` (using supported `/cleanup` tsx loader and bounded `/tmp` scratch per `PHASE_3_EXECUTION_20261117.md`):

```bash
nice -n 19 timeout 120s \
  env PHASE3_PHONE_TEMP_ROOT=/tmp/phase3-999ed90c \
  NODE_OPTIONS="--max-old-space-size=1024" \
  /cleanup/node_modules/.bin/tsx \
  --tsconfig /tmp/phase3-999ed90c/source/tsconfig.json \
  --test /tmp/phase3-999ed90c/source/extensions/qa/phase3-phone/phone-v2-live-fixture.node.ts
```

## 5. Remaining Gates

- Run [phone-v2-live-fixture.node.ts](phone-v2-live-fixture.node.ts) in the isolated Linux `tadazz-phase2-20261116` runtime container (`/tmp/phase3-999ed90c/source`) to obtain Linux POSIX custody execution receipts (`LIVE-FULL-CHAIN`).
- Any owner/manager review of `cez/44fdfcc0` before merge; feature flags remain default-OFF; real PSTN/provider telephony remains gated outside Phase 3 Unit C.

## 6. Phase 3 Unit C Fixture Startup Repair (`8de82781`)

- **Candidate base**: Cherry-picked `4a1d92b03d734d96717c26873686c68d6c76735c` onto `cez/999ed90c` (`5dc99be8a61418cc0ab899b4a6d1857a22b44bed`). Runtime auth/game code unchanged (`extensions/src/server/phone-lifecycle-v2/game-facade.ts` inherited untouched; zero edits to `packages/**`, `MCP/**`, `storage/**`, or `extensions/src/editor/**`).
- **Confirmed RED root causes in [phone-v2-live-fixture.node.ts](phone-v2-live-fixture.node.ts)**:
  1. **Module evaluation order (`owner_authority_denied` at line 191 + frozen `GAME_SPEED=1`)**: Static `import { UnmountedPhoneAuthority }` loaded `native-account-authority.ts` (`import { jwtSecret as existingVerificationSecret } from "@razzia/socket/env"`) before lines 64-88 cleared inherited env vars and set synthetic `JWT_SECRET` and `GAME_SPEED="10"`. `NativeAccountAuthority.prepareManager` -> `assertStrictProfile()` rejected `process.env.JWT_SECRET !== existingVerificationSecret` with `owner_authority_denied`, and `@razzia/socket/env` captured default `gameSpeed=1` (`SECOND_MS=1000`). Fixed by converting static `unmounted-factory` / `gateway-v2` / `@razzia/socket/test/fixtures` imports to type-only imports + dynamic `await import(...)` after `process.env` initialization, plus startup assertions verifying `env.jwtSecret === fixtureJwtSecret` (no secret printed) and `env.gameSpeed === Number(process.env.GAME_SPEED)`.
  2. **Missing `authorityRoot` synthetic marker (`PrivateAuthorityFiles.assertRoot()`)**: `setupRoom` omitted `{ name: "PHONE_V2A_SYNTHETIC_ONLY", content: "synthetic-v2a-only\n" }` when creating `authorityRoot`, which `PrivateAuthorityFiles.assertRoot()` requires on Linux (`lstatSync` would fail with `ENOENT`). Added the marker to `authorityRoot` matching `lifecycleRoot`.
  3. **20s window assertion event (`STATUS.SHOW_QUESTION` vs `STATUS.SELECT_ANSWER`)**: `RoundManager` emits `cooldown` (no `time` field) on `STATUS.SHOW_QUESTION` and emits `time: 20` on `STATUS.SELECT_ANSWER`. Updated the Q1 assertion to wait for and assert `STATUS.SELECT_ANSWER` `.data.time === 20`.
- **Added startup/contract regression suite**: [phone-v2-authority-startup.test.ts](phone-v2-authority-startup.test.ts) proves the static-import RED witness (`owner_authority_denied`, `gameSpeed=1`), dynamic-import real `NativeAccountAuthority` preparation + unverified rejection + `GAME_SPEED=10`, and real Socket.IO `STATUS.SELECT_ANSWER` `time: 20` contract.
- **Prepared Linux container verification command** (manager-owned `tadazz-phase2-20261116` / `/tmp/phase3-999ed90c/source`; **NOT RUN LOCALLY** on `win32` due to POSIX `0o600`/`0o700` + `O_NOFOLLOW` custody):

```bash
PHASE3_PHONE_TEMP_ROOT=/tmp/phase3-999ed90c \
NODE_OPTIONS="--max-old-space-size=1024" \
nice -n 19 taskset -c 0 timeout -k 5 120 \
node /cleanup/extensions/node_modules/tsx/dist/cli.mjs \
  --tsconfig /tmp/phase3-999ed90c/source/tsconfig.json \
  --test --test-concurrency=1 \
  extensions/qa/phase3-phone/phone-v2-live-fixture.node.ts
```
