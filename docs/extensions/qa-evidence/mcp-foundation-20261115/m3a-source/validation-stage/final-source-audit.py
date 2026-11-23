"""Static source/Git inspection only; no application import or local TC/tests."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
ACCEPTED = "60d289821df631d55c91d48f4f753197d85d0041"
SOURCE = "ad8955327a56213b3a437379fcc7ccc6e05a261a"
MODULE = "extensions/src/mcp-app/"
sha = lambda data: hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


tree = {}
for entry in git("ls-tree", "-r", "-z", ACCEPTED).split(b"\0"):
    if entry:
        meta, path = entry.split(b"\t", 1)
        tree[path.decode()] = meta.split()[2].decode()


def same(path):
    data = (ROOT / path).read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == tree[path]


allowed_metadata = {MODULE + name for name in ["package.json", "tsconfig.json", "pnpm-lock.yaml"]}
frozen = [path for path in tree if path.startswith(MODULE) and path not in allowed_metadata]
frozen_changes = [path for path in frozen if not same(path)]
freeze = json.loads((ROOT / "docs/extensions/plans/tds-freeze.json").read_bytes())
approved = json.loads((ROOT / "docs/extensions/plans/tds-approved-seams.json").read_bytes())["files"]
hash_changes = [path for path, expected in freeze["files"].items() if sha((ROOT / path).read_bytes()) != expected]
protected_since_accepted = [path for path in freeze["files"] if not same(path)]
changed = set(git("diff", "--name-only", "2ba3f1cd9ad3394c5378bf3fc8de73f6d148f1a5").decode().splitlines())
changed.update(git("ls-files", "--others", "--exclude-standard").decode().splitlines())
prefixes = [MODULE + "first-party/", MODULE + "tests/first-party/", "docs/extensions/qa-evidence/mcp-foundation-20261115/m3a-source/validation-stage/"]
unleased = sorted(path for path in changed if path not in allowed_metadata and not any(path.startswith(prefix) for prefix in prefixes))
manifest_bytes = (HERE / "corrected-input-manifest.json").read_bytes()
assert sha(manifest_bytes) == "d758084a11829061530a123dfdc6e371396b348196392dd8b8893b8e33303d4c"
manifest = json.loads(manifest_bytes)
source_mismatches = [row["path"] for row in manifest["files"] if len((ROOT / row["path"]).read_bytes()) != row["bytes"] or sha((ROOT / row["path"]).read_bytes()) != row["sha256"]]
raw = subprocess.run(["node", "extensions/qa/tds-boundary.mjs"], cwd=ROOT, capture_output=True)
(HERE / "final-raw-freeze.stdout").write_bytes(raw.stdout)
(HERE / "final-raw-freeze.stderr").write_bytes(raw.stderr)
match = re.search(r"Error: (\{[^\n]+\})", raw.stderr.decode(errors="replace"))
details = json.loads(match.group(1)) if match else None
receipt = {"kind": "STATIC_SOURCE_AND_LEASE_AUDIT_NOT_FUNCTIONAL_WINDOWS_TEST", "sourceCommit": SOURCE,
    "sourceInputs": len(manifest["files"]), "sourceManifestSha256": sha(manifest_bytes), "sourceMismatches": source_mismatches,
    "protectedFiles": len(freeze["files"]), "protectedChangesSinceAccepted": protected_since_accepted,
    "originalFreezeHashesUnchanged": len(freeze["files"]) - len(hash_changes), "preexistingApprovedHashChanges": hash_changes,
    "unexpectedOriginalFreezeChanges": [p for p in hash_changes if p not in approved],
    "frozenLegacyModuleFiles": len(frozen), "frozenLegacyModuleChanges": frozen_changes,
    "authorizedPrivateMetadata": sorted(allowed_metadata), "privateLockSha256": sha((ROOT / (MODULE + "pnpm-lock.yaml")).read_bytes()),
    "rootLockUnchanged": same("pnpm-lock.yaml"), "unleasedChanges": unleased,
    "parentNewVitestGlobIntersection": [p.relative_to(ROOT).as_posix() for p in (ROOT / (MODULE + "tests/first-party")).glob("*.test.ts")],
    "rawFreezeExit": raw.returncode, "rawFreezeDetails": details, "guardEdited": not same("extensions/qa/tds-boundary.mjs")}
(HERE / "final-source-audit.json").write_bytes((json.dumps(receipt, indent=2) + "\n").encode())
assert not (source_mismatches or protected_since_accepted or frozen_changes or unleased or receipt["unexpectedOriginalFreezeChanges"])
assert receipt["rootLockUnchanged"] and not receipt["guardEdited"] and not receipt["parentNewVitestGlobIntersection"]
assert raw.returncode == 1 and details and not details["mismatches"]
print(json.dumps({"kind": receipt["kind"], "sourceInputs": len(manifest["files"]), "protectedFiles": len(freeze["files"]),
    "newProtectedChanges": len(protected_since_accepted), "frozenLegacyFiles": len(frozen), "unleased": len(unleased),
    "rawFreezeExit": raw.returncode, "rawDeniedPaths": len(details["denied"])}))
