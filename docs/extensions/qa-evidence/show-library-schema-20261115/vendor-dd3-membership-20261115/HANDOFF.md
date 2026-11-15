# Exact retained pnpm membership observation — 15 November 2026

Lane D, chat 01a1dfa9-ad07-7df0-88dc-9c11a9e14fe9. Source activation
b6ad96ffe13c56c04a6ce27e72330fe0e217622a. This is a read-only evidence
successor to actual-dd3-data; it does not replace older failed receipts or
register an executable renderer.

Actual strict-key SSH/Python reads found SQLite3, 4,349,952 bytes, in the exact
retained pnpm-store/v11/index.db. There were no WAL/SHM/journal companions.
The schema has package_index(key TEXT PRIMARY KEY,data BLOB NOT NULL) and
package_index_alias(key TEXT PRIMARY KEY,target TEXT NOT NULL), WITHOUT ROWID.
Opened using mode=ro&immutable=1 and PRAGMA query_only=ON. No installation,
repair, extraction, new container, remote output or service change occurred.
Runtime claim lane-d-vendor-20261115 (0.125CPU/512MiB) was released after the
synchronous probes/collection; new remote disk consumption is zero.
Before read: 2,685,575,168 bytes free and MemAvailable10,679,308KiB.

PASS: exactly106 allowlisted module files plus five package.json and five
actual index-listed LICENSE files. All116 were regular files whose SHA512
and size matched the decoded original index rows. Observed SHA256, SHA512,
mode, size and exact CAFS paths are retained. Package metadata and license
raw bodies are base64, independently rehashed locally. Five actual package
metadata records declare MIT. No image-rights assertion follows from that.

Index blobs use msgpackr record extensions (0x72). The narrow fail-closed
decoder retains raw base64 blobs and original rows. Its output was checked
against actual file bytes by the remote collector and independently joined
to dd3's exact Git lock bytes by summarize_membership.py. Locked integrity
equals each main index key. tarIntegrity differs and is preserved separately;
each actual package_index_alias maps that tar key to the locked main index.
No tar hash was substituted for a file hash or lock integrity.

The database's complete before/after size/hash/mode records matched. SUMMARY.json
records the exact lock SHA, package counts and limits; package-sources.candidate.json
contains116 real SourceRecord-shaped observations. The original106 graph module
mapping and frozen c35 schema/runtime/barrels were not modified or executed.
Local commands: py -3 decode_index.py and py -3 summarize_membership.py exit0;
SSH collector exit0. The accidentally selected Windows python shim returned
exit0 without executing; the actual decoding used py -3. Historical c35 53/53
and focusedTC were not rerun and do not become publication acceptance.

Remaining: exact dd3 build-to-physical-cache mount provenance and rendered
module contribution metadata, complete toolchain/argv, actual renderer Ref/ABI,
six image rights, font/environment proof and production immutable loader
acceptance. Those are distinct from the observed retained-cache membership.
Trusted host receipt arrays remain empty; no compiled pin, export entitlement,
renderer execution or positive publication acceptance was created.

Existing cache-discovery.log and cache-index-discovery.log remain untracked and
unchanged. The new observation files are independently named. No source/customer
data, backups, retained fixtures, keeper or volume was modified.
