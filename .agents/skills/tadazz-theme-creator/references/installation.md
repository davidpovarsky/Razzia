# Authenticated installation

The server keeps this OFF by default. It requires account mode, a persistent JWT
secret and `TADAZZ_THEME_INSTALLER_ENABLED=true`. A server administrator assigns
review/publish/platform grants using `TADAZZ_THEME_WORKSPACE_GRANTS`:
`{ "reviewer-account-uuid": { "owner-account-uuid": ["review", "publish"] } }`.
Each manager has author access to their own workspace. Platform publication
requires a separate `platform` grant and workspace. No manifest field can assign
these rights. Do not change credentials or activate production as a side effect.

Set `TADAZZ_THEME_SERVER` to the authorized HTTPS origin,
`TADAZZ_THEME_WORKSPACE` to an assigned workspace, and `TADAZZ_THEME_TOKEN` in the
private process environment. Never pass tokens on the command line, put them in
links or commit them. Loopback HTTP is accepted inside the isolated remote QA
environment. The client rejects redirects rather than forwarding credentials.

Run the repository CLI with absolute file paths:

```
pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts package MANIFEST ASSET_ROOT PACKAGE_FILE
pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts upload PACKAGE_FILE
pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts revise ARTIFACT_ID PACKAGE_FILE EXPECTED_REVISION
pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts preview ARTIFACT_ID
pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts qa ARTIFACT_ID PRIVATE_EVIDENCE_DIRECTORY
pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts request-review ARTIFACT_ID
```

`upload` validates actual bytes locally and on the server; success returns
`VALIDATED_PRIVATE_DRAFT`, not a published theme. The package is bounded JSON
with individual media bytes; it is never extracted or executed as an archive.
The preview URL requires the assigned manager session. `qa` requires the remote
QA marker and writes screenshots/audio tracing for all fifteen slots, sixteen
events, eight locale maps and reduced motion in Chromium/WebKit.

An assigned reviewer uses their own session and records an actual human review:

```
pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts approve ARTIFACT_ID REVIEW_FILE
```

`REVIEW_FILE` contains `approved: true`, `expectedRevision` and `manifestSha256`
from the exact successful QA receipt, the actual `qaEvidenceSha256`, and true
`rightsReviewed`, `contentReviewed`, `accessibilityReviewed`,
`performanceReviewed` fields. Do not manufacture these assertions. The server
rejects approval by any draft contributor and rejects stale revision/digest
receipts. An assigned reviewer can return a review using `reject ARTIFACT_ID
REJECTION_FILE`, whose JSON contains `expectedRevision` and a plain `reason`.
The author can then revise and repeat validation and QA. Existing owner approvals remain valid within their
scope, but they do not bypass an assigned independent reviewer.

An authorized publisher then uses `stage ARTIFACT_ID` and `publish ARTIFACT_ID`.
Draft/validated artifacts can be revised with a matching revision; this clears
uploaded assets and invalidates old preview tickets and review receipts. Staged
and published versions are immutable. `rollback ARTIFACT_ID`
accepts a previously signed published version. The active version becomes the
offered catalog choice; older authored selections and running rooms remain
available at their pinned version. API state mutations and authenticated access
are audited. Publication never executes uploaded code or changes the voting
engine. A code-backed addition needs a reviewed renderer registration and a
matching committed build record before it can pass approval.
