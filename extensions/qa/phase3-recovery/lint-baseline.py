"""Compare exact legacy diagnostics under unchanged lint rules and dependencies.

New helpers are checked separately with zero errors. This gate preserves the
complete legacy reports and accepts only diagnostics whose every labeled span
maps to identical source lines in the explicitly pinned parent revision.
"""
import argparse
import bisect
import collections
import difflib
import hashlib
import json
import pathlib
import subprocess
import sys

BASELINE_SHA = "9c8b1081f07c608e03946deec14351d27d6cca57"
FILES = tuple("extensions/src/mcp-app/" + item for item in (
    "server/drafts.ts", "first-party/oauth-grants.ts",
    "first-party/oauth.ts", "first-party/store.ts",
))


def line_mapping(previous, current):
    before = previous.splitlines(keepends=True)
    after = current.splitlines(keepends=True)
    mapping = {}
    for block in difflib.SequenceMatcher(a=before, b=after, autojunk=False).get_matching_blocks():
        for offset in range(block.size):
            mapping[block.b + offset + 1] = block.a + offset + 1
    return mapping


def diagnostic_signature(value, content, mapping=None):
    if not isinstance(value, dict) or not isinstance(value.get("code"), str) or not isinstance(value.get("message"), str):
        raise ValueError("Invalid diagnostic identity")
    labels = value.get("labels")
    if not isinstance(labels, list) or not labels:
        raise ValueError("Diagnostic without source labels cannot be grandfathered")
    starts = [0]
    for index, byte in enumerate(content):
        if byte == 10:
            starts.append(index + 1)
    normalized = []
    for label in labels:
        span = label.get("span") if isinstance(label, dict) else None
        if not isinstance(span, dict):
            raise ValueError("Invalid diagnostic span")
        offset, length, line, column = (span.get(key) for key in ("offset", "length", "line", "column"))
        if any(type(number) is not int for number in (offset, length, line, column)) or offset < 0 or length < 0 or offset + length > len(content) or line < 1 or column < 1:
            raise ValueError("Out-of-range diagnostic span")
        first = bisect.bisect_right(starts, offset)
        last = bisect.bisect_right(starts, offset + max(length - 1, 0))
        if first != line:
            raise ValueError("Diagnostic offset and line disagree")
        if mapping is not None:
            mapped = [mapping.get(number) for number in range(first, last + 1)]
            if any(number is None for number in mapped) or mapped != list(range(mapped[0], mapped[0] + len(mapped))):
                return None
            line = mapped[0]
        metadata = {key: item for key, item in label.items() if key != "span"}
        normalized.append({"line": line, "column": column, "length": length, "metadata": metadata})
    metadata = {key: item for key, item in value.items() if key not in ("filename", "labels")}
    return json.dumps({"metadata": metadata, "labels": normalized}, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


def compare(before, after, previous, current):
    inherited = collections.Counter()
    for item in before:
        path = item.get("filename", "").replace("\\", "/")
        if path not in previous:
            raise ValueError("Baseline diagnostic outside explicit legacy scope")
        inherited[(path, diagnostic_signature(item, previous[path]))] += 1
    mappings = {path: line_mapping(previous[path], current[path]) for path in previous}
    unmatched = []
    matched = 0
    for item in after:
        path = item.get("filename", "").replace("\\", "/")
        if path not in current:
            raise ValueError("Current diagnostic outside explicit legacy scope")
        signature = diagnostic_signature(item, current[path], mappings[path])
        key = (path, signature)
        if signature is None or inherited[key] == 0:
            unmatched.append(item)
        else:
            inherited[key] -= 1
            matched += 1
    return matched, unmatched


def hashes(root):
    return {path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in (*FILES, "oxlint.config.ts")}


def run(args):
    if args.baseline_sha != BASELINE_SHA:
        raise ValueError("Unexpected lint baseline revision")
    baseline = args.baseline_root.resolve(strict=True)
    current = args.current_root.resolve(strict=True)
    if baseline == current:
        raise ValueError("Baseline and candidate must be separate trees")
    before_hashes, current_hashes = hashes(baseline), hashes(current)
    if before_hashes["oxlint.config.ts"] != current_hashes["oxlint.config.ts"]:
        raise ValueError("Lint configuration changed; baseline comparison refused")
    previous = {path: (baseline / path).read_bytes() for path in FILES}
    selected = {path: (current / path).read_bytes() for path in FILES}
    args.output.mkdir(mode=0o700, exist_ok=False)
    command = ["node", "--experimental-strip-types", "/cleanup/node_modules/oxlint/bin/oxlint", "-c", "oxlint.config.ts", "--format=json", *FILES]
    results = []
    for name, directory in (("baseline", baseline), ("candidate", current)):
        result = subprocess.run(command, cwd=directory, capture_output=True, timeout=105)
        (args.output / (name + ".stdout.json")).write_bytes(result.stdout)
        (args.output / (name + ".stderr.log")).write_bytes(result.stderr)
        if result.returncode not in (0, 1):
            raise ValueError("Linter execution failed: " + name)
        payload = json.loads(result.stdout)
        if not isinstance(payload, dict) or not isinstance(payload.get("diagnostics"), list):
            raise ValueError("Linter produced no diagnostic array: " + name)
        if result.returncode == 1 and not payload["diagnostics"]:
            raise ValueError("Linter failed without attributed diagnostics: " + name)
        results.append((result.returncode, payload["diagnostics"]))
    if before_hashes != hashes(baseline) or current_hashes != hashes(current):
        raise ValueError("Source/configuration changed during lint")
    matched, unmatched = compare(results[0][1], results[1][1], previous, selected)
    receipt = {
        "baselineSha": BASELINE_SHA, "method": "same rules/dependencies; every labeled span on exact unchanged source lines",
        "files": list(FILES), "baselineHashes": before_hashes, "candidateHashes": current_hashes,
        "command": command, "baselineLintExit": results[0][0], "candidateLintExit": results[1][0],
        "baselineDiagnosticCount": len(results[0][1]), "candidateDiagnosticCount": len(results[1][1]),
        "matchedInheritedCount": matched, "unmatchedCount": len(unmatched), "unmatchedDiagnostics": unmatched,
        "sourceHashesUnchanged": True, "wholeLegacyLintPass": results[1][0] == 0,
        "gatePass": not unmatched,
    }
    (args.output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf8")
    print(json.dumps({key: value for key, value in receipt.items() if key != "unmatchedDiagnostics"}, indent=2))
    return 1 if unmatched else 0


def self_test():
    def entry(body, line, length=1, labels=None):
        starts = [0] + [index + 1 for index, byte in enumerate(body) if byte == 10]
        return {"filename": "a.ts", "code": "test(rule)", "message": "retained", "severity": "warning", "labels": labels or [{"span": {"offset": starts[line-1], "length": length, "line": line, "column": 1}}]}
    old, new = "α\nlegacy\nlast\n".encode(), "added\nα\nlegacy\nlast\n".encode()
    b, a = entry(old, 2), entry(new, 3)
    assert compare([b], [a], {"a.ts": old}, {"a.ts": new}) == (1, [])
    assert len(compare([b], [entry(new, 1)], {"a.ts": old}, {"a.ts": new})[1]) == 1
    assert len(compare([b], [a, a], {"a.ts": old}, {"a.ts": new})[1]) == 1
    changed = b"legacy\nchanged\nlast\n"
    before = b"legacy\noriginal\nlast\n"
    assert len(compare([entry(before, 1, 16)], [entry(changed, 1, 15)], {"a.ts": before}, {"a.ts": changed})[1]) == 1
    labeled = dict(a, labels=a["labels"] + entry(new, 1)["labels"])
    assert len(compare([b], [labeled], {"a.ts": old}, {"a.ts": new})[1]) == 1
    malformed = dict(a, labels=[{"span": {"offset": 9999, "length": 1, "line": 3, "column": 1}}])
    try:
        compare([b], [malformed], {"a.ts": old}, {"a.ts": new})
        raise AssertionError("Malformed span accepted")
    except ValueError:
        pass
    print(json.dumps({"selfTest": "PASS", "checks": ["shifted UTF8 unchanged line", "added line rejected", "duplicate diagnostic rejected", "changed multi-line span rejected", "all labels required", "malformed span rejected"]}))
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--baseline-root", type=pathlib.Path)
    parser.add_argument("--current-root", type=pathlib.Path)
    parser.add_argument("--baseline-sha")
    parser.add_argument("--output", type=pathlib.Path)
    arguments = parser.parse_args()
    if arguments.self_test:
        sys.exit(self_test())
    if any(getattr(arguments, key) is None for key in ("baseline_root", "current_root", "baseline_sha", "output")):
        parser.error("All baseline/current/output arguments are required")
    sys.exit(run(arguments))
