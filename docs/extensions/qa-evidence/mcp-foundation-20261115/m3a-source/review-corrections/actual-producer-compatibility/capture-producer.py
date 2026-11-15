"""Copy complete immutable Git blobs only; no app import or SQLite execution."""
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[6]
MODULE = "extensions/src/mcp-app/"
DEST = MODULE + "tests/first-party/ad895-producer/"
PRODUCER = "ad8955327a56213b3a437379fcc7ccc6e05a261a"
paths = ["first-party/schema.ts", "server/errors.ts", "contracts/schemas.ts"]
rows = []
for path in paths:
    original = MODULE + path
    raw = subprocess.check_output(["git", "show", PRODUCER + ":" + original], cwd=ROOT)
    blob = subprocess.check_output(["git", "rev-parse", PRODUCER + ":" + original], cwd=ROOT).decode().strip()
    assert hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == blob
    target = ROOT / (DEST + path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        assert target.read_bytes() == raw, "Never replace an existing unequal frozen snapshot"
    else:
        target.write_bytes(raw)
    rows.append({"producerPath": original, "fixturePath": path, "gitBlobSha1": blob,
        "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
report = {"kind": "EXACT_COMPLETE_PRODUCER_MODULES_NOT_EXECUTED",
    "producerCommit": PRODUCER, "applicationGuardCommit": "c3226b6683c4d12b45fd553e090928092e1881b9",
    "modules": rows,
    "runtimeImportEdges": [
        ["first-party/schema.ts", "../server/errors.ts", "server/errors.ts"],
        ["server/errors.ts", "../contracts/schemas.ts", "contracts/schemas.ts"],
        ["contracts/schemas.ts", "zod", "zod@4.6.6"]],
    "typeOnlyEdges": [["first-party/schema.ts", "node:sqlite", "DatabaseSync"],
        ["server/errors.ts", "../contracts/schemas.ts", "ErrorCode/ToolFailure"]],
    "privateLockSha256": "e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838",
    "runtime": {"node": "24.22.2", "platform": "linux", "arch": "arm64", "pnpm": "12.18.0"},
    "databaseOwner": "fresh synthetic actual manager account, UUID recorded during observation",
    "compatibilityObservation": "NOT_RUN"}
data = (json.dumps(report, indent=2) + "\n").encode()
(ROOT / (DEST + "provenance.json")).write_bytes(data)
print(json.dumps({"copiedCompleteGitBlobs": len(rows), "provenanceSha256": hashlib.sha256(data).hexdigest(),
    "applicationImport": "NOT_RUN", "sqlite": "NOT_RUN"}))
