"""Git/blob/evidence audit only. Does not import or execute project code."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
BASE = "bfbe82b3987ae8d051fc049ef5d2ab519f631d88"
SOURCE = "c35a65d97132f64c1ebd0112ebd7ae0a82273fda"
EVIDENCE = "9ccd0921c48cd6117cdd2f2fc536b8073103b125"
INTRO = "155c6b84df84c900872162e2a8c0267c90641153"
PREFIX = "docs/extensions/qa-evidence/show-library-schema-20261115/compiled-registry-schema-20261115/"
PATHS = ["extensions/src/core/show-library/" + name for name in (
    "compiled-index-authority.ts", "compiled-index-schema.ts",
    "compiled-index-validation.ts", "compiled-index.test.ts")]
REVIEW = Path("C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/reviews/COMPILED_REGISTRY_155C_REVIEW_20261115.md")

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)

def txt(*args):
    return git(*args).decode().strip()

def entry(ref, path):
    return txt("ls-tree", ref, "--", path)

def blob(ref, path):
    return git("show", ref + ":" + path)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")

def evidence_paths(ref):
    names = txt("diff-tree", "--no-commit-id", "--name-only", "-r", ref).splitlines()
    assert all(p in PATHS or p.startswith(PREFIX) for p in names), names
    return [p for p in names if p.startswith(PREFIX)]

if sys.argv[1] == "pre":
    assert txt("rev-parse", "HEAD") == BASE
    assert not txt("diff", "--name-only") and not txt("diff", "--cached", "--name-only")
    assert set(txt("diff", "--name-only", INTRO + "^", EVIDENCE, "--", "extensions/src").splitlines()) == set(PATHS)
    review = REVIEW.read_bytes()
    assert digest(review) == "42474d541023b40ad6abc9ff67fd06e9ddd7a84f9ab74122aa81e8e25673ef85"
    (OUT / "INDEPENDENT_CORRECTION_REVIEW.md").write_bytes(review)
    source = {}
    for p in PATHS:
        assert not entry(BASE, p) and not (ROOT / p).exists()
        source[p] = {"owner": "accepted Show Core producer; integrator exact-blob pick only", "before": "ABSENT", "accepted": entry(SOURCE, p), "sha256": digest(blob(SOURCE, p))}
        assert entry(SOURCE, p) == entry(EVIDENCE, p)
    for p in ("digest.ts", "primitives.ts"):
        p = "extensions/src/core/show-library/" + p
        assert entry(BASE, p) == entry(SOURCE, p)
    picks = [INTRO, SOURCE, EVIDENCE]
    evidence = {ref: evidence_paths(ref) for ref in picks}
    plan = txt("rev-parse", "d3eec67")
    plan_paths = evidence_paths(plan)
    assert len(plan_paths) == 7
    for paths in [*evidence.values(), plan_paths]:
        for p in paths:
            assert not entry(BASE, p) and not (ROOT / p).exists()
    write("PRE_EDIT_LEDGER.json", {
        "recordedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "beforeHead": BASE, "acceptedSource": SOURCE, "acceptedEvidence": EVIDENCE,
        "sourcePaths": source, "cherryPickExactCommits": picks,
        "evidencePathsByCommit": evidence, "planEvidenceRef": plan, "planEvidencePaths": plan_paths,
        "reviewSha256": digest(review), "protectedPackages": entry(BASE, "packages"),
        "authorization": "Root native assignment: integrate exactly four new accepted source leaves and relevant evidence; no unapproved ancestry, build/test/install/push/main/deploy or resource job.",
        "scope": "Diagnostic only; empty immutable authority, false executable acceptance, zero pins. No existing source/barrel/runtime or root/private lock edits.",
        "validation": "Producer server 53/53 + focused TC accepted separately. No integrated execution; parent TC deferred until next accepted M3A batch. ui:check/freeze guard not rerun under explicit no-test instruction; producer historical incident/failures preserved."
    })
    print(json.dumps({"preEdit": "PASS", "sourcePaths": len(source), "evidenceFiles": sum(map(len,evidence.values())), "planFiles": len(plan_paths)}))
elif sys.argv[1] == "post":
    pre = json.loads((OUT / "PRE_EDIT_LEDGER.json").read_text())
    changed = txt("diff", "--name-only", BASE, "HEAD", "--", "extensions/src").splitlines()
    assert set(changed) == set(PATHS)
    assert not txt("diff", "--name-only", BASE, "HEAD", "--", "packages", "pnpm-lock.yaml", "pnpm-workspace.yaml")
    rows = {}
    for p in PATHS:
        assert entry("HEAD", p) == entry(SOURCE, p)
        assert digest((ROOT / p).read_bytes()) == pre["sourcePaths"][p]["sha256"]
        rows[p] = pre["sourcePaths"][p] | {"actual": entry("HEAD", p)}
    previous = json.loads((OUT.parent / "accepted-wave-2/source-plan.json").read_text())
    union = {p: v["approved_after_ls_tree"] for p,v in previous["all_source_paths"].items()}
    union.update({p: entry(SOURCE,p) for p in PATHS})
    assert len(union) == 33
    assert set(txt("diff", "--name-only", previous["before_head"], "HEAD", "--", "extensions/src").splitlines()) == set(union)
    assert all(entry("HEAD",p) == expected for p,expected in union.items())
    expected_evidence = pre["evidencePathsByCommit"] | {pre["planEvidenceRef"]: pre["planEvidencePaths"]}
    evidence_rows = []
    for ref, paths in expected_evidence.items():
        for p in paths:
            assert entry("HEAD",p) == entry(ref,p)
            evidence_rows.append({"path":p,"sourceRef":ref,"entry":entry("HEAD",p),"sha256":digest(blob("HEAD",p))})
    manifest_path = PREFIX + "server-c35-9632e805/EVIDENCE_MANIFEST.json"
    manifest = json.loads(blob("HEAD",manifest_path))
    for row in manifest["files"]:
        data = blob("HEAD", PREFIX + "server-c35-9632e805/" + row["path"])
        assert len(data) == row["bytes"] and digest(data) == row["sha256"], row["path"]
    test_json = json.loads(blob("HEAD", PREFIX + "server-c35-9632e805/server-raw/compiled-index-tests.json"))
    assert test_json["numTotalTests"] == test_json["numPassedTests"] == 53 and test_json["numFailedTests"] == 0
    for ref in (INTRO, SOURCE, EVIDENCE, pre["planEvidenceRef"], txt("rev-parse", "7f71b3f")):
        assert subprocess.run(["git","merge-base","--is-ancestor",ref,"HEAD"],cwd=ROOT).returncode == 1
    callers = []
    for p in txt("ls-tree","-r","--name-only","HEAD","--","extensions/src").splitlines():
        if p in PATHS or not p.endswith((".ts",".tsx",".js",".jsx")): continue
        if re.search(rb"(?:from\s*|import\s*\(|require\s*\()\s*['\"][^'\"]*compiled-index",blob("HEAD",p)):
            callers.append(p)
    assert not callers
    write("POST_PICK_AUDIT.json",{
        "status":"EXACT_FOUR_LEAF_UNION_PASS_NO_EXECUTION", "sourceHead":txt("rev-parse","HEAD"), "sourceTree":txt("rev-parse","HEAD^{tree}"),
        "fourSourcePaths":rows,"cumulative33SourceUnion":union,"evidence":evidence_rows,
        "serverManifestEntriesVerified":len(manifest["files"]),"producer53CaseJsonVerified":True,
        "existingCallers":callers,"protectedPackagesUnchanged":True,"rootLocksUnchanged":True,
        "unapprovedProducerAncestryMerged":False,"localBuildTestInstall":"NOT_RUN",
        "combinedParentTypes":"DEFERRED_BY_ROOT_UNTIL_ACCEPTED_M3A_BATCH", "serverOrKeeperMutation":"NONE"
    })
    print(json.dumps({"postPick":"PASS","fourExactSources":4,"cumulativeSourceUnion":len(union),"exactEvidenceFiles":len(evidence_rows),"manifestEntries":len(manifest["files"]),"producerPassed":53,"localExecuted":0}))
else:
    raise ValueError("pre or post")
