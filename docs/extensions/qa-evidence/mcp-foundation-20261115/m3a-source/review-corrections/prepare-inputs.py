"""Source/Git inspection and a tiny exact overlay; no app imports or runtime."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
PRODUCT = "ad8955327a56213b3a437379fcc7ccc6e05a261a"
SCOPE_BASE = "e1994cf7c308352fd704c91a0ea96c220b87000d"
MODULE = "extensions/src/mcp-app/"
sha = lambda data: hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


objects = {}
for part in git("ls-tree", "-r", "-z", PRODUCT).split(b"\0"):
    if part:
        head, path = part.split(b"\t", 1)
        objects[path.decode()] = head.split()[2].decode()


def same(path):
    data = (ROOT / path).read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == objects.get(path)


freeze = json.loads((ROOT / "docs/extensions/plans/tds-freeze.json").read_bytes())
protected = [path for path in freeze["files"] if not same(path)]
legacy = [path for path in objects if path.startswith((MODULE + "server/", MODULE + "contracts/", MODULE + "tests/server/"))]
legacy_changed = [path for path in legacy if not same(path)]
metadata = [MODULE + name for name in ["package.json", "pnpm-lock.yaml", "tsconfig.json"]]
metadata_changed = [path for path in metadata if not same(path)]
changed = set(git("diff", "--name-only", SCOPE_BASE).decode().splitlines())
changed.update(git("ls-files", "--others", "--exclude-standard").decode().splitlines())
allowed = [MODULE + "first-party/", MODULE + "tests/first-party/",
           "docs/extensions/qa-evidence/mcp-foundation-20261115/m3a-source/review-corrections/"]
unleased = sorted(path for path in changed if not any(path.startswith(prefix) for prefix in allowed))
base_path = HERE.parent / "validation-stage/corrected-input-manifest.json"
base_manifest = json.loads(base_path.read_bytes())
base_rows = {row["path"]: row for row in base_manifest["files"]}
source_delta = sorted(path for path in changed if path.startswith(MODULE))
new_inputs = sorted(set(base_rows) | set(source_delta))
rows = []
for path in new_inputs:
    data = (ROOT / path).read_bytes()
    rows.append({"path": path, "bytes": len(data), "sha256": sha(data)})
manifest = {"kind": "REVIEW_CORRECTION_SOURCE_ONLY_NOT_RUN", "productBase": PRODUCT,
    "scopeBase": SCOPE_BASE, "candidateCommit": git("rev-parse", "HEAD").decode().strip(),
    "baseline155Comment": "150 immutable producer inputs plus five new correction inputs",
    "baselineManifestSha256": sha(base_path.read_bytes()),
    "deltaPaths": source_delta, "files": rows,
    "functionalTests": "NOT_RUN", "typecheck": "NOT_RUN", "runtimeGrant": "NONE"}
manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
(HERE / "candidate-input-manifest.json").write_bytes(manifest_bytes)
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode="w") as archive:
    for path in source_delta:
        data = (ROOT / path).read_bytes()
        info = tarfile.TarInfo("app/" + path)
        info.size, info.mode, info.mtime = len(data), 0o444, 0
        archive.addfile(info, io.BytesIO(data))
    info = tarfile.TarInfo("candidate-input-manifest.json")
    info.size, info.mode, info.mtime = len(manifest_bytes), 0o444, 0
    archive.addfile(info, io.BytesIO(manifest_bytes))
compressed = gzip.compress(buffer.getvalue(), mtime=0)
(HERE / "candidate-source-overlay.tar.gz").write_bytes(compressed)
text = (ROOT / (MODULE + "first-party/schema-manifest.ts")).read_text(encoding="utf-8")
tables = json.loads(text.split("export const TABLE_SQL = ", 1)[1].split(" as const", 1)[0])
indexes = json.loads(text.split("export const PRIMARY_INDEX = ", 1)[1].split(" as const", 1)[0])
producer_schema = git("show", PRODUCT + ":" + MODULE + "first-party/schema.ts")
producer_ddl = re.findall(r"CREATE TABLE [^;]+", producer_schema.decode())
golden_text = (ROOT / (MODULE + "tests/first-party/schema-ad895.fixture.ts")).read_text(encoding="utf-8")
golden_ddl = json.loads(golden_text.split("export const legacyTableSql = ", 1)[1].split(" as const", 1)[0])
assert len(producer_ddl) == 4 and producer_ddl == list(tables.values()) == golden_ddl
assert sha(producer_schema) in golden_text
schema_rows = [["table", name, name, sql] for name, sql in tables.items()]
schema_rows += [["index", index, name, None] for name, index in indexes.items() if index]
schema_rows.sort(key=lambda row: row[1])
fingerprint = sha(json.dumps(schema_rows, separators=(",", ":")).encode())
literal = re.search(r'SCHEMA_OBJECT_SHA256 = "([a-f0-9]+)"', text).group(1)
assert fingerprint == literal
raw = subprocess.run(["node", "extensions/qa/tds-boundary.mjs"], cwd=ROOT, capture_output=True)
(HERE / "raw-freeze.stdout").write_bytes(raw.stdout)
(HERE / "raw-freeze.stderr").write_bytes(raw.stderr)
match = re.search(r"Error: (\{[^\n]+\})", raw.stderr.decode(errors="replace"))
details = json.loads(match.group(1)) if match else None
result = {"kind": "SOURCE_ONLY_CORRECTION_INPUTS", "candidateCommit": manifest["candidateCommit"],
    "productBasePreserved": PRODUCT, "scopeBase": SCOPE_BASE, "sourceInputs": len(rows),
    "deltaFiles": len(source_delta), "deltaBytes": sum((ROOT / path).stat().st_size for path in source_delta),
    "manifestSha256": sha(manifest_bytes), "archiveBytes": len(compressed), "archiveSha256": sha(compressed),
    "schemaObjectFingerprint": fingerprint, "protectedFiles": len(freeze["files"]), "protectedChanges": protected,
    "producerDdlSourceSha256": sha(producer_schema), "goldenDdlMatchesProducerAndManifest": True,
    "legacySdkChanges": legacy_changed, "privateMetadataChanges": metadata_changed,
    "privateLockSha256": sha((ROOT / (MODULE + "pnpm-lock.yaml")).read_bytes()),
    "rootLockUnchanged": same("pnpm-lock.yaml"), "unleasedChanges": unleased,
    "parentVitestIntersection": [str(path) for path in (ROOT / (MODULE + "tests/first-party")).glob("*.test.ts")],
    "testDeclarations": sum(len(re.findall(r"\btest\(", path.read_text(encoding="utf-8"))) for path in (ROOT / (MODULE + "tests/first-party")).glob("*.nodecheck.ts")),
    "rawFreezeExit": raw.returncode, "rawFreezeDetails": details,
    "functionalTests": "NOT_RUN", "typecheck": "NOT_RUN", "format": "NOT_RUN_INSTALLED_TOOL_ABSENT",
    "runtimeGrant": "NONE", "proposedNewDiskCapBytes": 8 * 1024**2}
(HERE / "preparation-summary.json").write_bytes((json.dumps(result, indent=2) + "\n").encode())
assert not (protected or legacy_changed or metadata_changed or unleased or result["parentVitestIntersection"])
assert result["rootLockUnchanged"] and len(rows) == 155 and len(source_delta) == 11 and result["testDeclarations"] == 34
assert raw.returncode == 1 and details and not details["mismatches"]
print(json.dumps({key: value for key, value in result.items() if key != "rawFreezeDetails"}))
