# Accepted compiled-index diagnostic leaves — local integration

Root authorized this exact source integration on 15 November 2026 under the
integrator's exclusive source/Git lease. The four new leaves match tested producer
source `c35a65d97132f64c1ebd0112ebd7ae0a82273fda` exactly, including Git modes.
This is diagnostic-only: immutable authority registries remain empty, executable
acceptance remains false, and compiled pins remain empty. No rights, renderer or
customer-export acceptance follows from this integration.

The pre-edit ownership ledger was committed as
`0bc856ba19451b5c705fa115641de06844b55c8f` before any source change. Each path was
absent from the integration baseline `bfbe82b3987ae8d051fc049ef5d2ab519f631d88`.

| Accepted original | Local pick | Scope |
| --- | --- | --- |
| `155c6b84df84c900872162e2a8c0267c90641153` | `6eb1320eefb104e5bf69d41b969877d80dea7efb` | Four new diagnostic leaves and introduction evidence |
| `c35a65d97132f64c1ebd0112ebd7ae0a82273fda` | `9a3fe8c63ec301e156cd402da2ff1e2889a4c241` | Three-leaf correction and correction evidence; authority unchanged |
| `9ccd0921c48cd6117cdd2f2fc536b8073103b125` | `00ee241abf5582bd9b71b377deab1b52081d256d` | Producer server results only |

Commit `9f873632de0b1bee969d7aec9ef3d059f3bf3744` separately retains exactly seven
plan/evidence files from `d3eec67`, without merging its ancestry. The final source
change remains the four leaves in `9a3fe8c`; later commits change evidence only.
The source is the previously verified 29-path union plus these four accepted
paths, for 33 exact source blobs/modes relative to `9f7bfde`. Existing source,
barrels, runtime callers, protected packages and dependency locks are unchanged.
Direct dependencies `digest.ts` and `primitives.ts` match the producer pin.
No existing source imports the new modules.

`POST_PICK_AUDIT.json` records the full 33-path union, four final source SHA-256
values, 51 exact producer evidence blobs/modes, 23 verified producer manifest
entries, and the raw Vitest JSON's 53 passed / zero failed result. Independent
correction review bytes are preserved with SHA-256
`42474d541023b40ad6abc9ff67fd06e9ddd7a84f9ab74122aa81e8e25673ef85`.
The accepted server handoff SHA-256 is
`33b071523fbace60efd8f769ce217064bba4362700efd7ae5b0d19a911799c7c`.
The audit script reads Git/source/evidence only; it does not execute product code.

Validation belongs to the producer's exact source pin: one server run passed
53/53 tests in `compiled-index.test.ts`, plus focused TypeScript. No integrated
test, build, install, ui:check, freeze guard or server job ran here. Root deferred
combined parent TypeScript until the next accepted M3A correction batch. Earlier
149-case integration and normal frozen root/private SDK 41-case receipts retain
their original pins; they are not new-head verification. The historical full
suite remains 813 passed / 6 failed. Producer setup incidents and guard failures
remain preserved and are not relabelled as passes. An initial local metadata
whitespace check flagged CRLF; the owned ledger was normalized to LF, while the
exact copied review and producer evidence bytes remain unchanged.

No unaccepted MCP, C1, UI, Phone-auth or unrelated source was integrated. No
producer branch ancestry was merged. No push, main merge, deployment or shared
keeper mutation occurred. Compute remains returned; the read-only metadata
keeper remains reserved for the next authorized frozen consumer. Broader product,
rights, renderer, browser and release gates remain open.
