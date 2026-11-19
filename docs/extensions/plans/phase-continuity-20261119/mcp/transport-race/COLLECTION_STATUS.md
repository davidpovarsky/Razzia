# Transport race evidence: completed-attempt snapshot

This collection preserves the completed baseline and first mixed fixed run. It does not accept the release or claim that the remaining WebKit run passed. Production remains unchanged by curation.

## Preserved evidence

- Baseline: the real deferred automatic acknowledgement left Pause, Replay, Next and Previous disabled. The intended assertion failed with `Automatic loading must not disable pause`. Receipt SHA-256: `c0f20c53e56afc23f8181d7124aecf4f721835c03fc51a5d0c3c1c0bdf6f7ade`.
- Fixed mixed run: all four Chromium transport cases passed. WebKit Pause passed, then the page crashed during fresh Replay setup before its automatic gate was claimed or Replay input was sent. The overall run remains failed. Crash cause is not established. Receipt SHA-256: `d14340d84eed30578ad92b4a76f6ecfb1a0b3d327bc3d43b7542d97f93ea1749`.
- Both attempts retain their build manifests, source-hash audits, full receipts, logs and synthetic witnesses. The tested formatted product hash is `6b270bfba2229d9d3e3413b0838f36a322ab4d7ef572fff1bbf73edd323a4067`; the earlier application receipt records the distinct pre-format hash and is intentionally unmodified.
- `review.patch`, application provenance and scoped validation are copied exactly. The separate prepared two-CPU patch and provenance remain in `../../release-planning/`; they are proposals at the time of this snapshot, not execution evidence.

`collection-completed-baseline-fixed.json` binds all 37 copied files (5,525,415 bytes) to before/copy/after SHA-256 values. The five PNGs have no text or EXIF metadata; no OCR or visual privacy claim is made. No customer configuration, credentials, source archives or dependency trees were copied.

The `fixed-webkit-only` run was active when collection was assigned and is excluded from this snapshot. Its finalized outcome and any integrated commit must be collected separately. `RELEASE_REPORT.md` remains NOT DEPLOYED; this increment does not change acceptance wording.
