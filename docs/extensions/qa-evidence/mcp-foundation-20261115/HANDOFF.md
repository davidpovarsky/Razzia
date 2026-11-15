# M2_TOOLS foundation handoff — 15 November 2026

The isolated MCP foundation is ready for independent source review. It is
unpublished, unmounted and feature-off by composition. Research design delivery
is committed separately in `80f4bb286ac431a235771ab4c4b1a7802ea7e13f`.
The implementation commit is the commit containing this file; exact tested bytes
are identified by `final-input-manifest.json` and `validation-summary.json`.

Branch: `codex/tadazz-hq-mcp-20261115`, application base
`8a43c99c65d8923bd23d8c57ac3607e9a09b5764`.
Worker chat: `01a1dd19-f64c-7193-8a74-9ad7b2c66e2d`.
Manager: `01a1dd10-2ef0-73c2-9c65-569a843f44da`.

## Delivered source

- `extensions/src/mcp-app/contracts`: strict eight-tool MCP0.1/UI1 schemas,
  metadata and one browser-compatible canonical identity-envelope serializer.
- `extensions/src/mcp-app/server`: actual pinned SDK factory, registration,
  scope/ownership enforcement, real public core authored validation/preflight,
  exhaustive dispatch and fail-closed preview verification.
- `extensions/src/mcp-app/tests/server`: test-only identity/repository adapters
  and real MCP client/server linked-transport tests.
- Isolated `package.json`, `pnpm-lock.yaml`, `tsconfig.json`; no root/shared
  dependency changes, protected-source changes, source rewriting or editor effects.
- Canonical adoption addendum records internal SB port2; strict MCP0.1/UI1 and
  authored format1 remain unchanged. No SB schema, mapper or engine was copied.

Missing real dependencies fail closed. The empty UI resource makes no interactive
preview claim. Preview must import the accepted SB producer when available.
Actual authoring answer bounds are preserved (5 valid, 6/64 rejected); the native
UUID versus preview-prefix boundary is demonstrated with the real schema.
Ordinary authorized read/export has no added per-action consent; durable save
still requires the adopted exact-revision consent and storage guarantees.

## Actual validation

The assigned server ran the final 118-file source graph in the owned container
`tadazz-hq-mcp-foundation-20261115`, UID1001, 0.25CPU/2GiB, network `none`,
no published ports, production mounts or credentials. Node24.22.2/pnpm12.18.0.
Image source was not used to satisfy application imports.

Commands (working directory `/work/extensions/src/mcp-app`), with all exits 0:

```sh
pnpm install --ignore-workspace --frozen-lockfile --offline --ignore-scripts --store-dir=/fixtures/pnpm-store --reporter=append-only
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json --test --test-concurrency=1 tests/server/*.test.ts
node /cleanup/node_modules/prettier/bin/prettier.cjs --config /fixtures/format-options.json --check "/work/extensions/src/mcp-app/**/*.ts" "/work/extensions/src/mcp-app/**/*.json" /work/extensions/src/mcp-app/server/README.md /work/docs/extensions/plans/MCP_APP_ADOPTION_20261115.md
```

Tests: **18 passed, 0 failed, 0 skipped, 0 cancelled**. Cases cover discovery and
resources, five-question drafts/Q3 edits, CAS conflicts/concurrency, idempotency,
account isolation and revoked replay, seven invalid principal variants, missing
dependencies, safe errors/rate limits, authoring/media boundaries, ordinary export
delegation, canonical envelope and native UUID compatibility. These use synthetic
adapters only inside tests; they do not establish real account integration.

Input manifest SHA256:
`c4dc04deb2d80953e13fe1771686c1e00e293048c66f8b7a0365879643ee8d68`.
Archive SHA256:
`6d73388846e5bec32d0b0e1147078db9b0d50f469b2d9234ca07cb3c5d309897`.
Isolated lock SHA256:
`dc7d7a9c51674163dd26326a9d7f6b58e5978a8eaeb24ed293aad72a5dc6befe`.
All118 hashes matched before extraction and after the final checks. Public
registry dist/integrity records match the isolated lock. Pinned SDK versions are
server/client/core2.4.0 and ext-apps2.1.0; older vulnerable example pins were not used.

Raw logs, command scripts and failed attempts remain under `attempt-01` and
`attempt-02`. The first successful runtime test attempt exposed two compiler
annotation errors, corrected in the final delivery. A cold offline reinstall
then lacked this job's isolated pnpm metadata cache. After copying only the job's
own public-registry cache, explicit frozen offline install and direct compiler/
test commands passed. No network was enabled for the final checks.

## Guard result and limitations

Read-only static preservation inspection: 602 protected files, 593 unchanged
hashes and 9 already approved baseline seams; zero unexpected protected mismatches,
zero unleased tracked changes, root lock unchanged. This is source inspection,
not a functional Windows test.

The unmodified `node extensions/qa/tds-boundary.mjs` **failed, exit1** because its
historical allowlist rejects exactly the 21 newly leased MCP module paths.
Its protected mismatches array is empty. The guard was neither changed nor waived.
Full `ui:check`, full build/lint/CI and browser/device checks were not run.

HTTP/Origin/HTTPS/body enforcement, real OAuth/private storage, accepted SB port2
producer and renderer, actual interactive host UI, durable save/reopen/recovery,
and real download remain unavailable and require later integration/acceptance.
The original MCP02/03/04/05 and HQ tasks remain OPEN. MCP01 research stays DONE.

## Allocation and next review

The owned container was explicitly stopped after checks; readback reports
`Running=false`, `OOMKilled=false`. Its stop exit137 is termination of the idle
container after validation, not a test/OOM result. The 0.25CPU/2GiB allocation is
released. Bind source, fixtures and evidence remain preserved under the exact
manifest namespace. No other worker or production allocation was touched.

Next: independent QA source/evidence review, then manager disposition of the
foundation and the unchanged historical scope guard. No push, merge, deployment,
provider/billing change or original runtime completion is implied.
