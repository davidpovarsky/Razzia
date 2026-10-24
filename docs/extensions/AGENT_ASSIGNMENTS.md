# Named agent roster and task ownership

Discovered from C:/Users/DAVID/Code/Maktabah/.agents/roles and .agents/agents. Those role definitions are Maktabah-specific; do not import Maktabah's native iOS rules into this web project.

- Eitan / Architecture: owns contracts, upstream hook RFCs, extension boundaries, migrations.
- Noam / Engineering: owns scoped implementation and unit tests; never edits upstream without approved hook.
- Maya / UX: owns web editor, game/presenter visual integration, accessibility, Razzia design fidelity (NOT native iOS or tablet scope).
- Roni / QA: independent test plans, acceptance evidence, regressions, adversarial tests.
- Tomer / Integration: branches/worktrees, upstream sync checks, dependency management, merge readiness.
- Yael / Research: official Yemot APIs, UK number accessibility, DTMF timing, provider alternatives, verified unknowns.
- Dana / Security: webhook auth, room isolation, call privacy, abuse and replay protection.

## Execution mode

NORMAL by default: main session handles tasks and can use role checklists. TEAM only when owner explicitly requests subagents. Planning role assignments does not activate TEAM.

## Work partition

Architecture: Eitan + Dana + Tomer review.
UI/editor: Maya, Noam implementation, Roni verification.
Game modes: Eitan contract, Noam implementation, Roni tests.
Telephony: Yael provider research, Dana security, Eitan bridge contract, Noam implementation, Roni load/reconnect tests.
Upstream: Tomer owns sync and conflict reporting; owner approves upstream hooks and merges.
Use separate worktrees and handoffs. No concurrent edits to shared registries or configs.
