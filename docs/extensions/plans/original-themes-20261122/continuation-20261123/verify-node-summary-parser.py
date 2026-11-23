import ast
import datetime
import difflib
import hashlib
import json
import pathlib
import platform
import re
import sys

root = pathlib.Path(sys.argv[1])
expected_receipt = "31933d02350eac417777ad760e82d331f0b3d3f425d17001b91af8cd11f2d96a"
paths = {
    "originalController": root / "faa-successor-preparation-oracle-v1.py",
    "patchedController": root / "faa-successor-preparation-oracle.py",
    "originalReceipt": root / "original-failed-preflight-receipt.json",
    "stdout": root / "builtin-and-signed-catalog-policy.stdout.log",
    "stderr": root / "builtin-and-signed-catalog-policy.stderr.log",
}
data = {key: path.read_bytes() for key, path in paths.items()}
hashes = {key: hashlib.sha256(value).hexdigest() for key, value in data.items()}
assert hashes["originalReceipt"] == expected_receipt
original_receipt = json.loads(data["originalReceipt"])
policy = next(check for check in original_receipt["checks"] if check["label"] == "builtin-and-signed-catalog-policy")
assert policy["exit"] == 0 and not policy["timedOut"]
assert hashes["stdout"] == policy["stdoutSha256"]
assert hashes["stderr"] == policy["stderrSha256"]
assert len(data["stdout"]) == policy["stdoutBytes"]
assert len(data["stderr"]) == policy["stderrBytes"]
assert hashes["originalController"] == original_receipt["controllerSha256"]
old_text = data["originalController"].decode("utf-8")
patched_text = data["patchedController"].decode("utf-8")
assert patched_text == old_text.replace('r"^# "', 'r"^(?:#|' + chr(0x2139) + ') "', 1)
assert old_text.count('r"^# "') == 1

def load_parser(text):
    module = ast.parse(text)
    functions = [node for node in module.body if isinstance(node, ast.FunctionDef) and node.name == "measured_counts"]
    assert len(functions) == 1
    isolated = ast.Module(body=functions, type_ignores=[])
    namespace = {"re": re}
    exec(compile(isolated, "<isolated-measured-counts>", "exec"), namespace)
    return namespace["measured_counts"]

original_failure = None
try:
    load_parser(old_text)(policy["label"], data["stdout"], data["stderr"], {})
except AssertionError as error:
    original_failure = str(error)
assert original_failure == "Missing unambiguous policy count: tests"
parsed = {}
load_parser(patched_text)(policy["label"], data["stdout"], data["stderr"], parsed)
expected = {"tests": 16, "pass": 16, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0}
assert parsed == {"measuredPolicy": expected}
assert original_receipt["passed"] is False
assert original_receipt["prepared"] is False
assert original_receipt["releaseQualified"] is False
assert all(hashlib.sha256(path.read_bytes()).hexdigest() == hashes[key] for key, path in paths.items())
print(json.dumps({
    "checkId": "THEME-PARSER-RECEIPT",
    "owner": "/root/theme_inventory",
    "classification": "VERIFY_REGRESSION",
    "status": "PASSED",
    "executedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "sourceMergeSha": "b00cbe0058a1b83b613d9c64fc99eb1b09c548ff",
    "python": platform.python_version(),
    "host": platform.node(),
    "inputs": {key: {"path": str(path), "sha256": hashes[key], "bytes": len(data[key])} for key, path in paths.items()},
    "originalParserReplay": {"status": "FAILED_REPRODUCED", "message": original_failure},
    "preparedParserReplay": {"status": "PASSED", **parsed},
    "originalPreflightOutcomeUnchanged": {"passed": False, "prepared": False, "releaseQualified": False},
    "existingPolicyProcessExit": policy["exit"],
    "executedScope": "Only the AST-extracted measured_counts function from each existing controller. No controller orchestration, product suites, builds, server launch, or deployment.",
    "productSuitesExecuted": 0,
    "releaseAcceptance": "INCOMPLETE",
    "allInputBytesUnchanged": True
}, indent=2))
