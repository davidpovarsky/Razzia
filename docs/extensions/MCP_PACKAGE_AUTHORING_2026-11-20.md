# Native package authoring through MCP

This change connects the existing portable `.tadazz` engine to the existing
first-party MCP service. It retains the service identity, the existing fourteen
game tools, the account/session authority, and the five existing OAuth scopes.
The added eleven tools cover the package lifecycle; tool discovery alone does
not activate a worker, enable a runtime, install a theme, or publish a game.

## Tool-to-native mapping

| MCP tool                     | Native operation                                                              |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `get_authoring_capabilities` | Read installer/runtime flags and validate runtime origin configuration        |
| `list_packages`              | Owner-scoped `PackageStore.list/details`, signed snapshot pagination          |
| `begin_package_upload`       | Durable exact-size/SHA-256 staging reservation                                |
| `write_package_upload_chunk` | Sequential, resumable, digest-checked staging                                 |
| `complete_package_upload`    | Verify complete bytes and invoke native archive preflight/upload              |
| `get_package_status`         | Accept a completed isolated worker receipt and read native status             |
| `build_package`              | Queue the existing isolated worker for an exact revision                      |
| `preview_package`            | Open the bundled game using its package definitions and native preview clock  |
| `delete_package_draft`       | Delete an owned uninstalled draft; reject installed/building packages         |
| `install_package`            | Prepare or replay an immutable first-party save consent                       |
| `export_package`             | Enforce native export rights and issue a purpose-specific download capability |

The first-party wrapper validates an actually issued principal and its current
account, session, client, grant, and scopes before and after every awaited
operation. A copied principal object or an owner/workspace supplied in tool
arguments is not authority. Revoked grants cannot replay earlier outcomes.

## Upload and replay behavior

The archive budget remains the native 180,000,000-byte limit. MCP chunks contain
at most 24,000 decoded bytes, keeping JSON below the existing ingress limit.
The optional first-party binary upload URL accepts only the declared bytes and
digest. It grants no read, build, installation, or account-library permission.
Transfers expire after 24 hours; upload and export URLs expire after five
minutes. The native listener admits at most two simultaneous large uploads.

Upload, export, build, and deletion operations retain owner-scoped durable
idempotency. A changed input with the same key is rejected. An uncertain
cross-store mutation is not blindly repeated. Native upload/installation retain
their existing durable recovery. Known validation failures before a mutation
remain retryable.

Export, upload, and renderer capabilities use different signed domains. A
runtime ticket never grants access to the private source archive. Proxy routes
exclude these bearer URLs and consent paths from inherited access/error logs.
Only the archive upload route receives the larger request-size/time budget;
ordinary MCP JSON ingress and unrelated application requests retain their
existing limits and handler deadlines.

## Preview before account save

`/studio/package-preview/:uploadId/:revision/:gameId` is an authenticated Studio
route. Its server response binds the authored game, package definitions, media
hashes, and runtime URLs to the exact owned source/build/revision. It never
installs content. The provider revalidates the immutable receipt and renews
short-lived media/runtime access without restarting every question phase.

The renderer reuses the native application preview session, `AudioCuePlayer`,
`ThemeSandboxHost`, and the public scene projection. The frame receives no
account authority, roster, raw authored answer key before results, or scoring
authority. Authored leaderboard scenes now project their actual standings and
optional question/elapsed metadata. Old v1 renderers receive the old strict
snapshot shape; new metadata is negotiated in a separate capabilities message.

`/studio/package-save-consent/:requestId` shows the selected package contents.
It binds approval to the owned revision, source/build hashes, and selection.
Loading the page or preview never approves a save. The page receives the same
no-store, no-referrer, and anti-framing headers as the existing consent pages.
Only an explicit action in that page invokes native installation. The existing
independent theme review requirement still applies. Private installation does
not publish a package to a public gallery.

## Release prerequisites

Source changes do not establish production readiness. Qualify the exact source
and frozen dependencies, build the native preview admission manifest and site,
exercise the actual package worker in its networkless budgeted sandbox, and
verify the package runtime on a separate cookie-free HTTPS origin. Preserve the
existing OFF path when configuration is absent. Do not replace isolation with
an environment flag or forge a build/review receipt.

Deploy only a qualified immutable candidate through the existing operator
process, with an active-room check, private backup, and usable rollback. Verify
the live `tools/list`, native capability result, real package upload/build, and
the authenticated preview route after deployment. Existing connected clients
may need to refresh discovery after the same service is updated.

Focused regression coverage is in the package protocol/OAuth suites, transfer
store tests, package projection/preview tests, and native consent/transport/proxy
tests. The existing fourteen-tool behavior and authentication boundaries remain
part of the release gate. A synthetic renderer/browser test is useful evidence
but is not a production worker or installation receipt.
