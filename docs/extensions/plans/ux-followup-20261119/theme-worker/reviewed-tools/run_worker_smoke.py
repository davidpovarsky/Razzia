#!/usr/bin/env python3
"""Reviewed one-job Linux smoke. Preparation does not run this helper.
No application APIs, account files, credentials, network, image pull or build.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

IMAGE = "sha256:aea88c60c29d5160dfe5ae822179da4233ed882c3979b4d592f6cd86902e05c5"
MANIFEST_SHA256 = "60e57a577a69cd592c1fd2c81cbc902878206050126693fb27b06c94d2a54b09"
WORKER_SHA256 = "7b591a69dd4aca951cf0f8224670c797696979085ae23c01d596ab99159d60d6"
NAMESPACE = Path("/home/ubuntu/tadazz-theme-worker-ux-followup-20261119")
DOCKER = "/usr/bin/docker"
OWNER_LABEL = "com.tadazz.qa.theme-worker-owner"
TOOLCHAIN = "esbuild@0.28.2;react@19.3.0;ffmpeg@5.1.9"

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def checked_file(root, relative):
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise RuntimeError("Invalid relative input path")
    item = Path(relative)
    if item.is_absolute() or any(p in ("", ".", "..") for p in item.parts):
        raise RuntimeError("Input path traversal denied")
    candidate = root / item
    for part in [candidate, *candidate.parents]:
        if part == root:
            break
        if part.is_symlink():
            raise RuntimeError("Symlink input denied")
    if not candidate.is_file() or not candidate.resolve().is_relative_to(root):
        raise RuntimeError("Regular input under the package root required")
    return candidate

def docker(arguments, seconds):
    return subprocess.run([DOCKER, *arguments], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=seconds)

def missing_container(result, name):
    message = result.stderr.lower()
    return result.returncode != 0 and "no such" in message and name in result.stderr

def clean_owned_container(name, owner):
    check = docker(["container", "inspect", "--format",
                    "{{ index .Config.Labels \"" + OWNER_LABEL + "\" }}", name], 5)
    if missing_container(check, name):
        return {"removed": True, "alreadyAbsent": True}
    if check.returncode != 0 or check.stdout.strip() != owner:
        return {"removed": False, "reason": "Ownership could not be verified"}
    removed = docker(["container", "rm", "-f", name], 10)
    after = docker(["container", "inspect", "--format", "{{.Id}}", name], 5)
    return {"removed": removed.returncode == 0 and missing_container(after, name),
            "alreadyAbsent": False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true",
                        help="Run only after coordinator review and serial gate release")
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,31}", args.run_id):
        raise RuntimeError("Use a fresh lowercase run ID of at most 32 characters")
    if not args.execute:
        print(json.dumps({"status": "PREPARED_NOT_EXECUTED", "image": IMAGE,
                          "runId": args.run_id, "maxWorkerSeconds": 45,
                          "maxContainers": 1, "cpus": 1, "memoryMiB": 768}))
        return 0
    if sys.platform != "linux" or os.geteuid() != 0:
        raise RuntimeError("Coordinator must run as the Linux Docker operator")
    inputs = Path(__file__).resolve().parent
    if inputs != NAMESPACE / "inputs" or NAMESPACE.resolve() != NAMESPACE:
        raise RuntimeError("Dedicated reviewed namespace required")
    if not Path(DOCKER).is_file():
        raise RuntimeError("Docker executable missing")
    manifest_file = checked_file(inputs, "input-manifest.json")
    if digest(manifest_file) != MANIFEST_SHA256:
        raise RuntimeError("Input manifest differs from the reviewed pin")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest["image"] != IMAGE:
        raise RuntimeError("Image pin mismatch")
    for relative, pin in manifest["files"].items():
        item = checked_file(inputs, relative)
        if item.stat().st_size != pin["bytes"] or digest(item) != pin["sha256"]:
            raise RuntimeError("Pinned synthetic input changed: " + relative)
    if digest(checked_file(inputs, "original-package-build-worker.py")) != WORKER_SHA256:
        raise RuntimeError("Reviewed operator-worker reference changed")
    job_relative = manifest["jobPath"]
    if not re.fullmatch(r"store/[a-f0-9]{64}/jobs/[a-f0-9-]{36}", job_relative):
        raise RuntimeError("Unexpected synthetic store layout")
    archive = checked_file(inputs, job_relative + "/source.tadazz")
    request_file = checked_file(inputs, job_relative + "/request.json")
    store_files = sorted(p.relative_to(inputs).as_posix()
                         for p in (inputs / "store").rglob("*") if p.is_file())
    if store_files != sorted([job_relative + "/source.tadazz", job_relative + "/request.json"]):
        raise RuntimeError("Exactly one fresh two-file synthetic job required")
    request = json.loads(request_file.read_text(encoding="utf-8"))
    if request["sourceDigest"] != manifest["archiveSha256"] or digest(archive) != manifest["archiveSha256"]:
        raise RuntimeError("Archive/request digest mismatch")
    expected_themes = sorted(manifest["expectedCompiledThemeIds"])
    if len(expected_themes) != 1 or sorted(t["id"] for t in request["themes"]) != expected_themes:
        raise RuntimeError("One compiled synthetic theme required")
    image = docker(["image", "inspect", "--format", "{{.Id}}", IMAGE], 5)
    if image.returncode != 0 or image.stdout.strip() != IMAGE:
        print(json.dumps({"status": "BLOCKED_PINNED_IMAGE_ABSENT_OR_UNAVAILABLE",
                          "image": IMAGE, "containerStarted": False,
                          "imagePulledOrBuilt": False}))
        return 3
    name = "tadazz-ux-theme-worker-" + args.run_id
    existing = docker(["container", "inspect", "--format", "{{.Id}}", name], 5)
    if not missing_container(existing, name):
        raise RuntimeError("Container name is not provably unused")
    evidence = NAMESPACE / "evidence"
    if evidence.is_symlink():
        raise RuntimeError("Evidence symlink denied")
    evidence.mkdir(mode=0o700, exist_ok=True)
    run = evidence / args.run_id
    run.mkdir(mode=0o700, exist_ok=False)
    incoming = run / "input"
    output = run / "output"
    incoming.mkdir(mode=0o755)
    output.mkdir(mode=0o777)
    incoming.chmod(0o755)
    output.chmod(0o777)
    staged = incoming / "source.tadazz"
    shutil.copyfile(archive, staged)
    staged.chmod(0o444)
    owner = args.run_id + ":" + MANIFEST_SHA256
    command = [
        "run", "--rm", "--pull=never", "--name", name,
        "--label", OWNER_LABEL + "=" + owner,
        "--network", "none", "--read-only", "--user", "65534:65534",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--cpus", "1", "--memory", "768m", "--memory-swap", "768m",
        "--pids-limit", "48", "--ulimit", "fsize=8388608:8388608",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "-e", "TADAZZ_BUILD_SANDBOX=1",
        "--mount", "type=bind,src=" + str(incoming) + ",dst=/input,readonly",
        "--mount", "type=bind,src=" + str(output) + ",dst=/output",
        "--entrypoint", "node", IMAGE,
        "--import", "/cleanup/extensions/node_modules/tsx/dist/loader.mjs",
        "/cleanup/extensions/qa/package-builder.ts", "/input/source.tadazz", "/output",
    ]
    report = {
        "format": "tadazz-theme-worker-smoke-v1", "status": "FAIL",
        "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sourceCandidate": manifest["sourceCandidate"], "image": IMAGE,
        "manifestSha256": MANIFEST_SHA256, "archiveSha256": manifest["archiveSha256"],
        "container": name, "dockerCommand": [DOCKER, *command],
        "maxWorkerSeconds": 45, "cpus": 1, "memoryMiB": 768, "pids": 48,
        "network": "none", "containerUid": "65534:65534", "rootReadOnly": True,
        "inputReadOnly": True, "customerDataAccessed": False,
        "applicationApiCalled": False, "imagePulledOrBuilt": False,
    }
    start = time.monotonic()
    try:
        completed = docker(command, 45)
        (run / "worker.stdout.log").write_text(completed.stdout, encoding="utf-8")
        (run / "worker.stderr.log").write_text(completed.stderr, encoding="utf-8")
        report["workerExitCode"] = completed.returncode
        if completed.returncode != 0:
            raise RuntimeError("Worker exited nonzero")
        names = sorted(p.name for p in output.iterdir())
        if names != ["bundle.json", "result.json"]:
            raise RuntimeError("Unexpected worker output inventory")
        for file in output.iterdir():
            if file.is_symlink() or not file.is_file() or file.stat().st_size > 8_000_000:
                raise RuntimeError("Unsafe worker output")
        result = json.loads((output / "result.json").read_text(encoding="utf-8"))
        bundle_bytes = (output / "bundle.json").read_bytes()
        bundle = json.loads(bundle_bytes)
        if result.get("error"):
            raise RuntimeError("Worker reported rejection")
        if result.get("sourceDigest") != manifest["archiveSha256"]:
            raise RuntimeError("Worker source digest mismatch")
        if result.get("outputDigest") != hashlib.sha256(bundle_bytes).hexdigest():
            raise RuntimeError("Worker output digest mismatch")
        if result.get("mediaValidated") is not True or result.get("toolchain") != TOOLCHAIN:
            raise RuntimeError("Media/toolchain attestation mismatch")
        if not isinstance(bundle, dict) or sorted(bundle) != expected_themes:
            raise RuntimeError("Compiled theme inventory mismatch")
        for theme in bundle.values():
            if not isinstance(theme, dict) or not isinstance(theme.get("js"), str) or not theme["js"]:
                raise RuntimeError("Missing compiled JavaScript")
            if not isinstance(theme.get("css"), str) or not isinstance(theme.get("assets"), dict):
                raise RuntimeError("Invalid compiler bundle shape")
        if digest(staged) != manifest["archiveSha256"] or digest(archive) != manifest["archiveSha256"]:
            raise RuntimeError("Read-only source changed")
        report.update({"status": "PASS", "mediaValidated": True, "toolchain": TOOLCHAIN,
                       "compiledThemeIds": expected_themes,
                       "outputDigest": result["outputDigest"], "bundleBytes": len(bundle_bytes),
                       "sourceUnchanged": True})
    except BaseException as error:
        report["error"] = type(error).__name__ + ": " + str(error)[:1000]
    finally:
        try:
            report["cleanup"] = clean_owned_container(name, owner)
        except BaseException as error:
            report["cleanup"] = {"removed": False, "reason": type(error).__name__}
        if not report["cleanup"]["removed"]:
            report["status"] = "FAIL"
        report["elapsedSeconds"] = round(time.monotonic() - start, 3)
        report["finishedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        (run / "receipt.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": report["status"], "receipt": str(run / "receipt.json"),
                          "containerRemoved": report["cleanup"]["removed"],
                          "elapsedSeconds": report["elapsedSeconds"]}))
    return 0 if report["status"] == "PASS" else 1

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "BLOCKED_PREFLIGHT", "error": str(error)[:1000],
                          "imagePulledOrBuilt": False}))
        raise SystemExit(2)
