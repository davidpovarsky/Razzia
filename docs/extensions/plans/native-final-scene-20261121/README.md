# Native authored finale continuity — 21 November 2026

The actual BMS native-default clone completed all 23 questions and all 28 authored timeline steps. The real StudioShowCoordinator, show round hooks, presentation mapping, and native director produced leaderboard operations after questions 8, 16, and 23, with no automatic duplicate boards under cardOnly.

The same runtime proof found a separate duplicate: the authored closing requested showFinale, then the following FINISHED status requested showFinale again. The adapter resets the winning-screen animation each time. The director now preserves an already painted plain closing when both displayed winner fields (name and score) match the authoritative FINISHED result. A changed name, changed score, an unpainted screen, an authored cinematic closing, and the first finale still render.

## Evidence

- Exact baseline/candidate run: /home/ubuntu/tadazz-native-final-e2eabcee
- Baseline: 11 of 13 checks passed; the actual clone and populated-winner continuity checks failed with two final entrances.
- Candidate: 13 of 13 checks passed; one native final entrance and one server finish callback.
- Both variants used the same untouched private clone. No production room or live customer-data mount was used. The isolated container was stopped afterward.
- The five imported baseline module hashes matched combined source e4812412b2205445af0ea280cd51fe60d886461d. Only show-director.ts was overlaid for the candidate.
- Candidate director SHA-256: 197a0f03b65a671336ba407ff86c44aef344587f2d1a4ad650bd002765546acf
- Fixture SHA-256: 82e2871fd084c81f0042f9f862698eb67231e6fbc63c9272052b3e4b53916096
- Raw remote qualification SHA-256: eb62ae82944193402cd64692bf0c2909156cc544884ea28a4efd92bbf15e4b86

The committed fixture reads the provided private clone directly. Its report contains hashes and structural execution results, not question text or player records. It uses actual production functions with explicit scene advancement, so it proves sequencing and native commands; the separate native-scene-handoff browser fixture proves the painted blank-gap repair. This small follow-up does not claim a new full-show browser qualification.

Run with FLOW_SOURCE, FLOW_DEPS, FLOW_EVIDENCE, and FLOW_TENANT pointing to isolated source, existing dependency cache, owned writable evidence, and a read-only tenant clone. FLOW_DIRECTOR_OVERRIDE optionally selects the candidate for the same baseline/candidate fixture.
