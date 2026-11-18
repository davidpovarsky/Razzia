"""Qualify committed source in the existing isolated Linux QA container only.

Uses new task-owned paths; never reads the customer mount or edits old QA trees.
No service restart, installation, image build, customer operation or cleanup.
"""
import hashlib
import json
import pathlib
import re
import shlex
import subprocess
import sys
import tarfile
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[3]
SSH = ["ssh", "-i", str(pathlib.Path.home() / ".ssh/tadazz_oracle_2026"),
       "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
       "-o", "ConnectTimeout=10", "ubuntu@132.145.25.168"]
CONTAINER = "tadazz-phase2-20261116"
SHA = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
SUITE = sys.argv[1] if len(sys.argv) > 1 else "recovery"
if SUITE not in ("recovery", "native-consent", "native-proxy", "native-launch", "full-show-assets", "full-show-selection"):
    raise SystemExit("Expected recovery, native-consent, native-proxy, native-launch, full-show-assets or full-show-selection")
REUSE = len(sys.argv) == 4 and sys.argv[2] == "--reuse-run"
RUN = sys.argv[3] if REUSE else f"tadazz-codex-{SHA[:12]}-{uuid.uuid4().hex[:8]}"
if not re.fullmatch(r"tadazz-codex-" + SHA[:12] + r"-[a-f0-9]{8}", RUN):
    raise SystemExit("Reuse source must belong to this exact immutable SHA")
EVIDENCE_BASE = ROOT / "docs/extensions/plans/phase3-takeover-20261117"
EVIDENCE = EVIDENCE_BASE / (RUN + "-retry-" + uuid.uuid4().hex[:8] if REUSE else RUN)
EVIDENCE.mkdir()
ARCHIVE = pathlib.Path(tempfile.mkdtemp(prefix=RUN)) / "source.tar.gz"
SOURCE_PATHS = ["extensions", "packages", "package.json", "tsconfig.json",
                "pnpm-workspace.yaml", "pnpm-lock.yaml", "oxlint.config.ts",
                ".prettierrc.json", ".prettierrc", "prettier.config.mjs"]
tracked = subprocess.check_output(["git", "ls-files", *SOURCE_PATHS], cwd=ROOT, text=True).splitlines()
if REUSE:
    previous_input = json.loads((EVIDENCE_BASE / RUN / "input-manifest.json").read_text(encoding="utf8"))
    assert previous_input["sha"] == SHA
    manifest = previous_input["files"]
else:
    subprocess.run(["git", "archive", "--format=tar.gz", "-o", str(ARCHIVE), SHA,
                    "--", *sorted({p.split('/')[0] for p in tracked})], cwd=ROOT, check=True)
    with tarfile.open(ARCHIVE, "r:gz") as archive:
        manifest = {}
        source_bytes = 0
        for member in archive.getmembers():
            if member.isfile():
                manifest[member.name] = hashlib.sha256(archive.extractfile(member).read()).hexdigest()
                source_bytes += member.size
            elif not member.isdir():
                raise RuntimeError(f"Unexpected archive member: {member.name}")
(EVIDENCE / "input-manifest.json").write_text(json.dumps({"sha": SHA, "files": manifest}, indent=2) + "\n", encoding="utf8", newline="\n")
if not REUSE:
    inspected = json.loads(subprocess.check_output([*SSH, "sudo -n docker inspect " + CONTAINER]))[0]
    assert inspected["State"]["Running"] and inspected["HostConfig"]["NetworkMode"] == "none"
    assert not inspected["HostConfig"].get("PortBindings")
    extract_stream = r"""
import os,pathlib,shutil,sys,tarfile
source=pathlib.Path(sys.argv[1]);fixture=pathlib.Path(sys.argv[2])
assert os.statvfs(source.parent.parent).f_bavail * os.statvfs(source.parent.parent).f_frsize > int(sys.argv[3])
source.parent.mkdir(mode=0o700,exist_ok=False)
source.mkdir(mode=0o700);fixture.mkdir(mode=0o700)
with tarfile.open(fileobj=sys.stdin.buffer,mode="r|gz") as archive:
    for member in archive:
        relative=pathlib.PurePosixPath(member.name)
        assert not relative.is_absolute() and ".." not in relative.parts
        assert member.isfile() or member.isdir()
        destination=source.joinpath(*relative.parts)
        if member.isdir(): destination.mkdir(parents=True,exist_ok=True)
        else:
            destination.parent.mkdir(parents=True,exist_ok=True)
            with destination.open("xb") as output: shutil.copyfileobj(archive.extractfile(member),output)
            destination.chmod(member.mode & 0o777)
"""
    extraction = shlex.join(["sudo", "-n", "docker", "exec", "-i", CONTAINER,
                              "python3", "-c", extract_stream,
                              f"/evidence/{RUN}/source", f"/evidence/{RUN}/fixtures",
                              str(source_bytes + 128*1024*1024 if SUITE.startswith("full-show-") or SUITE == "native-launch" else 512*1024*1024)])
    with ARCHIVE.open("rb") as archive_stream:
        transferred = subprocess.run([*SSH, extraction], stdin=archive_stream, capture_output=True, timeout=120)
    if transferred.returncode:
        (EVIDENCE / "transfer.stderr.log").write_bytes(transferred.stderr)
        raise SystemExit(transferred.stderr.decode(errors="replace"))

