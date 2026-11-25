"""Freeze the actual-producer witness package; source/Git/syntax only."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[6]
MODULE = "extensions/src/mcp-app/"
PRODUCT = "ad8955327a56213b3a437379fcc7ccc6e05a261a"
GUARDS = "c3226b6683c4d12b45fd553e090928092e1881b9"
PHASE_BASE = "d00d848faf42b950d8dc281931b8bb7240b10c32"
sha = lambda data: hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


prior_path = HERE.parent / "candidate-input-manifest.json"
prior = json.loads(prior_path.read_bytes())
assert sha(prior_path.read_bytes()) == "f38c1f13b01ddfd8e20e10b3015d1b5beb2fa28ed72f08e57e34f0591fdd5341"
new_paths = [MODULE + "tests/first-party/compatibility.observation.ts"]
new_paths += [MODULE + "tests/first-party/ad895-producer/" + name for name in [
    "first-party/schema.ts", "server/errors.ts", "contracts/schemas.ts", "provenance.json"]]
changed = set(git("diff", "--name-only", PHASE_BASE).decode().splitlines())
changed.update(git("ls-files", "--others", "--exclude-standard").decode().splitlines())
evidence_prefix = str(HERE.relative_to(ROOT)).replace("\\", "/") + "/"
unleased = sorted(path for path in changed if path not in new_paths and not path.startswith(evidence_prefix))
assert not unleased
for row in prior["files"]:
    data = (ROOT / row["path"]).read_bytes()
    assert len(data) == row["bytes"] and sha(data) == row["sha256"], row["path"]
for path in git("ls-tree", "-r", "--name-only", GUARDS, "--", MODULE + "first-party/").decode().splitlines():
    assert (ROOT / path).read_bytes() == git("show", GUARDS + ":" + path), path
for name in ["package.json", "pnpm-lock.yaml", "tsconfig.json"]:
    path = MODULE + name
    assert (ROOT / path).read_bytes() == git("show", GUARDS + ":" + path), path
provenance_path = MODULE + "tests/first-party/ad895-producer/provenance.json"
provenance = json.loads((ROOT / provenance_path).read_bytes())
assert provenance["producerCommit"] == PRODUCT and len(provenance["modules"]) == 3
for row in provenance["modules"]:
    original = git("show", PRODUCT + ":" + row["producerPath"])
    captured = (ROOT / (MODULE + "tests/first-party/ad895-producer/" + row["fixturePath"])).read_bytes()
    assert original == captured and sha(original) == row["sha256"] and len(original) == row["bytes"]
    assert git("rev-parse", PRODUCT + ":" + row["producerPath"]).decode().strip() == row["gitBlobSha1"]
freeze = json.loads((ROOT / "docs/extensions/plans/tds-freeze.json").read_bytes())
product_blobs = {}
for entry in git("ls-tree", "-r", "-z", PRODUCT).split(b"\0"):
    if entry:
        header, path = entry.split(b"\t", 1)
        product_blobs[path.decode()] = header.split()[2].decode()
for path in freeze["files"]:
    protected = (ROOT / path).read_bytes()
    blob = hashlib.sha1(b"blob " + str(len(protected)).encode() + b"\0" + protected).hexdigest()
    assert blob == product_blobs[path], path
assert (ROOT / "pnpm-lock.yaml").read_bytes() == git("show", PRODUCT + ":pnpm-lock.yaml")

inputs = sorted({row["path"] for row in prior["files"]} | set(new_paths))
rows = [{"path": path, "bytes": (ROOT / path).stat().st_size,
    "sha256": sha((ROOT / path).read_bytes())} for path in inputs]
delta = sorted(set(prior["deltaPaths"]) | set(new_paths))
manifest = {"kind": "FINAL_ACTUAL_PRODUCER_COMPATIBILITY_SOURCE_ONLY_NOT_RUN",
    "candidateCommit": git("rev-parse", "HEAD").decode().strip(),
    "producerCommit": PRODUCT, "applicationGuardCommit": GUARDS,
    "prior155ManifestSha256": sha(prior_path.read_bytes()),
    "original150ManifestSha256": prior["baselineManifestSha256"],
    "deltaPaths": delta, "files": rows, "oldProducerProvenance": provenance,
    "declaredFirstPartyTests": 34, "extraCompatibilityObservations": 1,
    "functionalTests": "NOT_RUN", "compatibilityObservation": "NOT_RUN",
    "typecheck": "NOT_RUN", "runtimeGrant": "NONE"}
data = (json.dumps(manifest, indent=2) + "\n").encode()
(HERE / "final-input-manifest.json").write_bytes(data)
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode="w") as archive:
    for path in delta:
        raw = (ROOT / path).read_bytes()
        info = tarfile.TarInfo("app/" + path)
        info.size, info.mode, info.mtime = len(raw), 0o444, 0
        archive.addfile(info, io.BytesIO(raw))
    info = tarfile.TarInfo("final-input-manifest.json")
    info.size, info.mode, info.mtime = len(data), 0o444, 0
    archive.addfile(info, io.BytesIO(data))
compressed = gzip.compress(buffer.getvalue(), mtime=0)
(HERE / "final-source-overlay.tar.gz").write_bytes(compressed)
checks = []
for path in new_paths:
    if not path.endswith(".ts"):
        continue
    check = subprocess.run(["node", "--experimental-transform-types", "--check", str(ROOT / path)],
        cwd=ROOT, capture_output=True, text=True)
    checks.append({"path": path, "exit": check.returncode,
        "sha256": sha((ROOT / path).read_bytes()), "stdout": check.stdout, "stderr": check.stderr})
(HERE / "syntax-only.json").write_bytes((json.dumps({"kind": "PARSE_ONLY_NO_IMPORT_OR_SQLITE",
    "nodeVersion": subprocess.check_output(["node", "--version"], text=True).strip(), "checks": checks}, indent=2) + "\n").encode())
assert all(row["exit"] == 0 for row in checks)
raw = subprocess.run(["node", "extensions/qa/tds-boundary.mjs"], cwd=ROOT, capture_output=True)
(HERE / "raw-freeze.stdout").write_bytes(raw.stdout)
(HERE / "raw-freeze.stderr").write_bytes(raw.stderr)
match = re.search(r"Error: (\{[^\n]+\})", raw.stderr.decode(errors="replace"))
details = json.loads(match.group(1)) if match else None
test_count = sum(len(re.findall(r"\btest\(", path.read_text(encoding="utf-8")))
    for path in (ROOT / (MODULE + "tests/first-party")).glob("*.nodecheck.ts"))
assert len(rows) == 160 and len(delta) == 16 and test_count == 34
assert raw.returncode == 1 and details and not details["mismatches"]
result = {"candidateCommit": manifest["candidateCommit"], "applicationGuardCommit": GUARDS,
    "sourceInputs": len(rows), "deltaFiles": len(delta), "newWitnessFiles": len(new_paths),
    "deltaBytes": sum((ROOT / path).stat().st_size for path in delta),
    "manifestSha256": sha(data), "overlayBytes": len(compressed), "overlaySha256": sha(compressed),
    "prior155Unchanged": True, "applicationGuardsUnchanged": True, "privateMetadataUnchanged": True,
    "protectedFilesUnchanged": len(freeze["files"]), "rootLockUnchanged": True,
    "oldProducerModulesByteExact": 3, "provenanceSha256": sha((ROOT / provenance_path).read_bytes()),
    "newTsSyntaxParses": len(checks), "syntaxExits": [row["exit"] for row in checks],
    "unleasedChanges": unleased, "firstPartyTestDeclarations": test_count, "extraCompatibilityObservation": 1,
    "rawFreezeExit": raw.returncode, "rawFreezeDenied": len(details["denied"]), "rawFreezeMismatches": details["mismatches"],
    "functionalTests": "NOT_RUN", "typecheck": "NOT_RUN", "format": "NOT_RUN", "runtimeGrant": "NONE"}
(HERE / "preparation-summary.json").write_bytes((json.dumps(result, indent=2) + "\n").encode())
print(json.dumps(result))
