# Native media content crosswalk to existing Git sources

This is routine SB-01/SB-05 provenance progress using existing local Git objects. No fetch, download, media copy, product edit, test rerun or rights authorization occurred.

Executed `trace_git_sources.py`, exit 0. It joins the previously verified 35 native media contents to exact blob IDs and checks matching source bytes against the prior SHA256/size observations. The current native paths remain identical to that earlier source snapshot.

- Nine contents match both the local `4.0.1` tag (commit `5161eb7022144ee26d46a5f94cdbc714ec8b560d`) and local `upstream/main` ref (`8345663f7f47a8d466964fcf5b642cc7a4ed90fb`): eight legacy sound files and the Razzia background. The background matches `packages/web/src/assets/background.png`; its different current public URL does not imply modified content.
- Seven image contents also match `docs/extensions/references/user-20261106/extracted/` files. Their exact sizes/SHA256 agree with that snapshot's `manifest.json`, including the teaser image whose filenames differ between the snapshot and public path.
- Fifteen additional current-tree paths share the native blobs: seven reference paths, seven public aliases, and the original background source path. These are content aliases, not renamed or consolidated assets.
- Nineteen contents have neither of these two particular source matches. This does not invalidate their other existing notices or claim that no other provenance exists. Their origin/rights review remains separate. The five embedded Lottie PNGs are not standalone Git media in this 35-file crosswalk and retain their earlier unresolved-rights status.

`observation.json` records the exact local refs/commits, full tree command/hash/byte counts, raw matched tree rows, each native-to-source mapping, matched content readback, and the archived reference manifest body. Both refs and HEAD stayed unchanged during observation. The tag is a lightweight local reference; remote freshness, tag authenticity/signatures, original uploaded archive and uploader authority were not verified.

The tag's root software license bytes are compared with the current root notice and recorded without inferring an asset-specific license. Byte identity, a familiar path, or a repository reference snapshot supplies no new redistribution/export/runtime grant. Existing asset IDs, manifests, rights enums, renderer references and pins are unchanged. Full original source-task acceptance remains OPEN; this progress needs no immediate cross-domain decision.
