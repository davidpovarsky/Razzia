"""Compare exact legacy diagnostics under one pinned lint policy and dependency set.

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
import re
import subprocess
import sys

BASELINE_SHA = "9c8b1081f07c608e03946deec14351d27d6cca57"
POLICY_CONFIG = "tadazz-lint-policy.config.ts"
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


def policy_hashes(baseline, current):
    result = {}
    for name, directory in (("baseline", baseline), ("candidate", current)):
        path = directory / POLICY_CONFIG
        if path.is_symlink() or not path.is_file():
            raise ValueError("Effective lint policy must be a regular file beside each original config")
        result[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def verify_policy_unchanged(baseline, current, expected):
    observed = policy_hashes(baseline, current)
    if observed != expected:
        raise ValueError("Effective lint policy changed during lint")
    return observed


def select_policy(baseline, current, before_hashes, current_hashes, expected):
    if expected is None:
        if before_hashes["oxlint.config.ts"] != current_hashes["oxlint.config.ts"]:
            raise ValueError("Lint configuration changed; baseline comparison refused")
        return "oxlint.config.ts", None
    if not isinstance(expected, str) or re.fullmatch(r"[a-f0-9]{64}", expected) is None:
        raise ValueError("Invalid effective lint policy pin")
    if expected != current_hashes["oxlint.config.ts"]:
        raise ValueError("Effective lint policy must equal the pinned candidate configuration")
    observed = policy_hashes(baseline, current)
    if observed != {"baseline": expected, "candidate": expected}:
        raise ValueError("Effective lint policy differs between source trees or from its pin")
    return POLICY_CONFIG, observed


def run(args):
    if args.baseline_sha != BASELINE_SHA:
        raise ValueError("Unexpected lint baseline revision")
    baseline = args.baseline_root.resolve(strict=True)
    current = args.current_root.resolve(strict=True)
    if baseline == current:
        raise ValueError("Baseline and candidate must be separate trees")
    before_hashes, current_hashes = hashes(baseline), hashes(current)
    config_file, policy_before = select_policy(
        baseline, current, before_hashes, current_hashes, args.policy_sha256
    )
    previous = {path: (baseline / path).read_bytes() for path in FILES}
    selected = {path: (current / path).read_bytes() for path in FILES}
    args.output.mkdir(mode=0o700, exist_ok=False)
    command = ["node", "--experimental-strip-types", "/cleanup/node_modules/oxlint/bin/oxlint", "-c", config_file, "--format=json", *FILES]
    results = []
    for name, directory in (("baseline", baseline), ("candidate", current)):
        if policy_before is not None:
            verify_policy_unchanged(baseline, current, policy_before)
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
    policy_after = verify_policy_unchanged(baseline, current, policy_before) if policy_before is not None else None
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
    if policy_before is not None:
        receipt["effectivePolicy"] = {
            "configFile": POLICY_CONFIG, "sourcePath": "oxlint.config.ts",
            "sha256": args.policy_sha256, "hashesBefore": policy_before, "hashesAfter": policy_after,
        }
        receipt["workingDirectories"] = {"baseline": str(baseline), "candidate": str(current)}
    (args.output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf8")
    print(json.dumps({key: value for key, value in receipt.items() if key != "unmatchedDiagnostics"}, indent=2))
    return 1 if unmatched else 0


def self_test_policy():
    import tempfile
    witnessed = []
    with tempfile.TemporaryDirectory(prefix="tadazz-lint-policy-self-test-") as temporary:
        baseline, current = (pathlib.Path(temporary) / name for name in ("baseline", "candidate"))
        baseline.mkdir()
        current.mkdir()
        original, policy = b"historical config bytes\n", b"candidate config bytes\n"
        old_pin, pin = (hashlib.sha256(value).hexdigest() for value in (original, policy))
        before, after = {"oxlint.config.ts": old_pin}, {"oxlint.config.ts": pin}
        (baseline / "oxlint.config.ts").write_bytes(original)
        (current / "oxlint.config.ts").write_bytes(policy)
        for root in (baseline, current):
            (root / POLICY_CONFIG).write_bytes(policy)
        expected = {"baseline": pin, "candidate": pin}
        assert select_policy(baseline, current, before, after, pin) == (POLICY_CONFIG, expected)
        assert (baseline / "oxlint.config.ts").read_bytes() == original
        witnessed.append("different original config preserved under one pinned candidate policy")
        for case in ("changed-config-without-policy", "invalid-pin", "not-candidate-policy",
                     "different-alias-bytes", "missing-alias", "symlink-alias"):
            alias = baseline / POLICY_CONFIG
            if alias.exists() or alias.is_symlink():
                alias.unlink()
            alias.write_bytes(policy)
            supplied = pin
            if case == "changed-config-without-policy":
                supplied = None
            elif case == "invalid-pin":
                supplied = "not-a-sha256"
            elif case == "not-candidate-policy":
                supplied = old_pin
            elif case == "different-alias-bytes":
                alias.write_bytes(original)
            elif case == "missing-alias":
                alias.unlink()
            elif case == "symlink-alias":
                alias.unlink()
                alias.symlink_to(current / POLICY_CONFIG)
            try:
                select_policy(baseline, current, before, after, supplied)
            except ValueError:
                witnessed.append(case)
            else:
                raise AssertionError("Invalid lint policy accepted: " + case)
        alias = baseline / POLICY_CONFIG
        if alias.exists() or alias.is_symlink():
            alias.unlink()
        alias.write_bytes(policy)
        observed = policy_hashes(baseline, current)
        alias.write_bytes(original)
        try:
            verify_policy_unchanged(baseline, current, observed)
        except ValueError:
            witnessed.append("policy mutation rejected")
        else:
            raise AssertionError("Mutated lint policy accepted")
    return witnessed


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
    print(json.dumps({"selfTest": "PASS", "checks": ["shifted UTF8 unchanged line", "added line rejected", "duplicate diagnostic rejected", "changed multi-line span rejected", "all labels required", "malformed span rejected"] + self_test_policy()}))
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--baseline-root", type=pathlib.Path)
    parser.add_argument("--current-root", type=pathlib.Path)
    parser.add_argument("--baseline-sha")
    parser.add_argument("--policy-sha256", help="Use the candidate policy pinned beside both original configs")
    parser.add_argument("--output", type=pathlib.Path)
    arguments = parser.parse_args()
    if arguments.self_test:
        sys.exit(self_test())
    if any(getattr(arguments, key) is None for key in ("baseline_root", "current_root", "baseline_sha", "output")):
        parser.error("All baseline/current/output arguments are required")
    sys.exit(run(arguments))
