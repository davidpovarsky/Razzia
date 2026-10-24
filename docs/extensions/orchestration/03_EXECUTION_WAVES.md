# Execution DAG and gates

## G0 — current setup

Verify 7 worktrees exist and are at same planning commit, correct branches and independent directories. Verify local Node 24/pnpm availability. Do not launch seven installs/servers simultaneously. Root manager game remains working.

## Wave 1 — independent in parallel, safe without upstream edits

Eitan: freeze v1 extension registration/sidecar metadata/identity/timeline and adapter contracts with proofs and RFCs.
Noam: local-only DTMF simulator as pure package/service with replay/dedupe/clock tests, no game-core coupling.
Maya: editor/presenter/phone participant interaction prototypes in standalone extensions, matching Razzia tokens; eight locale key inventory; no upstream UI edits.
Roni: independent acceptance matrix, deterministic test fixtures, failure injection, test runbook.
Yael: official Yemot capabilities, UK number and DTMF unknowns, clearly label unverified; offline provider contract mock.
Dana: authentication, signed webhook, nonce, replay, room isolation, privacy retention, security test vectors.
Tomer: audit setup, prepare integration-only process, check drift and avoid changing any shared upstream file.

## G1 — approval gate

Eitan reviews interface mismatches, Tomer records approved versioned contracts, Roni checks tests, owner approves unresolved product decisions. Noam/Maya/Dana may need to revise isolated code. Do not integrate before this gate.

## Wave 2 — integration spikes (serial for shared files)

Tomer in integration worktree proves sidecar CRUD + stable IDs/reorder/import/export/duplicate/delete; version conflicts and crash safety. Proposed H02/H07/H08/H23 only after owner G2.
Tomer proves round-manager default-equivalent policy seam (H10-H13); browser UI slot and 8-language loading seam (H01/H03/H15/H18/H19); mock telephone participant via real game auth/socket (H22). Run baseline after EACH seam.
Feature agents continue exclusively within own extensions; all shared upstream changes integrated by Tomer only.

## Wave 3 — product features in dependency order

3a leaderboard cadence and team score projection; old quiz behavior and surveys unchanged.
3b image answers, question image animated reveal and presenter/player parity.
3c interludes, customizable sounds, editor preview and reconnection snapshot.
3d phone bridge with Yemot adapter behind provider-neutral interface; local simulation first, no live account until owner explicitly approves.
3e polished simple editor, media lifecycle, per-quiz settings and eight languages.

## G3/G4 — integration and acceptance

Roni independent test suite: original 217 unit + 46 E2E baseline (counts can change), new module tests, image/audio snapshot tests, browser multi-player E2E, offline DTMF 100 simulated concurrent calls, reconnection, security, privacy, localization, old quiz import/export.
Tomer cherry-picks reviewed hashes into disposable integration worktree, checks no unwanted upstream modifications, builds and runs serialized E2E after coordinating main dev server. Owner approves final merge and any push.
Not in scope: real paid UK number, public server, production deployment, native mobile app, Hebrew/RTL, wholesale UI redesign.
