# Full-show implementation ledger

Before editing,17 November2026: the accepted V1 projector deliberately refuses
visual assets; V2 is current-question-only, candidate-only and refuses media.
The first-party ApplicationPreviewStage consumes a full authored show and is
not a portable redacted MCP DTO. Do not feed that raw show into the iframe or
weaken V1/V2. The full-show path requires its own versioned current-frame
projection, exact built renderer, real asset delivery and strict SDK consumer.

Initial code scope: server/full-show-assets.ts plus focused QA under
qa/phase3-full-show. Reuse the actual native asset library's exact ID/hash,
family, size and provenance. Read only declared bundled files beneath an
explicit public root after live-principal and rights checks; reject links,
changed bytes, unknown assets, quotas and expired/revoked capabilities. The
capability stays process-local and is not an OAuth token or a renderer pin.
Do not enable arbitrary/customer Lottie or JavaScript through this reader.
Rights metadata alone is insufficient; trusted live and license callbacks are
mandatory and checked again after IO and during streaming. No default rights
grant, new route, production mount, upstream source edit or Widget acceptance.

This groundwork does not finish full-show. Subsequent scope must retain the
existing authoring schemas/identity rule and native Stage/ScenePresenter views,
project only the selected chapter, withhold pre-reveal answers and all future
card/private fields, prove media/CSP and lifecycle in browsers, and register
an explicitly versioned tool/resource without loosening the old contracts.

Initial local result:15/15 Windows unit checks PASS, with real catalog WebP
bytes from both bundled families; focused types/lint/format PASS. These unit
tests deliberately control issuer/rights callbacks; they are not a production
authorization or renderer proof. They cover no pre-authorization filesystem
access, unknown assets/family/hash, metadata lookalikes, foreign account/grant,
hardlinks/symbolic roots, same-size tampering, immutable byte snapshots, live
revocation after IO and midstream, expiry/close, backpressure, per-account quota,
owner-only release and retained canceled authorization work. Actual issuer and
HTTP delivery binding remain to be implemented and tested together.

Limits are explicit:64 total leases/256 MiB,16 leases/128 MiB per account,
four streams,16 pending authorization checks,60-second leases. Repeated exact
admission reuses the same private capability after fresh checks. Expiry/close
errors active streams and removes the canonical buffer from retained leases;
pending authorization work keeps its slot until its actual promise settles.
No execution/export grant, resource URL, raw path or principal enters the DTO.

The Linux runner adds a focused asset suite. Its admission requires actual
archive bytes plus128 MiB reserve; the prior512 MiB threshold stays for the
larger recovery/browser packets. This scoped suite performs no Site build or
image installation. Linux qualification still requires the next exact commit.
