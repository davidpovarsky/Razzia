# Explicit host-only composition identity

`@tadazz/mcp-foundation/composition-preview-v2` exposes
`createCompositionPreviewIdentityV2(prepared, draftId, assets?)`.
The genuine D `prepareCompositionPreviewV2` capability is required. The helper
calls `getCompositionPreviewDigestContentV2(prepared)` and retains its **entire**
returned content. It also binds the prepared context (role, locale and motion
policy) and exact draft revision. Pass the result to the existing
`previewIdentityDigest`; no second MCP digest implementation exists.

This explicit version-2 content envelope is distinct from the existing version-1
envelope. Version-1 serialization and duplicate-ID rejection remain unchanged.
The MCP0.1 tool schemas, metadata and injected Preview dependency still accept
only version1 for accepted renderer success. This identity helper itself does
not connect version2 to those tools. The separate optional development candidate
adapter documented in `PREVIEW_CANDIDATE_V2.md` retains the unchanged unavailable
failure and adds its own versioned metadata, without accepted executable status.

Optional assets come from a trusted host's real resolved manifest. The helper
unions exact `(assetId, sha256)` pairs with D's declared preview assets, retaining
different native-family digests for the same ID. The serializer orders by ID then
SHA and rejects duplicate exact pairs. No URL or complete theme definition is
added by this adapter. The caller still verifies asset rights and exact renderer
acceptance; a content digest supplies neither.

D's document SHA remains a field inside its full content, never the MCP digest.
Current prepared plans may have a null compiled pin and unavailable resolution.
The helper does not create a pin, alter that state, mount a renderer, accept a
cloned controller, save native data, add a clock or enable G/the widget.

The source depends on the reviewed D core composition modules. Validation must
use the real combined source or an immutable exact-Git D overlay, never a schema
shim. Existing D preparation, renderer candidate assertion and E executable
loader/pin/rights acceptance remain separate required boundaries.
