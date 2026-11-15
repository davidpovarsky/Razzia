# Resolved roster40 native admission — narrow source handoff

Product/source+test commit `902412c347d39f38290fde2ef1307240cee7dc07`.
Delta base `30bd603d0555446b8760fb54406b724512ac254b`.
This commit can be reviewed/integrated independently of the separate optional
C1 native-operation handoff under manager review. C received the exact source
for its existing real authority/freshGame/invitation continuation.

## Change and authority

The sole manager assigned this precise backend seam to B after C reproduced
that real roster upsert accepts trimmed1..40 names but native PlayerManager
ordinary join rejects beyond24. OWN upstream pre-edit ledger is committed in
UPSTREAM_PRE_EDIT_LEDGER.json with original file hashes, symbols/rationale/tests.

Only two production paths changed:

- `packages/socket/src/services/game/player-manager.ts`: internal
  `joinResolvedRoster(socket,displayName)` validates trim-length1..40 and shares
  the private addPlayer implementation with ordinary join. Original client-ID
  duplicate guard, Player construction, room join, host NEW_PLAYER, player count
  and SUCCESS_JOIN are preserved. The actual original creation/event body is
  byte-identical, moved into that private helper. Ordinary join still runs the
  unchanged usernameValidator and maximum24.
- `extensions/src/server/game/phone-controller.ts`: wider hook is used only for
  a roster entry actually found in this game's Map. The existing admitPhone
  callback rechecks the exact entry object and displayName before invoking the
  hook. Removal/replacement/name changes deny before Player creation. Unknown
  IDs and caller fallback text stay on ordinary join24. No generic limit or
  skipValidation input exists. Existing warm rebind block is byte-identical.

No truncation/renaming or customer-data changes. Validation follows roster's
trim-length rule; publication retains the resolved displayName itself. No
roster40 logic, common usernameValidator/joinTicket schema, ordinary web Game
join, billing implementation, fourcore, Phone authority, constructor routing,
startup-owner pure leaf/export or package dependency changes.

PlayerManager is189 lines. The existing phone controller remains its cohesive
617-line module with a narrow callback change; the new316-line test keeps its
shared actual roster/native fixture and18 boundary assertions together. These
are explicit exceptions to the250-line target; unrelated code was not split.

## Actual evidence

Corrected original-path baseline: **2PASS/3FAIL/11deselected**, with actual native
admission failing lengths25/29/40 while1/24 pass. Raw baseline.json/log/exit are
retained. First patched run:16/16PASS. Final extended run: **18/18PASS**, no skips,
actual existing local Node24.22.1 / Vitest5.0.3 on Windows, existing extensions
config, explicit single file, one worker and no file parallelism.

The tests use actual GameRoster.upsert, GamePhoneController and PlayerManager,
with isolated fake SocketIO and the injected admission port. They assert:

- Resolved1/24/25/29/40 names, full exact name preservation, phone-index lookup.
- Fallback/unknown ID and ordinary web/joinTicket remain24, no widened path.
- Blank/whitespace/41 stored names denied before Player events.
- Existing billing/capacity denial preserves roster/Player/sentinel state.
- One admission callback and native NEW_PLAYER/count/SUCCESS_JOIN emission path;
  duplicate client rejected without repeat events.
- Callback-time removal/replacement/rename rejects stale roster resolution.
- Warm rebind retains points/streak/name, closes the old call through existing
  finishPhone once, and adds neither Player nor NEW_PLAYER event.
- Unrelated roster/native sentinels remain unchanged.

Scoped TypeScript including the real upstream Game/index composition, lint and
format all exit0. Initial test-only type failures and style diagnostics are
preserved in their labelled attempts. SOURCE_BOUNDARY_AUDIT.json proves the
original native creation/event body and warm rebind block byte-identical and
records unchanged common, roster, billing, Game web join and startup leaf bytes.
FINAL_VERIFICATION.json binds the tested source/test hashes, actual counts,
checks and unchanged16 inherited untracked files. Source whitespace check passes.

C's real authority, freshGame/invitation and actual billing integration are its
separate owned proof; callback-count/refusal tests here do not claim that proof.
C's original c1ed0216 1PASS gameplay/1FAIL invitation evidence remains historical
and is not relabelled. No old broad suite, Oracle job, new agent, installation,
provider/customer/production action, TDS reopen, push or deployment occurred.
No source Asana outside B's original ownership was mutated; C has the exact
source/evidence for its original open phone records.
