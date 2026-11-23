"""Reuse the one actual SDK41 result only with exact unchanged runtime graph."""
import hashlib
import json
from pathlib import Path
import re

E, P = Path("/evidence"), Path("/prior-sdk")
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
prior = json.loads((P / "06-sdk.json").read_text())
assert prior["actualReturnCode"] == 0 and prior["shellExit"] == 0 and not prior["logTruncated"]
assert sha(P / "06-sdk.log") == prior["logSha256"] == "ecf07bc1a5bd7b195268635b0002fa4d104130a22ee95400ba977bd34e196e9a"
text = (P / "06-sdk.log").read_text()
for expected in [r"\btests 41\b", r"\bpass 41\b", r"\bfail 0\b", r"\bskipped 0\b"]:
    assert re.search(expected, text)
assert sha(E / "generated-private-pnpm-lock.yaml") == sha(P / "generated-private-pnpm-lock.yaml") == "e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838"
for name in ["node.version", "pnpm.version"]:
    assert (E / name).read_bytes() == (P / name).read_bytes()
assert json.loads((E / "launch.json").read_text())["image"] == json.loads((P / "launch.json").read_text())["image"]
before = {row["path"]: row for row in json.loads((P / "full-input-manifest.json").read_text())["files"]}
after = {row["path"]: row for row in json.loads((E / "full-input-manifest.json").read_text())["files"]}
changes = sorted(path for path in before if before[path] != after[path])
assert changes == ["extensions/src/mcp-app/first-party/ingress.ts", "extensions/src/mcp-app/pnpm-lock.yaml", "extensions/src/mcp-app/tests/first-party/store.nodecheck.ts"]
for row in before.values():
    if row["path"] not in changes:
        assert sha(Path("/ram/work") / row["path"]) == row["sha256"]
for name in ["validated_runtime_index_sha256", "metadata_inventory_sha256"]:
    assert json.loads((E / "cache-pin.json").read_text())[name] == json.loads((P / "cache-pin.json").read_text())[name]
receipt = {"kind": "REUSED_ACTUAL_SDK41_RESULT_NO_RERUN", "actualSourceAttempt": "attempt-03",
    "actualSdkLogSha256": prior["logSha256"], "actualTests": 41, "actualPass": 41, "actualFail": 0,
    "sameGeneratedPrivateLock": True, "sameRuntimeImageNodePnpmCachePins": True,
    "sameSdkServerContractsTestsCoreCommonSource": True, "onlyChangedInputPaths": changes,
    "reason": "Changed first-party header typing and synthetic crash fixture do not enter the legacy SDK runtime graph; dependency boundary already ran41 once."}
(E / "sdk41-reuse.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt))
