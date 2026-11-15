"""Read-only source/Git inspection. Does not import or execute application code."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
BASE = "5684ec668ad06f865d07119ca6d176bca0789d5b"
ACCEPTED = "60d289821df631d55c91d48f4f753197d85d0041"
MODULE = "extensions/src/mcp-app/"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


objects = {}
for entry in git("ls-tree", "-r", "-z", ACCEPTED).split(b"\0"):
    if entry:
        header, path = entry.split(b"\t", 1)
        objects[path.decode("utf-8")] = header.split()[2].decode("ascii")


def same_as_accepted(path):
    data = (ROOT / path).read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest() == objects.get(path)


baseline = json.loads((OUT.parent / "send-eb00/final-input-manifest.json").read_text(encoding="utf-8"))
baseline_files = {row["path"]: row for row in baseline["files"]}
metadata = {MODULE + name for name in ["package.json", "tsconfig.json"]}
approved_prefixes = [MODULE + "first-party/", MODULE + "tests/first-party/",
                     "docs/extensions/qa-evidence/mcp-foundation-20261115/m3a-source/"]
changed = set(git("diff", "--name-only", BASE).decode().splitlines())
changed.update(git("ls-files", "--others", "--exclude-standard").decode().splitlines())
unleased = sorted(p for p in changed if p not in metadata and not any(p.startswith(prefix) for prefix in approved_prefixes))
frozen = [p for p in objects if p.startswith(MODULE) and p not in metadata]
frozen_changes = [p for p in frozen if not same_as_accepted(p)]
guard_manifest = json.loads((ROOT / "docs/extensions/plans/tds-freeze.json").read_text(encoding="utf-8"))
approved = json.loads((ROOT / "docs/extensions/plans/tds-approved-seams.json").read_text(encoding="utf-8"))["files"]
protected_changed = [p for p, expected in guard_manifest["files"].items() if sha((ROOT / p).read_bytes()) != expected]
unexpected_protected = [p for p in protected_changed if p not in approved]
protected_new = [p for p in guard_manifest["files"] if not same_as_accepted(p)]

# Build only the additional source closure; the accepted exact graph is reused.
new_source = sorted(p.relative_to(ROOT).as_posix() for folder in ["first-party", "tests/first-party"]
                    for p in (ROOT / (MODULE + folder)).rglob("*") if p.is_file())
package = json.loads((ROOT / (MODULE + "package.json")).read_text(encoding="utf-8"))
config = json.loads((ROOT / (MODULE + "tsconfig.json")).read_text(encoding="utf-8"))
aliases = config["compilerOptions"]["paths"]
pending = list(new_source)
closure = set(baseline_files)
unresolved = []
external = set()
pattern = re.compile(r'''(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([@A-Za-z0-9_./:-]+)["']''')
while pending:
    relative = pending.pop()
    if relative in closure:
        continue
    closure.add(relative)
    file = ROOT / relative
    if file.suffix not in [".ts", ".mjs", ".tsx"]:
        continue
    for spec in pattern.findall(file.read_text(encoding="utf-8")):
        candidate = None
        if spec.startswith("."):
            candidate = file.parent / spec
        elif spec in aliases:
            candidate = ROOT / aliases[spec][0]
        elif spec.startswith("@razzia/common/"):
            candidate = ROOT / "packages/common/src" / spec.removeprefix("@razzia/common/")
        elif spec.startswith("@razzia/"):
            unresolved.append([relative, spec])
        else:
            external.add(spec)
        if candidate is not None:
            options = [candidate, candidate.with_suffix(".ts"), candidate.with_suffix(".tsx"), candidate / "index.ts"]
            target = next((p for p in options if p.is_file()), None)
            if target is None:
                unresolved.append([relative, spec])
            else:
                pending.append(target.resolve().relative_to(ROOT).as_posix())
closure.update(metadata)
overlay_paths = sorted(p for p in closure if p not in baseline_files or not same_as_accepted(p))
overlay = [{"path": p, "bytes": (ROOT / p).stat().st_size, "sha256": sha((ROOT / p).read_bytes())} for p in overlay_paths]
save("source-overlay-manifest.json", {"status": "SOURCE_ONLY_NOT_RUN", "acceptedBase": ACCEPTED,
    "acceptedManifestSha256": sha((OUT.parent / "send-eb00/final-input-manifest.json").read_bytes()),
    "baselineInputs": len(baseline_files), "fullGraphInputs": len(closure),
    "overlayFiles": len(overlay), "overlayBytes": sum(row["bytes"] for row in overlay), "files": overlay,
    "externalImportsFromAdditionalGraph": sorted(external), "unresolvedInternalImports": unresolved})

raw = subprocess.run(["node", "extensions/qa/tds-boundary.mjs"], cwd=ROOT, capture_output=True)
(OUT / "raw-freeze.stdout").write_bytes(raw.stdout)
(OUT / "raw-freeze.stderr").write_bytes(raw.stderr)
match = re.search(r"Error: (\{[^\n]+\})", raw.stderr.decode(errors="replace"))
raw_details = json.loads(match.group(1)) if match else None
old_package = json.loads(git("show", ACCEPTED + ":" + MODULE + "package.json"))
test_files = sorted(p for p in new_source if p.endswith(".nodecheck.ts"))
receipt = {"kind": "STATIC_SOURCE_INSPECTION_ONLY", "base": BASE, "accepted": ACCEPTED,
    "approvedProposalPreserved": sha((OUT / "FROZEN_PROPOSAL_5684.md").read_bytes()) == json.loads((OUT / "OWNERSHIP.json").read_text(encoding="utf-8"))["proposalSha256"],
    "frozenModuleFiles": len(frozen), "frozenModuleChanges": frozen_changes,
    "rootLockUnchanged": (ROOT / "pnpm-lock.yaml").read_bytes() == git("show", BASE + ":pnpm-lock.yaml"),
    "isolatedLockUnchangedPendingResolution": (ROOT / (MODULE + "pnpm-lock.yaml")).read_bytes() == git("show", ACCEPTED + ":" + MODULE + "pnpm-lock.yaml"),
    "acceptedOriginalTestScriptUnchanged": package["scripts"]["test"] == old_package["scripts"]["test"],
    "protectedFiles": len(guard_manifest["files"]), "unchangedFreezeHashes": len(guard_manifest["files"]) - len(protected_changed),
    "preexistingApprovedSeams": sorted(protected_changed), "unexpectedProtectedChanges": unexpected_protected,
    "protectedChangesSinceAccepted": protected_new, "unleasedPaths": unleased,
    "newNodeTestFiles": test_files, "newTestDeclarations": sum(len(re.findall(r"\btest\(", (ROOT / p).read_text(encoding="utf-8"))) for p in test_files),
    "newParentVitestGlobIntersection": [p for p in new_source if p.endswith(".test.ts")],
    "unresolvedInternalImports": unresolved, "rawFreezeExit": raw.returncode,
    "rawFreezeDetails": raw_details, "guardEdited": "extensions/qa/tds-boundary.mjs" in changed,
    "sourceOverlaySha256": sha((OUT / "source-overlay-manifest.json").read_bytes()),
    "functionalTests": "NOT_RUN", "typecheck": "NOT_RUN", "install": "NOT_RUN", "uiCheck": "NOT_RUN; no platform UI checkpoint in M3A; raw source guard retained below"}
save("static-source-inspection.json", receipt)
assert not (unleased or frozen_changes or unexpected_protected or protected_new or unresolved)
assert receipt["rootLockUnchanged"] and receipt["isolatedLockUnchangedPendingResolution"]
assert receipt["approvedProposalPreserved"]
assert receipt["acceptedOriginalTestScriptUnchanged"] and not receipt["newParentVitestGlobIntersection"]
assert raw.returncode == 1 and raw_details and not raw_details["mismatches"]
print(json.dumps({"kind": receipt["kind"], "frozenModuleFiles": len(frozen),
    "protectedFiles": receipt["protectedFiles"], "protectedChangesSinceAccepted": len(protected_new),
    "unleased": len(unleased), "overlayFiles": len(overlay), "overlayBytes": sum(row["bytes"] for row in overlay),
    "graphInputs": len(closure), "testDeclarationsNotRun": receipt["newTestDeclarations"],
    "rawFreezeExit": raw.returncode, "rawDenied": len(raw_details["denied"])}))
