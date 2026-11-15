# C1 prototype A — source candidate and B handoff

Recovery chat: `01a1dd18-8818-7573-b311-f54bbe0b811f`. Branch: `codex/tadazz-hq-recovery-fresh-20261115`. Base R2 handoff: `96767de6d40b594324687e15b0f386b87dd7ef19`; foundation checkpoint: `3b73fc1b589bee26a70b9f941e3033c91a2d0f58`.

**Source candidate only. No C1 functional test, server/build job, browser session, installation, power-cut qualification or production enablement ran.** Manager chose A: one synchronous cooperating writer with a C1 scope reentrancy lease. It excludes neither other native writers nor other processes. The Linux-only native composite creation/import port is OFF by default and requires the explicit `TADAZZ_C1_CREATION_PROTOTYPE=true` composition flag. No environment/settings change was made. Startup always reads existing C1 evidence before initialization/listen, including after this flag or the accounts flag changes.

## Implemented source

- Scope capture rejects missing/invalid enabled-account ownership before the preparer, lookup, UUID alignment or authored conversion. It distinguishes explicit legacy-global mode, preserves owner case and checks captured physical roots. Startup discovers only the dedicated private service registry, deriving its explicit global/tenant roots without scanning customer shows or guessing orphan ownership.
- Actual native preparation uses the existing validator/error mapping, Nanoid21 once and independent native random8 basename once. Normalized payload, digest, final V1/V2 sidecar, question/timeline IDs and serialized target bytes are frozen once. Generic Map staging and R2 root-ID/import validation/digest semantics retain their existing contracts.
- The protocol creates and fences private intent before private witnesses or public publication, records original inode/device identity before any public link, pins the configured/public roots and both public parents, and rejects symlinks, cross-device publication, pre-existing base or sidecar names, malformed evidence and ambiguous IDs. File, parent and new-directory ancestry fences are present from initial staging. Existing permissions are not repaired.
- Public publication uses exclusive same-filesystem hard links. Enhanced creation publishes its sidecar first. Both public siblings, both private witnesses, immutable byte images and the exact private intent are classified before rollback and between sibling removals. Unknown/changed/newer evidence retains the whole pair and intent. A warm-visible committed marker is re-fenced before private evidence is released. Private resolution and intent-last cleanup support a second fresh replay.
- Opaque process-private capabilities are one-use, scoped, expiring and invalid across another port/restart. Expiry releases the live capability but does not authorize deletion. Failed or ambiguous reservations retain evidence and block dependent C1 creation; startup refuses unresolved evidence before listen.

The null-sidecar interval remains explicit: a nonparticipating writer can insert a sidecar after inspection and before base linking. The prepared interference test expects that base can have been published and then requires retention of the whole pair/intent. No null placeholder, cross-path atomicity or external-writer exclusion is claimed. Committed private cleanup does not undo later customer edits. Legacy `/quizz` still uses opaque `saveQuizz`; A covers native composite creation/import and does not close that legacy creation interval.

## Static evidence actually run

Evidence directory: `c1-prototype-a/`.

| Check | Actual result and limit |
| --- | --- |
| `audit-source.mjs` | Exit 0; exact four protected paths; original native CRUD/API/startup byte-identical after erasing only approved additions; source SHA-256 inventory captured. |
| Protected ceilings | Config 18/30 touched; API 15/22; startup 4/14; new native test 262/280 lines. |
| Prettier | `format-candidate.exit` 0 over the scoped source files. |
| Scoped no-emit TypeScript | `types-candidate.exit` 0, empty log; existing `tsconfig.r2.json` covers storage and its imports plus scoped R2 tests. This is not the full socket/API/native-test project graph. |
| Files-only official freeze | `freeze-candidate.exit` **1**: exactly config/API/startup baseline mismatches. The UI-only freeze policy does not encode these separately approved C1 hooks. Guard/manifest/approval files remain unchanged; this is not a green guard result. The exact allowlist audit also checks the new protected test. |

The first scoped typecheck reported four errors in the synthetic child's `rmdirSync` wrapper; its two-argument wrapper was corrected to the actual one-argument signature. Original `types.log`/exit and the later clean logs remain available. Earlier foundation evidence is historical and superseded for wiring status. The first staged whitespace check exited 2 because captured Windows receipts contain CRLF; those raw files and the diagnostic are retained. Rechecking with the command-scoped Git `cr-at-eol` setting exits 0 (`whitespace-final.*`); no repository/system setting or source was changed for that check.

## Prepared acceptance, not executed results

The static case inventory is **35 prepared cases: 5 fence primitive, 4 scope, 16 reservation and 10 actual native integration**. This is a source count, not 35 passes.

Coverage prepared includes V1/V2 create/export/import and fresh IDs; full authored metadata; frozen single allocation and bytes; orphan/collision denial; scope failure before allocation; EXDEV; sidecar EEXIST; private identity replacement; changed/higher revision or unknown intent; missing witness; expiry and consumed/foreign/reentrant capability; warm commit/directory-fence failure with repeated fresh refusal and recovery; and the honest legacy interference outcome.

The native matrix uses real production API JWT/session middleware for two tenants, actual native CRUD/preparer and idless sentinel preservation. It adds a pending tenant operation interrupted before return, flips accounts off and requires two new-process replays to restore the previous tenant state. Six separately prepared real SIGKILL boundaries are before public linking, after sidecar link, after base link/before return, visible committed marker, private witness cleanup and before resolved slot removal. Process receipts include PID, signal, timeout, immutable bytes, hashes, modes and inode/device identity; two replay PIDs must differ from the interrupted process. SIGKILL does not establish power-loss durability.

Future qualification must set `C1_FIXTURE_ROOT` to an explicitly owned persistent same-filesystem scratch directory and retain receipts via `C1_RECEIPT_ROOT`. The guarded default temporary directory is only a synthetic functional fixture and supplies no persistent-storage qualification. Tests skip non-Linux; no Windows functional execution was attempted. Runtime execution waits for the manager's resource grant and independent review disposition.

## B and remaining release gates

[C1_B_NATIVE_WRITER_HOOK_MAP.md](C1_B_NATIVE_WRITER_HOOK_MAP.md) maps the actual native config/media, composite/sidecar, Media fast paths, physical binding, journal and startup writers, proposed exact protected deltas and a built-in SQLite cooperating-process mutex candidate. It requires a durable dirty marker before filesystem mutation, complete-operation ownership, narrow nested participant authority, compatible replay, correct cleanup ordering and explicit tenant-owner discovery. SQL rollback never undoes filesystem operations. **B is proposed only; no B protected edit or implementation is included.**

Next: independent A source review, granted Linux functional/fault/process qualification, then approved actual B writer enforcement and its contention tests. Tenant discovery for historical Media/R2 families, F1 durability and hardware/storage qualification remain separate gates. The existing R2 full-suite receipt remains 813 PASS / 6 FAIL; no C1 source work turns it green or reruns it. Original three source tasks and HQ remain OPEN. No push, merge, deployment, credentials/provider/billing change or customer-data migration occurred.
