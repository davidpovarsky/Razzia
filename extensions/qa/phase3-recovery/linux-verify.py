"""Qualify committed source in the existing isolated Linux QA container only.

Uses new task-owned paths; never reads the customer mount or edits old QA trees.
No service restart, installation, image build, customer operation or cleanup.
"""
import hashlib
import json
import pathlib
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
RUN = f"tadazz-codex-{SHA[:12]}-{uuid.uuid4().hex[:8]}"
EVIDENCE = ROOT / "docs/extensions/plans/phase3-takeover-20261117" / RUN
EVIDENCE.mkdir()
ARCHIVE = pathlib.Path(tempfile.mkdtemp(prefix=RUN)) / "source.tar.gz"
SOURCE_PATHS = ["extensions", "packages", "package.json", "tsconfig.json",
                "pnpm-workspace.yaml", "pnpm-lock.yaml", "oxlint.config.ts",
                ".prettierrc.json", ".prettierrc", "prettier.config.mjs"]
tracked = subprocess.check_output(["git", "ls-files", *SOURCE_PATHS], cwd=ROOT, text=True).splitlines()
subprocess.run(["git", "archive", "--format=tar.gz", "-o", str(ARCHIVE), SHA,
                "--", *sorted({p.split('/')[0] for p in tracked})], cwd=ROOT, check=True)
with tarfile.open(ARCHIVE, "r:gz") as archive:
    manifest = {}
    for member in archive.getmembers():
        if member.isfile():
            manifest[member.name] = hashlib.sha256(archive.extractfile(member).read()).hexdigest()
        elif not member.isdir():
            raise RuntimeError(f"Unexpected archive member: {member.name}")
(EVIDENCE / "input-manifest.json").write_text(json.dumps({"sha": SHA, "files": manifest}, indent=2) + "\n", encoding="utf8", newline="\n")
remote_archive = f"/tmp/{RUN}.tar.gz"
subprocess.run(["scp", "-i", str(pathlib.Path.home() / ".ssh/tadazz_oracle_2026"),
                "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                str(ARCHIVE), f"ubuntu@132.145.25.168:{remote_archive}"], check=True)

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
base = "/tmp/" + c["run"]
source = base + "/source"
fixture = "/evidence/" + c["run"] + "/fixtures"
setup = r"""
import hashlib, json, os, pathlib, sys, tarfile
source, fixture, archive_path = sys.argv[1:]
pathlib.Path(source).mkdir(parents=True, mode=0o700, exist_ok=False)
pathlib.Path(fixture).mkdir(parents=True, mode=0o700, exist_ok=False)
assert os.statvfs(fixture).f_bavail * os.statvfs(fixture).f_frsize > 128 * 1024 * 1024
with tarfile.open(archive_path, "r:gz") as archive:
    for member in archive.getmembers():
        p = pathlib.PurePosixPath(member.name)
        assert not p.is_absolute() and ".." not in p.parts
        assert member.isfile() or member.isdir()
    archive.extractall(source, filter="data")
for directory in ["", "extensions", "packages/common", "packages/socket", "packages/web", "extensions/src/mcp-app"]:
    target = pathlib.Path(source) / directory / "node_modules"
    dependency = pathlib.Path("/cleanup") / directory / "node_modules"
    if dependency.is_dir():
        assert not target.exists()
        target.symlink_to(dependency, target_is_directory=True)
print(json.dumps({"source": source, "fixture": fixture}))
"""
subprocess.run(["docker", "exec", container, "mkdir", "-m", "700", base], check=True)
# docker cp resolves tmpfs paths outside the exec mount namespace on this host.
# Stream into an exclusive file through exec, which sees the actual QA tmpfs.
copy_script = "import shutil,sys;f=open(sys.argv[1],'xb');shutil.copyfileobj(sys.stdin.buffer,f);f.close()"
with open(c["archive"], "rb") as archive_stream:
    subprocess.run(["docker", "exec", "-i", container, "python3", "-c", copy_script, base + "/source.tar.gz"], stdin=archive_stream, check=True, stdout=subprocess.DEVNULL)
initialized = execute(["docker", "exec", "-i", container, "python3", "-c", setup, source, fixture, base + "/source.tar.gz"], timeout=60)
assert initialized.returncode == 0, initialized.stderr
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
case5 = check("ext4-case5", 60, tsx + ["--test-name-pattern=^5[.]", qualification])
if case5:
    check("ext4-full8", 300, tsx + [qualification, invariants])
scope = ["extensions/qa/phase3-recovery/backup-restore.ts", "extensions/qa/phase3-recovery/recovery-child.ts", qualification, invariants, "extensions/src/core/card-media-references.ts", "extensions/src/server/storage/service.ts"]
check("recovery-types", 120, ["node", "/cleanup/node_modules/typescript/bin/tsc", "--noEmit", "-p", "extensions/qa/phase3-recovery/tsconfig.json"])
check("recovery-lint", 120, ["node", "--experimental-strip-types", "/cleanup/node_modules/oxlint/bin/oxlint", "-c", "oxlint.config.ts", *scope])
check("recovery-format", 60, ["node", "/cleanup/node_modules/prettier/bin/prettier.cjs", "--check", *scope])
after = hashes()
assert after == before, "Source changed during qualification"
print(json.dumps({"sha": c["sha"], "run": c["run"], "source": source, "fixture": fixture, "sourceFileCount": len(before), "allHashesVerifiedBeforeAfter": True, "hashesBefore": before, "hashesAfter": after, "checks": checks, "customerMountAccessed": False, "productionChanged": False}, indent=2))
'''
configuration = {"sha": SHA, "run": RUN, "archive": remote_archive, "manifest": manifest}
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
sys.exit(0 if all(item["exit"] == 0 for item in receipt["checks"]) and any(item["label"] == "ext4-full8" for item in receipt["checks"]) else 1)
