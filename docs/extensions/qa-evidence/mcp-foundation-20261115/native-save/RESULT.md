# Native Save consumer: real F authority to B durable native operation

Product `605619cc5525f6a89035bbdb084ba52cc7644f42`; shared browser DTO prerequisite
`5cba04f399d10c597f4cd6dc1cbfbb2b77041d58`. Export prerequisite `2d6d11d` is part
of this branch history: its exact enhanced-bundle converter is reused to capture
one immutable native snapshot. No export rights permission is inferred.

B producer pinned to `1909da2f653377c545923b2e91dd2f4b1a2cf802` throughout the
runtime build and final type check. Only F-owned product files changed. The actual
C1 allocator, operation registry, native config reader/writer, real native
manager middleware/session/account database, F issuer/token verifier, durable
tenant grant ledger, authoring converter, HTTP tool dispatcher and shared DTO
are exercised. No fake account verifier, in-memory storage port, copied native
engine, alternate ID allocator or authority/schema stub substitutes for them.

## Result

Final `native-run-06`: **10 passed, 0 failed, 0 skipped**, exit0. Actual runtime is
Node26.11.1 on local WSL Ubuntu, Linux6.18.33.2-microsoft-standard-WSL2; filesystem
magic61267 (ext4). It is not an Oracle/Docker Node24 or browser run. The immutable
bundle has275 inputs and SHA256
`6ed1b801f66d47c676a7ee049c661cd5f6157f60f2b5f2a4fc5ce0f4ea701897`.
`types-final-03`: TypeScript5.9.3,449 inputs, **0 diagnostics**, against the actual
same B Git source pin and existing normal installed dependencies. This is scoped
production/test verification, not a full repository/root pnpm check.

The cases cover:

- A real native manager inspects the selected account/client, exact revision and
  authored snapshot, approves its session-bound proof, then the original
  `save_game` key publishes through actual C1. Approval alone allocates nothing.
  Actual `getQuizzById` reopens the saved native base, and the real sidecar's five
  question IDs equal the originally persisted native snapshot.
- MCP tokens, another account, copied proof from another native session and wrong
  Origin cannot approve. Same grant/tool/key with altered input fails before a
  mutable draft read. Repeating pending consent returns the same request.
- Draft edits after inspection or after approval cannot upgrade the snapshot.
  Revoking the approving session blocks new physical publication.
- No native adapter/machine endpoint exists when the option is absent; disabled
  account scope rejects access; client refresh-token revocation denies the grant
  and native approval. Global and both tenant sentinel bytes remain exact; the
  other owner's native quiz directory remains empty, and no global quiz root is
  initialized.
- Simultaneous same-key calls return one real target. An altered persisted intent
  MAC cannot authorize a save.
- Three separate child processes genuinely self-SIGKILL: immediately before actual
  C1 create, after actual native commit before F outcome, and after actual F SQLite
  COMMIT before reply. Three fresh Node children retry the same real token/key.
  Each resolves one original operation/target. The after-native case first changes
  the mutable draft to revision2; retry still returns the original revision1.
  The after-F-outcome case deletes the native base/sidecar, then cached replay
  does not recreate them. See the public checkpoint/reply/verified receipts with
  killed/replay PIDs411/419,427/435,443/451 and SIGKILL evidence.
- An unresolved synthetic journal marker is preserved byte-for-byte with its
  original private DB and blocks further publication. No repair is attempted.

The process-loss checkpoints wrap and delegate the actual C1 methods. The
post-F-commit checkpoint calls the real SQLite exec first and observes its
committed row; it does not synthesize an outcome or a failed commit. These are
controlled process losses, not a power-loss/fsync or arbitrary competing-process
stress guarantee. B's separate reserved/unresolved C1 acceptance remains producer
coverage; this F packet does not relabel that as a new F fault-injection result.

## Source and evidence custody

`final-readback.json` compares all29 F runtime source inputs against both their
immutable build hashes and committed product bytes: all match. The build records
all275 actual source/dependency byte hashes and all B source Git identifiers.
Core/common aliases are the genuine B snapshot, byte-identical to this F branch
for those paths; dependencies resolve from the existing private normal npm graph
and B's installed workspace graph. No install or lock mutation occurred.

The fixture remains at
`/home/david/tadazz-f-native-save-evidence-20261115/tadazz-m3a-synthetic-P33yqz`.
Two separate later WSL invocations verified it after the test session ended.
`native-run-06-public-readback-02.json` hashes18 physical native/sidecar/registry/
private-ledger/sentinel files, including five real operation records, and exports
nine checkpoint/reply/verified receipts. The original uncertain journal remains.
Private synthetic actor descriptors, tokens, signing keys and encryption keys stay
in that owned Linux fixture and are excluded from the committed public evidence.
Generated immutable bundles remain locally available, untracked; regenerate from
the checked-in build script and input manifests for review.

Earlier runs and their raw failure logs are retained. Run01 used the list-reader
`getQuizz(id)` by mistake; the real single reader is `getQuizzById(id)`. Run02
passed all three crash checks but mistakenly asserted IDs on base questions;
question IDs are in the native sidecar. Runs03/04 passed9 and run05 passed10.
The attempted post-run05 readback found its `/tmp` fixtures gone after WSL session
exit; no retained physical custody is claimed for runs01–05. Run06 corrects the
fixture parent to the owned persistent ext4 directory and independently verifies
custody. Application source did not change during these harness corrections.

## Reproduction and limits

From this F worktree, with the recorded real B source and installed dependency
graph present, build an unused `native-candidate-NN` with `build-native.mjs`, then
run it with `run-native.mjs`. Ensure the owned persistent Linux fixture parent
exists. `typecheck-native.mjs types-final-NN` refuses to overwrite prior evidence.
`readback-native.mjs` validates the owned marker/root and emits only public
receipts and hashes. There is no deletion helper or shared fixture cleanup.

The source is optional and unmounted. Manager/E still own real route/page wiring,
HTML and HEAD no-store/no-referrer/frame headers, native login/resume flow, TLS,
keys and host setup. No browser was opened; the editor URL is verified against
the real route source and the saved game is reopened through its native service.
Human first-party page approval, actual host linking, Preview rendering with the
real UI, asset rights and end-to-end production behavior remain unaccepted.
Export policy stays absent/deny until explicit rights evidence. G is not ready;
all four original F implementation tasks stay OPEN and research stays DONE.

Prettier3.9.10 checks all five changed implementation files successfully; the
application staged diff passed whitespace checking before its product commit.
Raw earlier failure TAP whitespace and the original verify-script transcript
remain preserved, so the complete evidence staged diff has whitespace warnings.
