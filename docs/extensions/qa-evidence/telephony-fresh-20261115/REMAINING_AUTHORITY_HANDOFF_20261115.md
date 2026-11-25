# Lane C — remaining authorization and real commit-crash acceptance

**Five new authorization cases PASS and one new six-window SIGKILL case PASS.** No application production file changed after the formatter-only source dbf79063582ea13983d0f62d97470125c7b90d7c. The new work is actual acceptance coverage plus a correction to the Lane C runtime-accounting helper. No existing10/100/18 suite was rerun.

| New execution | Actual observation |
| --- | --- |
| R-AUTH-01 | Eight actual signed/purpose/identity proof variants deny initialization: missing/malformed JWT, player role, join-ticket purpose, missing/unknown sid, expired JWT and foreign owner. Additional actual unverified owned account, disabled account, captured-key/profile mismatch and accounts-OFF cases deny. Roots remain unchanged, zero lifecycle/native access, then the valid owner initializes successfully. |
| R-AUTH-02 | Six scope/version variants, three wrong capabilities, and copied/released real proof contexts deny before lifecycle access. A valid control joins once; repeated wrong scopes preserve its complete player/roster snapshot. The fixture inspects the real factory's private verifier/map only to exercise provenance, with no fake verifier or new production accessor. |
| R-AUTH-03 | Actual revokeAccountSession and actual resetPassword invalidate already cached register/poll receipts. Separate owner sessions are distinguished; a fresh valid owner can commit terminal revocation even after the original issuer is invalid. No fabricated hangup/rollback/native compensation occurs. |
| R-AUTH-04 | Registry removal, a genuine replacement Game heap deliberately assigned the same ID in the hostile fixture, and a new factory cannot recover/reuse the old service executor. No new lifecycle access, no automatic authority overwrite, no replacement players. This is explicit fail-closed incarnation evidence, not Game restoration. |
| R-AUTH-05 | Real wall-clock lease expiry and a shortened actual persisted session expiry deny before lifecycle/native access. No synthetic provider clock or TTL relaxation is used. |
| R-CRASH-01 | Actual verified-account/session/Game child processes self-SIGKILL immediately before and after the real authority SQLite COMMIT for initialize, issue and rotation: **six windows**. A durable observed-edge witness precedes each kill. All writer markers remain; fresh public readers deny and do not mutate/recover files. Known completed initialization preserves schema/meta; issue/rotation preserve hash-only leases and metadata-only receipts in PENDING_DELIVERY, versions1/2. Rotation retains issuer/executor/fixed expiry. No credential-bearing operation response completes. cgroup oom_kill delta0. |

## Exact inputs and verification

- Five-case tested source: **2a888de9c832670ca657a5774a85f70f9a38e3ad**, actual Node24.22.2, tests5 PASS/0 FAIL/0 skipped/cancelled/todo, exit0. Immutable549 base+34 overlay inputs verified before/after.
- Six-window tested source: **66d794a4c7947af355de7dc27217e03b72b1a759**, actual Node24.22.2, one case PASS, zero fail/skip/cancel/todo, exit0. Immutable549 base+35 overlay inputs verified before/after. The fixture mount is persistent host ext4 on/dev/sda1; in-container filesystem magic ef53. **This is process-crash/fsync evidence, not hardware power loss or gateway credential custody/recovery.** Private fixtures are retained.
- New authored files pass installed Prettier3.9.10 using the manager's config/plugin. The evidence tree is normally ignored by Prettier, so the real authored check explicitly uses an empty ignore file; the earlier ignored check is retained and labelled NOT acceptance. Actual affected TypeScript7.0.2 exit0 over all four new TS roots and transitive current source; temporary dependency links removed; no install.
- All application source remains identical to the accepted formatter successor. Four0ad2 core files, old immutable fixtures, original negative-f541 controls and old receipts remain unchanged. B's exclusive account-db.ts/startup index.ts were never edited. Existing account/session APIs were consumed normally in isolated synthetic config roots.

Public raw observations, TAP, input verification and terminal-state/accounting receipts are in remaining-20261115/{auth5,crash}. No raw private fixture database, JWT or capability is committed. Child diagnostics reject JWT-shaped values; known post-commit lease schema/control metadata are explicitly checked. The new cases do not claim a real email/provider/billing entitlement or a production route mount.

## Runtime-accounting correction and custody

The initial BLOCKED receipt runtime-admission-7bf71dc.json is preserved unchanged. Its helper incorrectly summed terminal historical entries retained in active_claims. Those raw totals were not actual live resource usage. The corrected helper filters terminal-ne-true for own/live detection, includes shared_metadata_mib435 exactly once, and atomically checks that terminal history is unchanged before writing. Exact own releases remove only the matching live thread/job and append it to released_claims; peer history is never deleted. Corrected reserve/release receipts record live totals and terminal_history_preserved=true.

After fresh actual disk/RAM checks, each new job reserved .25CPU/1024MiB under the existing lock. Initial auth5 extraction rejected the new source prefix before any container was created; the successor retained the frozen extractor's required phone-auth-SHA source path. The failed attempt/control files remain. No safety guard was widened. Actual containers phone-remaining-2a888de-attempt02 and phone-crash-66d794a-attempt01 both exited0/Pid0/OOMKilled=false; both allocations are RELEASED.

New auth5 allocation888832bytes; new crash allocation2363392bytes including persistent private synthetic fixtures, source/input/evidence, receipts and own container metadata. Cumulative Lane C charge **9150464bytes** includes the prior5898240bytes and remains below the existing16MiB ceiling. Final observed free disk2565005312bytes. Metadata keeper/volume, backups, production/gateway, peers' containers/caches and all old failed receipts were preserved. No service was stopped/restarted, no customer/provider settings changed, and no spend/push/merge/deploy occurred.

Retained and downloaded/hash-verified archives:

- auth5:40960bytes, SHA256 `4caf1232d2c5bf887999426a360a14e76f00bfca0b0b18a1521081ab45a81422`.
- crash:51200bytes, SHA256 `8b158ca79404fbf419c78ae9376b41e65ecc3fbea37cc664f4442786faa3396d`.

## Remaining product boundary

All four original source tasks remain OPEN:1219846294963052,1219881067977912,1219999342715862,1219886202109096. These executions extend actual unmounted authority acceptance; they do not close real PSTN/two-question audio/DTMF, provider identity/new-attempt chronology, field invitations, physical100-call capacity, durable canonical Game/score reconstruction, or production gateway key/credential custody. The legacy15PASS/3FAIL, prior10 auth/native,100 synthetic and historical2 PSTN connections retain their exact recorded scopes.

The next gateway composition needs a trusted versioned binding/delivery and key/root contract. Current SecretAttempt returns safe receipt metadata plus one first-attempt secret; a gateway cannot infer trusted issuer/executor/action scope or actual new-call chronology from callback fields or an unkeyed journal. Production adoption also needs the separately described before-publication fresh-Game composition; current opt-in remains unmounted. No new public mount, provider change or automatic recovery was introduced here. Manager can integrate the new tests/accounting helper independently of the already integrated application foundation.
