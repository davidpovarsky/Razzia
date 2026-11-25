# Roster label / native admission contract disposition

Actual C blocker c1ed0216: accepted roster names25/29 characters fail actual invitation registration, despite valid fresh native authority. Source verified by sole manager: participants.ts accepts trimmed1..40 and updates native labels40 on later rename; phone-controller.ts resolves the actual roster entry and passes its displayName to PlayerManager.join; common usernameValidator remains1..24.

Decision: preserve full existing roster1..40 and all stored names; common/web/joinTicket usernames1..24 remain unchanged. No silent truncation, global limit relaxation or new wire/schema is requested. Existing B backend owner implements a minimal server-internal admission seam for an actually resolved/validated roster label only, sharing the original Player construction/events/billing/capacity path exactly once. Ordinary/fallback names retain their existing validation. No generic skipValidation or caller-supplied maximum. The existing actual Game/phone authorization fence remains the authority.

Ownership routed to B: extensions/src/server/game/phone-controller.ts plus minimum necessary internal hook in packages/socket/src/services/game/player-manager.ts if needed; record exact own pre-edit upstream handoff per existing policy. C retains original real-phone invitation/short-control/25char desired-success and fifth-choice gameplay evidence. Four core files, common validator, frozen schemas and roster data remain unchanged. No new agent/approval/production/provider action or TDS reopening.

This is a contract/ownership decision, not yet an implemented or passed repair. B's native-operation source is a separate intake; do not conflate acceptance. Source Asana task stays with its original owner and OPEN while partial.
