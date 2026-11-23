"""Prepare exact formatted-baseline TC followed by the scoped remote-service delta."""
import ast
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / ".git").exists())
TARGET = HERE / "runtime-01"
TARGET.mkdir(exist_ok=True)
NAME = "mcp-runtime-F-20261115-01a1dfaa"
MODULE = "extensions/src/mcp-app/"
sha = lambda data: hashlib.sha256(data).hexdigest()
base = json.loads((HERE / "server-receipts/formatted-input-manifest.json").read_text())
extra = [MODULE + p for p in ["server/access-token.ts", "server/http.ts", "server/REMOTE_SERVICE.md",
    "tests/server/access-token.nodecheck.ts", "tests/server/http.nodecheck.ts"]]
rows = []
overlay = []
old = {r["path"]: r for r in base["files"]}
for name in sorted([*old, *extra]):
    raw = (ROOT / name).read_bytes()
    row = {"path": name, "bytes": len(raw), "sha256": sha(raw)}
    rows.append(row)
    if row != old.get(name):
        path = TARGET / "app" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        overlay.append(name)
manifest = {"kind": "WORKTREE_REMOTE_MCP_CANDIDATE", "baseHead": "656f2bcce13e56b04ce8bbeb9192c0a937255d72",
    "files": rows, "overlayPaths": overlay, "committed": False}
(TARGET / "remote-input-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
source = (HERE / "consumer.py").read_text().replace("mcp-format-F-20261115-01a1dfaa", NAME)
source = source.replace('"/all-own-source", "/all-own-evidence", "/predecessor"]',
    '"/all-own-source", "/all-own-evidence", "/predecessor", "/format-proof"]')
start = source.index('    phases["firstParty34"] = ')
end = source.index('    save("cache-after.json"', start)
source = source[:start] + '''    assert (E / "formatted-input-manifest.json").read_bytes() == Path("/format-proof/formatted-input-manifest.json").read_bytes()
    assert (E / "semantic-equivalence.json").read_bytes() == Path("/format-proof/semantic-equivalence.json").read_bytes()
    for name, expected in [("04-first-party", "d6febbc61ca6890a60f48588e1262577ed798964dd86e3c7caa288388255ee58"),
        ("05-actual-producer", "77d2bcbb3c1805a4e746a320d8f5ea4fa9cd676489a86de5751b4fcae6a8ca40"),
        ("06-format", "17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20")]:
        prior = json.loads((Path("/format-proof") / (name + ".json")).read_text())
        assert prior["actualReturnCode"] == prior["shellExit"] == 0
        assert sha(Path("/format-proof") / (name + ".log")) == expected == prior["logSha256"]
    save("first-party34-compat-format-reuse.json", {"kind": "REUSED_VERIFIED_MATCHING_ALL160_FORMATTED_INPUTS",
        "sameFormattedManifest": True, "sameSemanticProof": True, "firstPartyPass": 34,
        "actualProducerCompatibility": 1, "formatExit": 0})
    if phases["typecheck"]:
        raise RuntimeError("Formatted baseline TC failed; remote-service tests not run")
    manifest = json.loads((D / "remote-input-manifest.json").read_text())
    for name in manifest["overlayPaths"]:
        assert name.startswith(MODULE) and "/ad895-producer/" not in name
        target = work / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists(): target.chmod(0o600)
        target.write_bytes((D / "app" / name).read_bytes())
        target.chmod(0o444)
    save("remote-source-before.json", source_check(manifest))
    phases["remoteTypecheck"] = run("07-remote-typecheck", ["pnpm", "run", "typecheck"], env)
    if not phases["remoteTypecheck"]:
        phases["remoteSdkTests"] = run("08-remote-sdk-tests", ["pnpm", "run", "test"], env)
    save("source-after.json", source_check(manifest))
''' + source[end:]
# Keep only this owned RAM fixture available for scoped follow-up corrections,
# at most30 minutes; no service/port/watch process or unbounded retry loop.
source = source.replace('    stop.set()\n', '''    save("awaiting-owned-finish.json", {"maximumSeconds": 1800, "testExit": code})
    until = time.monotonic() + 1800
    while time.monotonic() < until and not (E / "finish-owned-fixture").exists() and not errors:
        time.sleep(1)
    stop.set()
''')
ast.parse(source)
(TARGET / "consumer.py").write_text(source, newline="\n")
for name in ["run-phase.py", "format-and-compare.mjs"]:
    (TARGET / name).write_bytes((HERE / name).read_bytes())
launch = (HERE / "launch.py").read_text().replace("mcp-format-F-20261115-01a1dfaa", NAME)
launch = launch.replace('"--memory", "512m", "--memory-swap", "512m"', '"--memory", "1g", "--memory-swap", "1g"')
launch = launch.replace('available_ram >= 576', 'available_ram >= 1088')
launch = launch.replace('mounts = [', 'mounts = [\n    ("bind", str(BASE / "evidence/mcp-format-F-20261115-01a1dfaa"), "/format-proof", True),')
ast.parse(launch)
(TARGET / "launch.py").write_text(launch, newline="\n")
print(json.dumps({"job": NAME, "totalInputFiles": len(rows), "overlayFiles": len(overlay),
    "overlayBytes": sum((TARGET / "app" / n).stat().st_size for n in overlay),
    "remoteManifestSha256": sha((TARGET / "remote-input-manifest.json").read_bytes())}, indent=2))
