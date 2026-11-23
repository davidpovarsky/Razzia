# Retained decoration URL host admission correction

The actual V2 fixture reproduced a host admission mismatch: `enabled: true`, native `preset: "shimmer-line"`, and a valid retained `lottieUrl` passed the host's active-Lottie guard, then threw at strict payload parsing. Before correction, the expanded V2 suite produced 14 passes and this one failure. The original failure and exact source hashes are preserved in `before/receipt.json` and display logs; raw streams are retained in base64.

The existing appearance resolver strips the URL when `enabled: false` or the preset is `none`. The disabled cases were not the failure and remain candidate previews. No upstream appearance behavior was changed.

The one-line host correction checks `decoration.lottieUrl !== undefined` alongside existing unavailable conditions. Any retained effective URL now yields the existing structured `{kind: "unavailable", input: null, diagnostics: ["native-media-binding-unavailable"], executableAcceptance: false}` response before payload parsing. The strict payload schema, V1 APIs, V2 ABI, digest path, and saved settings remain unchanged.

Four regressions cover disabled Lottie/native settings, enabled native settings with retained URL, and enabled Lottie. They also verify the saved document remains unchanged, no URL enters a candidate/result, and payload admission still rejects an injected URL.

After correction, actual focused validation passed: V2 15 tests plus public consumer 3 tests = 18 tests across 2 files; focused TypeScript exit 0; scoped Prettier exit 0; scoped oxlint exit 0 (2 files, 233 rules, zero diagnostics). `after/receipt.json` captures commands, exact streams including empty files, and unchanged source hashes during checks. The original 58-test receipt at source `a8c87655447b6efe21f18c6233b5c686361e27f9` is preserved unchanged; no full 62-test run is claimed.

No renderer build, browser/loader run, remote job, rights receipt, pin, execution acceptance, or production action occurred. E/F consume the same previously delivered V2 contract. The cumulative consumer batch ends at the corrected source/evidence pin; original source tasks remain OPEN.
