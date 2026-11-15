# First-party draft adapter — M3A source candidate

Unmounted and unvalidated. `await createFirstPartyApp(options)` prepares an
isolated Hono fetch adapter after the real account service has bootstrapped.
Startup requires an existing regular account DB at the explicit CONFIG_PATH,
accounts enabled and a persistent JWT_SECRET matching the actual cached auth
module. It does not create an absent account DB. The existing account service
owns its schema/bootstrap; this adapter captures its actual handle at startup.
Requests fail if that handle closes. Shutdown must stop admission/drain requests
before closing that upstream service; arbitrary in-process cache replacement
during the verifier's own await is outside this adapter's control.

No HTTP listener, protected route mount, host OAuth grant or MCP factory wiring
is added. The accepted server/contracts/tests stay frozen. This first-party
identity has no issuer/client/grant fiction and cannot serve as an MCP principal.
Bindings and issued principals have runtime WeakSet checks. Real manager JWT
verification and live account/sid checks run through the actual middleware/auth
modules. Missing ALS owner or an unissued capability fails before private path
or draft-cache access. The wrapper checks its prepared account handle before
calling the actual middleware, then re-verifies after the body await.

The strict HTTPS origin and Host are explicit configuration. Forwarded headers
are rejected. Ingress bounds URL/header lengths, methods/routes/content types,
actual body streams to 64 KiB, 32 active lifetimes and 120 attempts/minute across
adapter instances in this module. JSON parsing follows actual authentication.
Body cancellation retains admission until both pending read and public cancel
promises settle; a permanently stalled cancellation retains its bounded slot.
The eventual real HTTP server must also bound headers before constructing Request.

| Method | Path                       | Meaning                                                                 |
| ------ | -------------------------- | ----------------------------------------------------------------------- |
| POST   | `/drafts`                  | Strict adopted create input; private canonical draft                    |
| GET    | `/drafts/:id`              | Owned validated canonical content and revision                          |
| PUT    | `/drafts/:id`              | Strict adopted replace input; URL/body ID equality and CAS              |
| POST   | `/drafts/:id/save-intents` | Strict adopted save selection; HTTP409 with `ok:false` and `PENDING_C1` |

Draft storage is exclusively
`CONFIG_PATH/tenants/<verified-account>/extensions/mcp-first-party/drafts.sqlite`.
It has no global/ambient fallback or cached draft DB handle. Mutations use
exclusive mode0600 file creation, a new rollback-journal DB, FULL synchronous
transactions, and atomic draft CAS + session/key/digest/outcome/audit writes.
Authority keys include first-party authority, owner, sid, operation and key.
Replay validates the durable outcome before reading the current mutable draft.
The source limits each account to 100 drafts/5000 operations and performs no
automatic eviction or recovery. New session IDs have independent mutation keys.

GET does not mkdir, initialize, migrate, repair, call native storage or set
immutable mode. It rejects symlinks/hardlinks, unsafe ancestors, every journal/
WAL/SHM sidecar, non-rollback headers, corrupt schemas and inconsistent content.
Readonly SQLite uses query_only and closes on every call. A damaged/new partial
store remains preserved and unavailable. These are private draft-family/native
file guarantees: real session verification reads the existing account DB, whose
WAL/SHM behavior remains owned by that service. OS read-access times are excluded.
The future runner must inspect actual write syscalls for the private family,
in addition to byte/mtime/directory snapshots. No filesystem-race guarantee is
claimed against an actor modifying service-owned paths concurrently.

Live authority is rechecked at replay, before commit and before returning an
outcome. Account/session and draft DBs are separate: revocation is not
linearizable across their transactions. Revocation after the precommit check
can leave committed draft/operation/audit rows; the postcommit check denies
the private response. Request cancellation also does not undo committed rows.

Save preparations contain only state/draft/revision/authored digest; SQL requires
native_id NULL. They confer no consent and allocate/publish no native game.
Native and enhanced input envelopes are rejected before private/native allocation.
C1 reservation/publication, R2 native root-identity handling, host OAuth/private
grants, accepted SB renderer and actual downloads remain separate integration
gates. No Show Builder or Recovery WIP/schema/projection is copied.

Fixture sources set synthetic env/root before lazy actual auth imports, use real
manager mint/sid/revoke logic, two synthetic accounts and native sentinels.
They include real SQLite replay/CAS/rollback, a killed-process hot journal,
WAL/corruption preservation, unsafe paths, revocation and bounded HTTP streams.
They have NOT RUN. Dependency resolution and all functional/type checks require
a separately granted server runner. See the owned M3A source evidence folder.