# The remote controller uses argv arrays and writes only fresh paths. Embedded
# configuration contains synthetic locations and SHA256 values, not credentials.
REMOTE = r'''
import hashlib, json, pathlib, subprocess, sys, time
c = CONFIG
container = "tadazz-phase2-20261116"
def execute(argv, **kw):
    return subprocess.run(argv, capture_output=True, text=True, **kw)
inspection = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
assert inspection["State"]["Running"]
assert inspection["HostConfig"]["NetworkMode"] == "none"
assert not inspection["HostConfig"].get("PortBindings")
assert inspection["HostConfig"]["Memory"] > 0, "Existing QA memory quota required"
assert inspection["HostConfig"].get("NanoCpus", 0) > 0 or inspection["HostConfig"].get("CpuQuota", 0) > 0, "Existing CPU quota required"
base = "/evidence/" + c["run"]
source = base + "/source"
fixture = "/evidence/" + c["run"] + "/fixtures"
setup = r"""
import json,pathlib,sys
source,fixture=sys.argv[1:]
for directory in ["", "extensions", "packages/common", "packages/socket", "packages/web", "extensions/src/mcp-app"]:
    target = pathlib.Path(source) / directory / "node_modules"
    dependency = pathlib.Path("/cleanup") / directory / "node_modules"
    if dependency.is_dir():
        assert not target.exists()
        target.symlink_to(dependency, target_is_directory=True)
print(json.dumps({"source": source, "fixture": fixture}))
"""
if not c["reuse"]:
    initialized = execute(["docker", "exec", "-i", container, "python3", "-c", setup, source, fixture], timeout=60)
    assert initialized.returncode == 0, initialized.stderr
sdk_setup = r"""
import json,os,pathlib,sys
source = pathlib.Path(sys.argv[1])
dependency = pathlib.Path("/tmp/phase3-999ed90c/deps/node_modules")
versions = {}
for package, expected in [("server", "2.4.0"), ("client", "2.4.0"), ("core", "2.4.0")]:
    value=json.loads((dependency / "@modelcontextprotocol" / package / "package.json").read_text())["version"]
    assert value == expected
    versions[package]=value
target=source / "extensions/src/mcp-app/node_modules"
if os.path.lexists(target):
    assert target.is_symlink() and target.resolve() == dependency.resolve()
else:
    target.symlink_to(dependency, target_is_directory=True)
print(json.dumps(versions))
"""
sdk_result=execute(["docker", "exec", container, "python3", "-c", sdk_setup, source], timeout=15)
assert sdk_result.returncode == 0, sdk_result.stderr
sdk_versions=json.loads(sdk_result.stdout)
hashscript = "import hashlib,json,pathlib,sys;root=pathlib.Path(sys.argv[1]);paths=json.load(sys.stdin);print(json.dumps({p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}))"
def hashes():
    result = execute(["docker", "exec", "-i", container, "python3", "-c", hashscript, source], input=json.dumps(list(c["manifest"])), timeout=30)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)
before = hashes()
assert before == c["manifest"], "Uploaded source does not match immutable Git archive"
prefix = ["docker", "exec", "-w", source, "-e", "PHASE3_RECOVERY_REQUIRE_EXT4=1", "-e", "C1_FIXTURE_ROOT=" + fixture, "-e", "TSX_DISABLE_CACHE=1", "-e", "NODE_OPTIONS=--max-old-space-size=1024", container, "nice", "-n", "19", "taskset", "-c", "0", "timeout", "-k", "5"]
tsx = ["node", "/cleanup/extensions/node_modules/tsx/dist/cli.mjs", "--tsconfig", "tsconfig.json", "--test", "--test-concurrency=1"]
qualification = "extensions/qa/phase3-recovery/recovery-qualification.node.ts"
invariants = "extensions/qa/phase3-recovery/recovery-invariants.node.ts"
checks = []
def check(label, seconds, argv):
    started = time.time()
    command = prefix + [str(seconds)] + argv
    result = execute(command, timeout=seconds+15)
    record = {"label": label, "command": command, "exit": result.returncode, "seconds": round(time.time()-started, 3), "stdout": result.stdout, "stderr": result.stderr}
    checks.append(record)
    return result.returncode == 0
if c["suite"] in ("full-show-assets", "full-show-selection"):
    scope = ["extensions/src/mcp-app/server/full-show-assets.ts", "extensions/qa/phase3-full-show/assets.nodecheck.ts"]
    prefix[4:4] = ["-e", "TMPDIR=" + fixture]
    check("full-show-assets", 60, tsx + [scope[1]])
    if c["suite"] == "full-show-selection":
        scope += ["extensions/src/mcp-app/contracts/full-show-selection.ts", "extensions/src/mcp-app/server/full-show-selection.ts", "extensions/src/mcp-app/server/authoring.ts", "extensions/src/mcp-app/server/preview-resource.ts", "extensions/qa/phase3-full-show/selection.nodecheck.ts", "extensions/qa/phase3-full-show/resource-csp.nodecheck.ts"]
        check("full-show-selection", 90, tsx + scope[-2:])
        regression = "extensions/src/mcp-app/tests/"
        check("selection-authoring-regressions", 120, tsx + [regression + p for p in ["server/drafts.nodecheck.ts", "server/integrity.nodecheck.ts", "server/boundaries.nodecheck.ts", "first-party/oauth.nodecheck.ts", "first-party/preview-candidate.nodecheck.ts"]])
    check("assets-types", 120, ["node", "/cleanup/node_modules/typescript/bin/tsc", "--noEmit", "-p", "extensions/qa/phase3-full-show/tsconfig.json"])
    check("assets-lint", 120, ["node", "--experimental-strip-types", "/cleanup/node_modules/oxlint/bin/oxlint", "-c", "oxlint.config.ts", *scope])
    check("assets-format", 60, ["node", "/cleanup/node_modules/prettier/bin/prettier.cjs", "--check", *scope])
elif c["suite"] == "recovery":
    case5 = check("ext4-case5", 60, tsx + ["--test-name-pattern=^5[.]", qualification])
    if case5:
        check("ext4-full8", 300, tsx + [qualification, invariants])
    scope = ["extensions/qa/phase3-recovery/backup-restore.ts", "extensions/qa/phase3-recovery/recovery-child.ts", qualification, invariants, "extensions/src/core/card-media-references.ts", "extensions/src/server/storage/service.ts"]
    check("recovery-types", 120, ["node", "/cleanup/node_modules/typescript/bin/tsc", "--noEmit", "-p", "extensions/qa/phase3-recovery/tsconfig.json"])
    check("recovery-lint", 120, ["node", "--experimental-strip-types", "/cleanup/node_modules/oxlint/bin/oxlint", "-c", "oxlint.config.ts", *scope])
    check("recovery-format", 60, ["node", "/cleanup/node_modules/prettier/bin/prettier.cjs", "--check", *scope])
else:
    native = "extensions/qa/phase3-native-consent/"
    prefix[4:4] = ["-e", "TMPDIR=" + fixture]
    cases = [native + "host-lifetime.nodecheck.ts", native + "consent-routes.nodecheck.ts", native + "native-host-e2e.nodecheck.ts"]
    if c["suite"] == "native-launch":
        cases.extend(native + name for name in ["production-config.nodecheck.ts", "production-capabilities.nodecheck.ts", "production-artifacts.nodecheck.ts"])
    http_ok = check("native-http", 180, tsx + cases)
    check("native-types", 120, ["node", "/cleanup/node_modules/typescript/bin/tsc", "--noEmit", "-p", native + "tsconfig.json"])
    check("native-lint", 120, ["node", "--experimental-strip-types", "/cleanup/node_modules/oxlint/bin/oxlint", "-c", "oxlint.config.ts", "extensions/src/mcp-app/native-host", native])
    check("native-format", 60, ["node", "/cleanup/node_modules/prettier/bin/prettier.cjs", "--check", "extensions/src/mcp-app/native-host", native, "extensions/src/site/web/studio/Studio.tsx"])
    if http_ok and c["suite"] == "native-launch":
        prefix[4:4] = ["-e", "TADAZZ_NATIVE_HOST_DIST_DIR=" + fixture + "/native-host-build"]
        widget_ok = check("native-widget-build", 300, ["node", "extensions/src/mcp-app/widget/build-full-show.mjs"])
        if widget_ok:
            check("native-launch-build", 90, ["node", "extensions/deployment/build-native-host.mjs"])
    if http_ok and c["suite"] == "native-consent":
        prefix[4:4] = ["-e", "TADAZZ_SITE_ENABLED=true", "-e", "VITE_TADAZZ_OAUTH_ISSUER_PATH=/oauth", "-e", "VITE_TADAZZ_NATIVE_CONSENT_ENABLED=true", "-e", "TADAZZ_SITE_DIST_DIR=" + source + "/packages/web/dist", "-e", "TADAZZ_QA_RUN_DIR=" + fixture + "/browser", "-e", "TADAZZ_QA_OWNED_RUN_DIR=1"]
        # Consent/browser qualification does not manufacture a full-show pin or
        # rewrite the tracked preview-build manifest. Full-show is a later gate.
        site_ok = check("native-site-build", 180, ["node", "/cleanup/packages/web/node_modules/vite/bin/vite.js", "build", "--config", "extensions/site.vite.config.ts"])
        # Browser QA runs separately in a fresh bounded container with read-only
        # source and caches. The preserved old container has a full /tmp and
        # unreaped historical browser processes; do not restart or clean it.
after = hashes()
changed_source = [p for p in before if before[p] != after[p]]
print(json.dumps({"sha": c["sha"], "suite": c["suite"], "run": c["run"], "source": source, "fixture": fixture, "sdkVersions": sdk_versions, "sourceFileCount": len(before), "allHashesVerifiedBeforeAfter": not changed_source, "changedSourcePaths": changed_source, "hashesBefore": before, "hashesAfter": after, "checks": checks, "customerMountAccessed": False, "productionChanged": False}, indent=2))
'''
configuration = {"sha": SHA, "suite": SUITE, "run": RUN, "reuse": REUSE, "manifest": manifest}
script = REMOTE.replace("c = CONFIG", "c = " + repr(configuration))
result = subprocess.run([*SSH, "sudo -n python3 -"], input=script, text=True, encoding="utf8", capture_output=True, timeout=650)
(EVIDENCE / "controller.stdout.log").write_text(result.stdout, encoding="utf8")
(EVIDENCE / "controller.stderr.log").write_text(result.stderr, encoding="utf8")
if result.returncode != 0:
    print(result.stderr[-6000:])
    print(f"Controller failed; preserved evidence: {EVIDENCE}")
    sys.exit(result.returncode)
