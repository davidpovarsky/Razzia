# Real native catalog metadata for MCP

The optional `oauth.catalog({ locale, translate })` factory supplies the existing
`Catalog` dependency. Pass it explicitly as `oauth.remote({ dependencies:
{ catalog, ... } })`. No route, root configuration or default feature is enabled.
The API is exported through the existing `./oauth` entry; there is no new package
or dependency.

`list_themes` reads D's genuine immutable `getNativeShowLibrary()` and its actual
Classic/Razzia IDs, versions and definition digests. Only ID/version/title and
fixed false preview/export flags leave the service. Definitions, code, assets,
URLs, manifests, base64, private account data and keys are not projected. D's
`showThemeText` resolves the manifest's own language resources; the required host
`translate(key, language)` callback uses the existing i18next instance for fallback.
The required synchronous `locale(principal)` callback supplies the authenticated
profile's existing en/fr/de/es/it/ja/tr/vi language, not a model-provided owner or
locale. Missing/oversized translations and unsupported languages fail closed.

An actual compiled renderer pin and actual asset/export policy are separate
boundaries. Native metadata, code-backed status and a V2 development candidate do
not set previewAvailable/exportPermitted true. These flags stay false in this
metadata-only adapter. No package provenance is interpreted as a rights grant.

The existing OAuth issuer owns its unforgeable principal capability and live
account/session/grant. The catalog checks the issued capability, exact issuer/
resource/account/client/subject and current catalog.read scope against the real
tenant ledger before and after host callbacks. The ledger opens read-only and
never creates a missing family, writes audit/draft rows or repairs a journal for
this read. The existing corrupt/uncertain-family protections remain binding.

Pagination uses a bounded <=128-character opaque `nc1` continuation. It binds
exact native catalog/definition/title snapshot and language, offset, authenticated
owner/subject/client/grant/issuer/resource and tool name. HMAC uses the existing
persistent issuer key with a distinct catalog-cursor domain; it does not reuse
OAuth codes, native-save consent proofs or bearer credentials. Cursors carry no
authority: every read rechecks a live catalog-scoped grant. Tampered, wrong-grant,
wrong-account, changed-language/snapshot and out-of-range continuations fail.
Changing page size is permitted; the cursor fixes the next exact offset. Existing
keys and metadata allow legitimate cursors to survive issuer reconstruction.

D's native theme families are not authored-game templates. No authoritative game
template provider is currently attached here, so `list_game_templates` retains
DEPENDENCY_UNAVAILABLE after real catalog-scope checks. It does not return fake
empty completeness, synthetic QA shows or theme manifests as game templates.
The frozen0.1 inputs/outputs, eight tools and their scope/annotation rules remain
unchanged. Root composition and G's widget are owned separately.
