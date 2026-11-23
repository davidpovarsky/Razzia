# R1 test-only native adapter packet

Prepared 2026-11-15 against production blobs reviewed at `66b4535632ee6cd4bbc4515e7d3ab9004fe1915e`.
No production changes, native adapter mocks, package/lockfile edits, installs,
runtime tests or builds occurred locally at this checkpoint.

`storage/native-binding.test.ts` adds nine ordinary tests, not expected-failure
or skipped tests. Each uses the actual protected native `saveQuizz`, `getQuizzById`,
`updateQuizz`, `deleteQuizz`, `getPath` and its scope middleware. The explicitly
single-user fixture sets accounts disabled; this packet makes no tenant-discovery
or authenticated-route coverage claim. Existing native config/media regressions
and future F1 account gates remain separate.

Six child-process scenarios cover media detach, V2 base-write, V2 sidecar-write,
foreign ID-derived filename collision in media and quiz recovery, and a
sidecar-only negative record in media recovery. Native save generates the actual
21-character Nanoid and a distinct random-suffixed basename. Both fresh startup
attempts call the exact production startup callback shape, preserve default
throw-on-unresolved behavior, and record raw state before any recovery outcome
assertion. Tests demand original basename/bytes, full rich V2, binary bytes,
unrelated file bytes, no invented ID-derived twin and clean replay for positives;
negative records must retain foreign/sidecar-only bytes and fail closed with a
journal. Separate PIDs are checked. An idless sentinel is installed only after
all GET/setup calls and SIGKILL; no getter is allowed to normalize it thereafter.
The fixture exclusively owns and cleans its nonce-verified temporary root.

Two tests record native composite create → GET → enhanced export logical digest
witnesses, including public-schema stripped input. The third digest test records
the actual native writer's stripped-field baseline. Logical payload digest excludes
the storage ID; ownership requires a distinct raw-byte hash. No schema-stripped
comparison is substituted for raw ownership assertions.

Local preparation: Node 24.22.1, formatting exit 0, scoped strict TypeScript exit 0,
official freeze files-only exit 0 (602 protected files; existing nine approved
historical seam hashes unchanged). `checks.json` and logs record actual results.
This is not the full UI check: the legacy UI allowlist rejects this approved
server lease, so that older rejection remains in the prior evidence.

Manager approved the separately documented exact V2 semantic-oracle patch. Old
e583 dedicated 8/10 and full-suite 766/768 FAIL receipts are preserved verbatim;
no new pass or second-replay claim is made before the bounded server run.

## Assigned server commands

New paths only: `source/recovery-r1-<exact-test-only-SHA>`,
`fixtures/recovery-r1-<exact-test-only-SHA>/work`, and
`evidence/recovery-r1-<exact-test-only-SHA>` under the existing QA root.
Container `tadazz-hq-recovery-r1-20261115`: 0.25 CPU, 2 GiB, network none,
one worker, no ports and synthetic temporary data only. Recheck actual CPU,
memory and disk margin before starting; release the runner after completion.

After checksum-verified extraction and offline frozen dependency preparation,
run from `/work/extensions`:

```sh
RECOVERY_PROCESS_RECEIPT_ROOT=/qa/process-v2 node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage/process-interruption.test.ts -t 'quiz-(base|sidecar)-write' --maxWorkers=1 --no-file-parallelism --reporter verbose
RECOVERY_NATIVE_RECEIPT_ROOT=/qa/native-r1 node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage/native-binding.test.ts --maxWorkers=1 --no-file-parallelism --reporter verbose
```

Retain exact exits/logs, all failure receipts, input hashes before/after and
container resource identity. No blanket full-suite rerun, production fix,
assertion relaxation, release or task closure is authorized by this packet.
