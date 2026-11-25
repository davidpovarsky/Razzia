# Independent review: billing deployment probe and app/tool coordinator

## Decision

**Accepted with no remaining static blocker.** This is acceptance of the exact verifier and coordinator bytes, not a redeployment result. The qualified application remains source 34568c5c937a51d236a440513adeb9bf93637525 and image 56de89dd9ca496595980af84a7187b49fbff8c0cb563c3393c269d2b7c09d82a.

Verifier SHA-256: 6897dee11b1535172fd297c04c870449d361a25fc58b9a2764d39504b453a9f1.
Coordinator SHA-256: 4700e9ca1e0f0b9ff830e54cb1893bdc67d30403091ef338a845abb8f45e2c99.

## Probe compatibility and guard preservation

The old verifier expected only enabled=false. The qualified route additionally exposes configured, environment and catalogAvailable. The new billing-specific probe accepts exactly the legacy singleton or the exact current four-field object. All three current boolean fields use identity with False, so integer or floating-point zero cannot pass. Only sandbox and live are valid environments. Tuple membership safely rejects array, object and null values without an unhashable-type exception.

Invalid values still raise PROBE_JSON_VALUE with the original sanitized response diagnostic. The real HTTP status, content-type, body-size and timeout handling are unchanged. Body contents, private headers and capability queries remain excluded from failure metadata. The generic JSON equality check is unchanged, and other endpoints retain their existing strict checks. The exact legacy singleton remains accepted for old-image preflight and rollback.

I reviewed the complete diff and independently compared AST nodes against the frozen application commit. Changes are confined to the new billing probe, its base_probes call, the synthetic probe self-tests and their inclusion in self_test. All other functions and top-level nodes, including identity/configuration/backup/deployment/rollback gates, are unchanged.

## Existing test evidence reviewed

The separately produced test receipt matches SHA-256 a1c5af853e2d91c246b5262388537ae75df86d9b7f64f8cdd6949c0d32f4db29. It records 79 passing Linux self-test checks. Focused coverage includes six accepted full base-probe cases, 47 rejected schemas, six transport/parser failures and two unchanged generic-equality/privacy cases.

The fake boundary is the HTTP opener. Tests exercise the real request, JSON parser, billing validator, base probes and diagnostic serialization. They cover numeric zero for every boolean, missing/excess keys, invalid environment types and sanitized failures. I inspected these tests and their exact-source receipt; I did not rerun them.

## Application/tool coordinator

The new coordinator requires a separate tool commit with the frozen application as ancestor and an exact one-file diff. It verifies current HEAD, committed tool bytes, SHA-256 and working bytes before transfer, then rechecks decoded and stored bytes remotely. The tool is stored in a dedicated release-receipts/deployment-tools/<toolSourceSha> namespace, with separate logs and app/tool provenance. It does not overwrite the qualified application source.

The application image/revision, staged state, live container/image/gateway/count, stage/config pins, backup qualification pins and OAuth pins remain unchanged. The existing graceful SIGTERM and rollback waiting behavior is retained; no hard kill is introduced. The deployer imports only standard-library modules and has no adjacent-file or cwd dependency, so relocating it is supported.

Both the coordinator and its extracted remote program compile with dummy configuration. Neither was executed. The separate tool-source commit and deployment-tool-source.json are still prerequisites enforced by the coordinator.

## Review scope

Only source and receipts were read, a Git object was read without mutation, ASTs were compared and syntax was compiled. The only writes are this review and its JSON receipt. No tests, deployment, network/Docker operation, product edit, commit or production action was performed.