receipt = json.loads(result.stdout)
(EVIDENCE / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf8", newline="\n")
print(json.dumps({"sha": SHA, "evidence": str(EVIDENCE), "sourceFilesVerified": receipt["sourceFileCount"], "checks": [{"label": item["label"], "exit": item["exit"], "seconds": item["seconds"]} for item in receipt["checks"]]}, indent=2))
required_gate = SUITE if SUITE.startswith("full-show-") else "ext4-full8" if SUITE == "recovery" else "native-http" if SUITE == "native-proxy" else "native-launch-build" if SUITE == "native-launch" else "native-site-build"
passed = receipt["allHashesVerifiedBeforeAfter"] and all(item["exit"] == 0 for item in receipt["checks"]) and any(item["label"] == required_gate for item in receipt["checks"])
if passed and SUITE == "native-consent":
    browser = ROOT / "extensions/qa/phase3-native-consent/browser-verify.py"
    sys.exit(subprocess.run([sys.executable, str(browser), RUN], cwd=ROOT).returncode)
if passed and SUITE == "native-proxy":
    proxy = ROOT / "extensions/qa/phase3-native-consent/proxy-verify.py"
    sys.exit(subprocess.run([sys.executable, str(proxy), "--source-run", RUN, "--immutable"], cwd=ROOT).returncode)
if passed and SUITE == "native-launch":
    launcher = ROOT / "extensions/qa/phase3-native-consent/production-launch-verify.py"
    sys.exit(subprocess.run([sys.executable, str(launcher), RUN], cwd=ROOT).returncode)
sys.exit(0 if passed else 1)
