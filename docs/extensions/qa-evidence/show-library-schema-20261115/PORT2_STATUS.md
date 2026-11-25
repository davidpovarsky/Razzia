# Current SB2 internal preview port v2

Adopted by manager: `SB_PORT_V2_IDENTITY_20261115.md`, 15 November 2026.
All internal draft/plan/projection/compiled pin/manifest/fixture/digest-content
portVersion values are **2**; unshipped port1 is rejected. Authored `tada-show`
version1, existing theme/runtime formats, identityRuleVersion1, MCP contract0.1.0
and UI metadata1 remain unchanged. No hidden MCP wire property was added.

Each identity map contains bounded strict arrays of `{authoredKey,previewId}`.
Entries have unique exact keys/IDs and stable UTF8 byte ordering; normalized
authored card arrays retain their authored order. Constructor/prototype/__proto__
are supported as key VALUES when the real authored validator accepts them;
they are never assigned to dynamic object properties. Exact derived correspondence
is checked against normalized authored data. Structural prototype keys, getters,
prototype-bearing objects, forged/missing/duplicate/unsorted mappings and port1
remain rejected. Namespaced SHA256 ID bytes are unchanged from identity-rule1.

Current MAX_ANSWERS5 remains unchanged. Six/64 authored inputs are rejected by
the real validator; synthetic projection cardinalities do not imply authoring
or renderer support. All compiled manifests still have zero accepted pins and
all resolved preview plans remain unavailable. No renderer/director/audio,
server mount/storage/editor/root export or runtime code integration was added.

Server validation allocation: NEW namespace under
`/home/ubuntu/tadazz-hq-qa-20261115/{source,evidence,fixtures}/sb2-port2-<overlaySHA>`,
container `tadazz-hq-sb2-validation-20261115`, max0.75CPU/3GiB, no production
mount/port/config. Installed toolchain and frozen cached dependencies are prepared
in an owned writable staging copy; only delivered baseline+overlay application
source is used. Initial attempts and exact commands/results are retained.

Local execution so far: file editing/export/static inspection only. A bounded
installed formatter is authorized for these new files; functional tests/typecheck
are server-only. Receipts will distinguish actual PASS/FAIL/NOT RUN. No test,
real-stage parity, physical device, provider, host-installation or release PASS
is implied by this status document.

Initial remote preflight: 11,022MiB available RAM,23GiB disk free,arm64.
Direct unprivileged Docker inspection failed at the socket; the already-authorized
`sudo -n docker` works. An initial multiline Bash stdin inspection had a trailing
CR path error; corrected Python stdin inspection succeeded. No permission/trust/
daemon/system changes were made. Image identity observed:
`sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647`.

## Executed outcome

See `HANDOFF.md`, `summary.json`, `validated-source.json` and
`server-validated-28ea/receipt.json`: final80/80 focused tests, typecheck and
formatting PASS;3297 baseline and20 new source hashes match before/after.
`ui:check` remains an explicitly recorded FAIL for only its old20-path scope
allowlist, with no hash mismatches. No guard/baseline rewrite. The0.75CPU/3GiB
network-none container is released. Original source tasks stay OPEN for actual
media/persistence/renderer/interactive/physical acceptance and independent QA.
