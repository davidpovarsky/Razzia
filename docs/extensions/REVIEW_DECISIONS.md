# Decisions and unresolved engineering questions

Confirmed: preserve upstream; isolate feature code; no Hebrew/tablet work; eight existing languages; UK audience; Yemot first provider pilot; no automatic upstream edits; no feature coding in planning phase.
D01: Sidecar storage vs a single optional versioned extension field in Zod quiz schema. Sidecar reduces upstream edits but introduces question ID/reorder/transaction complexity. Decide after spike.
D02: Use separate extension status event envelope vs extend STATUS. Separate event minimizes type churn but requires synchronized snapshot/reconnect semantics. Decide after spike.
D03: Team aggregation (sum/average/topN) and assignment permissions; default recommendation sum, subject to owner approval.
D04: Telephone answer fairness: server receipt time vs provider timestamp; never trust unsigned timestamps.
D05: Yemot API feasibility for continuous keypress without per-question prompt; BLOCKED on verified UK test and API capability.
D06: Persistence for active game and scale-out. Upstream Registry is in-memory; decide whether one-instance deployment is sufficient for initial events.
D07: How extension media storage shares upstream manager auth and deletion lifecycle.
D08: Do new sounds require per-game, per-quiz or global overrides? Prefer per-quiz with global defaults.
D09: Exact editor placement and visual verification require real browser QA.
D10: How to handle quiz clone/export/import and question IDs; define migration path.
No unresolved item may be silently filled by an implementation agent.
