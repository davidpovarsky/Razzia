# Preferences during automatic preview requests

The isolated repair keeps the language and reduced-motion controls usable while an automatic chapter preview is pending. A user preference request carries forward that pending chapter, becomes an explicit request, and uses the existing generation and consumer-ticket checks to reject the older automatic response. Authoring, manual navigation, refresh, mutation, capability and teardown guards remain in place. No clock, phase deadline, schema, server or renderer implementation was changed.

## Observed baseline

The unmodified 730cb457 source was built and audited in the existing root checkout. Its renderer source binding was 0c47e5ee4b577fb127e31e89662c6bbe6b2be95c999a6e7698cd4e7cf9060a80; the Windows-built HTML was ceb8fbd063e3a6a1cc3ef8a18cb44a144ef3433054a04fe20fd1013734ee9dac.

The regression held the genuine timed question-to-voting response after the real backend and official MCP client produced it. Both preference controls were disabled while that automatic response was pending. The corrected baseline failed at the intended assertion: Automatic loading must not disable the motion preference (true !== false). The source-integrity check passed and there were no backend errors.

An initial probe checked the editable title input as an authoring guard; that was an incorrect QA assumption because editing its local text is permitted. The assertion was corrected to the existing locked load-assets action. Both original and corrected receipts are preserved. Temporary root QA overlays were restored byte-for-byte afterward; root product source was never edited.

## Fixed verification

The dedicated preference-race mode leaves the existing 40 acceptance checks and 44 renderer fixtures unchanged. It uses the actual issuer, official MCP client, AppBridge and sandboxed native widget. The scoped Playwright route fetches each real loopback response and delays delivery without changing response bytes.

Each engine/theme case exercises both the ordinary motion-checkbox click and language selection:

1. Hold the genuine automatic voting response.
2. Confirm preferences remain enabled while the authoring action stays disabled.
3. Change a preference through the visible native control.
4. Hold the newer preference response and confirm both preferences and authoring are disabled during that explicit request.
5. Deliver the new response, confirm its context and the pending next chapter, then deliver the old response.
6. Await old-response delivery and host drain; verify the old acknowledgment cannot overwrite the preference or rewind the chapter.
7. Confirm the draft record is unchanged.

All four cases passed, covering eight preference races:

| Engine | Theme | Motion and language |
|---|---|---|
| Chromium / Edge 157.0.4341.60 | Tadazz Classic | PASS |
| Chromium / Edge 157.0.4341.60 | Razzia Original | PASS |
| WebKit 27.2 | Tadazz Classic | PASS |
| WebKit 27.2 | Razzia Original | PASS |

The matrix finished in 55.4 seconds with source hashes unchanged and no errors or outbound denials. The fixed build audited 2,694 physical modules and found no off-worktree product modules. Its renderer source binding is 3769b213b9cb98919fcc15564ec37769ee451e548bb0b8cba8d4f01c42e2ad17; widget HTML SHA256 is fba454780cce5225421ac0281c9e8478b0652499a781c4ed428bdcd328c89839.

The first fixed harness launch stopped before any browser launched because the isolated worktree lacked the existing socket dependency junction. That setup failure is preserved. Existing workspace dependency directories were linked without installing packages, and the unchanged matrix then passed.

## Evidence

- baseline/guard-regression/qa/receipt.json: intended pre-fix failure.
- baseline/guard-regression/qa/chromium-tadazz-classic-preference-race.json: actual disabled-control snapshot and held request.
- baseline/guard-regression/root-restoration.json: exact root QA restoration.
- fixed/build.json: source and physical-module audit.
- fixed/matrix/qa/receipt.json: four-case passing matrix.
- fixed/matrix/qa/*-preference-race.json: per-control snapshots, actual input events and request/delivery witnesses.
- fixed/matrix/qa/*-preference-race.png: final native UI screenshots.
- format-lint-final.json: scoped format/lint verification.
- summary.json: exact source and evidence hashes.

This is isolated fixture verification. Deployment and the full acceptance gate remain the coordinator's responsibility. The diagnostic does not claim that the earlier qualification's unseen pointer event was conclusively reconstructed.
