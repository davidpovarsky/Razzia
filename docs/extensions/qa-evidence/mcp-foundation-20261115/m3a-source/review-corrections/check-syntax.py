"""Parse changed TypeScript only; no application import or dependency bootstrap."""
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
MODULE = ROOT / "extensions/src/mcp-app"
FILES = [
    "first-party/schema-manifest.ts", "first-party/schema.ts",
    "first-party/ingress.ts", "first-party/bindings.ts", "first-party/http.ts",
    "tests/first-party/schema-ad895.fixture.ts",
    "tests/first-party/schema.nodecheck.ts", "tests/first-party/abort.nodecheck.ts",
    "tests/first-party/review-evidence.fixture.ts",
    "tests/first-party/store.nodecheck.ts",
]
checks = []
for name in FILES:
    result = subprocess.run(
        ["node", "--experimental-transform-types", "--check", str(MODULE / name)],
        cwd=ROOT, capture_output=True, text=True,
    )
    checks.append({"file": name, "exit": result.returncode,
        "sha256": hashlib.sha256((MODULE / name).read_bytes()).hexdigest(),
        "stdout": result.stdout, "stderr": result.stderr})
report = {"kind": "SOURCE_PARSE_ONLY_NO_APPLICATION_IMPORT",
    "nodeVersion": subprocess.check_output(["node", "--version"], text=True).strip(),
    "checks": checks, "functionalTests": "NOT_RUN", "typecheck": "NOT_RUN",
    "install": "NOT_RUN"}
(HERE / "syntax-only.json").write_bytes((json.dumps(report, indent=2) + "\n").encode())
assert all(row["exit"] == 0 for row in checks)
print(json.dumps({"parsed": len(checks), "exits": [row["exit"] for row in checks],
    "functionalTests": "NOT_RUN", "typecheck": "NOT_RUN"}))
