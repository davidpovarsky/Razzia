# Lane C — isolated gateway delivery/custody READY

Source: `b764b38222a872cf499419defc9d02e1a1cbdd94` (successor of `62f00ecc13e6696621dc9b34fe3dbf26fa0c6046`; parent accepted evidence `d3098ae0e205290e2173c8ab3365b84414931e6d`). Worktree/branch: `tadazz-hq-telephony-fresh-20261115` / `codex/tadazz-hq-telephony-fresh-20261115`. Sole manager: `01a1dfa1-57d8-7223-a965-2f4f31fe8b23`. Local commits only; no push/deploy/provider/customer/public tunnel or production gateway mutation.

## Result and host contract

New `extensions/src/telephony/pilot-runtime/gateway-v2/{contracts,codec,private-custody,adapter}.ts` and additive host composition in `server/phone-lifecycle-v2/auth/unmounted-factory.ts` provide versioned one-attempt trusted delivery and injected private key/root custody. See [explicit host ports](gateway-source/HOST_COMPOSITION.md) and the pre-edit contract. The authority DB remains the sole lease/version/state/action truth. SecretAttempt and the authority schema are unchanged. No raw credential is persisted in SQLite, custody plaintext, adapter cache or receipts; only authenticated ciphertext is written. Key handles are gateway-purpose/installation/key-ID scoped and opened/cleared per operation, with no generation/discovery/MCP fallback.

Gateway mode is default OFF and requires native adoption plus explicit fresh host Game staging/fencing before Registry publication. The host must actually construct a fresh Game; roster emptiness does not prove age. The actual owner-authenticated port rechecks verified account, issuer session, expiry, native Game object and executor on every use. Copied/metadata-only/consumed/stale attempts cannot resend. The weak ticket value holds metadata only. Delivery rechecks both sides of await, replaces destination errors with generic `service_denied`, and allowlists ACK metadata. The adapter exposes explicit activation and action proof, not registration replay or a credential getter.

AES-256-GCM binds installation/key/target/version/delivery/binding metadata with a purpose-separated key. Explicit empty initialization creates a permanent marker. Missing/corrupt/substituted files, wrong keys/scope, pending temp and uncertainty marker deny. Local version is custody CAS only; an exact duplicate does not overwrite, and explicit version skips require the live DB binding. Fsync/close/rename uncertainty retains a barrier and denies fresh reopen. A known commit followed by close/revocation denies disclosure without compensation.

## Actual validation

Final immutable source `b764b38`: **7 PASS /0 FAIL /0 skipped**, Node24.22.2 arm64, container `phone-gateway-b764b38-attempt01`,22.498s TAP duration. Actual native account registration/password/verification/JWT/session backend, Game constructor, Registry, authority SQLite, verifier and writer; no fake positive authority reader. The wrappers in the boundary tests delegate to the real port and revoke the real session after its real activation commit. Fault injection performs real temp close/rename before throwing.

1. First-attempt delivery, safe ACK/unchanged SecretAttempt, pending action denial, explicit real activation and a fresh adapter/key handle against the same live host. Copied/reused/metadata-only tickets deny. No native players created.
2. Lost ACK preserves ciphertext; hostile destination secret echo is sanitized. Same delivery duplicate does not overwrite; live version3 can explicitly skip undelivered2. Stale/CAS mismatch and retry of a consumed failed attempt deny.
3. Default OFF and late staging of an actual published Game deny; actual issuer revocation prevents any subsequent key access.
4. Wrong key/purpose/key ID/installation/target, authenticated header tamper, missing record/reinitialization, symlink/hardlink/root substitution and lock/temp all deny. Controlled fixture restoration is test-only, never an adapter repair path.
5. Sender factory closes after receiver commit and before ACK: ciphertext survives, ACK and future host/key use deny.
6. Actual activation commit then real issuer revocation before awaited completion: DB remains ACTIVE, receipt denies, no rollback.
7. Actual temp close and actual rename followed by injected uncertainty: original delivery denies, writer barriers remain and new adapter read/initialization deny.

The test teardown scans its actual private fixture files (including SQL/ciphertext) and public evidence for remembered raw credentials, passwords, JWT and gateway key hex. It passed. Authored formatter7/7 and affected native TypeScript7.0.2 exit0 are recorded in `gateway-20261115-final`; temporary dependency junctions removed. Initial fixture type mistakes (3 diagnostics) are preserved in `gateway-20261115-attempt01`. Initial source62f also passed7/7 before the destination-error sanitizer; its full receipts remain in `gateway-20261115/initial-runtime`. The final source reran all7 because the sender error boundary and hostile-echo case changed.

Final composed source before/after verified549 base inputs and44 overlay inputs, including canonical native fence/barrel and unchanged native hooks. Accepted four core files remain byte-identical to0ad2f09e. No account-db/startup/barrel/upstream edits are in this packet. Old10,18,100, manager187, earlier auth5/SIGKILL cases are not rerun or re-certified for these new transitive inputs.

## Receipts and resource release

- Final public archive: `/home/ubuntu/tadazz-hq-qa-20261115/artifacts/phone-gateway-receipts-gateway-b764b38.tar`,40960 bytes; SHA256 `a7a2723c22aa6f01604448d4126f0214a5bbace8144bf7104f08bcd901ff0b02`. Local extracted receipts and independent accounting: `gateway-20261115-final/runtime/`.
- Initial public archive: `.../phone-gateway-receipts-gateway-62f00ec.tar`,40960 bytes; SHA256 `e0a2e3c7171f27cbcfcc12db13ae26cdc75535f971a35b329f8d33858506f2ee`.
- Final immutable input artifact: `.../artifacts/phone-gateway-b764b38222a872cf499419defc9d02e1a1cbdd94`; source tar348160 bytes, SHA256 `34d8257961e5240e12309c33604eaa0190ef5043d3093870562f2e2f9f5e2cd3`; manifest SHA256 `ecb0ffb65b7987d3ab9eba5bafab39c8c87f9aac8e06e21b62c12e5663f32025`.
- Both exact new containers terminal, Pid0, exit0, OOMKilled=false. Each network none, read-only rootfs,0.25CPU,1GiB RAM/swap cap, PIDs96; private fixture RAM only. No image/dependency install or retained runtime/provider touched.
- Fresh available disk2,522,005,504 bytes / MemAvailable10,248,024KiB before final launch. Cumulative Lane C disk11,239,424/16,777,216 bytes including both new artifacts, sources, public evidence, archives and container metadata. Runtime claim `phone-gateway-custody-20261115` RELEASED; peer and terminal history preserved. Release ledger reported live1.25CPU/6515MiB including shared435MiB once. This is a release-time snapshot, not a new reservation.

## Deliberate remaining boundary

This is READY for manager review/cherry-pick and later host composition, not a live provider/PSTN acceptance. A new adapter instance in the same real live host is proven. A fresh OS process, persistent real host/key store, actual network transport/gateway identity, storage power loss, gateway callback custody, provider precommit/chronology, Game/score reconstruction and physical100 callers are not proven or enabled here. The pre-edit proposed fresh-process fixture was narrowed to fresh adapter rehydration because a synchronous live authority port cannot honestly be replaced by a deserialized cross-process snapshot; no fake authority was introduced. The manager owns that later host/key transport boundary. No automatic cold repair is supplied. All four source Asana tasks remain partial OPEN.
