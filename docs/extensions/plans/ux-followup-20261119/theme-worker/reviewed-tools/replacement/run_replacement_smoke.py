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

IMAGE = None
BASE_IMAGE = "sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647"
SOURCE_MANIFEST_SHA256 = "751fa33e6591657fa40d14f99eb0f6eca775787e7ff5f0b18989bb69c73a89dd"
CONTEXT_MANIFEST_SHA256 = "8873df14cdff05994fae0d3e67d8401de58f52a7fc6fb3866056240907d8962b"
VERIFIER_SHA256 = "18e47aa70d824c306713c0aeba199d400c0a6f1f191944b1c1d8097dd87ec22f"
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
    global IMAGE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true",
                        help="Run only after coordinator review and serial gate release")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--image-id", required=True)
    parser.add_argument("--phase", choices=["provenance", "compile"], required=True)
    parser.add_argument("--provenance-receipt")
    args = parser.parse_args()
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", args.image_id):
        raise RuntimeError("Explicit immutable derivative image ID required")
    IMAGE = args.image_id
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,31}", args.run_id):
        raise RuntimeError("Use a fresh lowercase run ID of at most 32 characters")
    if not args.execute:
        print(json.dumps({"status": "PREPARED_NOT_EXECUTED", "image": IMAGE,
                          "runId": args.run_id, "maxWorkerSeconds": 45,
                          "maxContainers": 1, "cpus": 1, "memoryMiB": 768}))
        return 0
    if sys.platform != "linux" or os.geteuid() != 0:
        raise RuntimeError("Coordinator must run as the Linux Docker operator")
    inputs = Path(__file__).resolve().parent.parent
    if inputs != NAMESPACE / "inputs" or NAMESPACE.resolve() != NAMESPACE:
        raise RuntimeError("Dedicated reviewed namespace required")
    if not Path(DOCKER).is_file():
        raise RuntimeError("Docker executable missing")
    manifest_file = checked_file(inputs, "input-manifest.json")
    if digest(manifest_file) != MANIFEST_SHA256:
        raise RuntimeError("Input manifest differs from the reviewed pin")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest["image"] != "sha256:aea88c60c29d5160dfe5ae822179da4233ed882c3979b4d592f6cd86902e05c5":
        raise RuntimeError("Historical synthetic-fixture manifest changed")
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
    build_receipt = json.loads(checked_file(inputs, "replacement/image-build-receipt.json").read_text())
    if (build_receipt.get("status") != "BUILT_NOT_ACTIVATED"
        or build_receipt.get("imageId") != IMAGE
        or build_receipt.get("baseImage") != BASE_IMAGE
        or build_receipt.get("contextManifestSha256") != CONTEXT_MANIFEST_SHA256
        or build_receipt.get("sourceManifestSha256") != SOURCE_MANIFEST_SHA256
        or build_receipt.get("verifierSha256") != VERIFIER_SHA256
        or build_receipt.get("buildNetwork") != "none"
        or build_receipt.get("dependencyInstall") is not False
        or build_receipt.get("mutableCacheBindUsed") is not False):
        raise RuntimeError("Reviewed derivative build receipt required")
    source_pins_file = checked_file(inputs, "replacement/context/provenance/worker-source-pins.json")
    if digest(source_pins_file) != SOURCE_MANIFEST_SHA256:
        raise RuntimeError("Worker source provenance manifest changed")
    source_pins = json.loads(source_pins_file.read_text())
    if args.phase == "compile":
        if not args.provenance_receipt:
            raise RuntimeError("Passing phase 1 provenance receipt required before compile")
        prior_path = Path(args.provenance_receipt)
        evidence_root = NAMESPACE / "evidence"
        if not prior_path.is_absolute() or not prior_path.is_relative_to(evidence_root):
            raise RuntimeError("Prior receipt must be under dedicated evidence namespace")
        prior_file = checked_file(evidence_root, prior_path.relative_to(evidence_root).as_posix())
        prior = json.loads(prior_file.read_text())
        if (prior.get("status") != "PASS" or prior.get("phase") != "provenance"
            or prior.get("image") != IMAGE
            or prior.get("sourceManifestSha256") != SOURCE_MANIFEST_SHA256
            or prior.get("contextManifestSha256") != CONTEXT_MANIFEST_SHA256
            or prior.get("compilePerformed") is not False
            or prior.get("cleanup", {}).get("removed") is not True):
            raise RuntimeError("Prior provenance receipt does not admit this exact compile")
    fmt = '{{ index .Config.Labels "org.tadazz.package-worker.base" }}|{{ index .Config.Labels "org.tadazz.package-worker.source-manifest-sha256" }}|{{ index .Config.Labels "org.tadazz.package-worker.verifier-sha256" }}|{{ index .Config.Labels "org.tadazz.package-worker.asana" }}'
    labels = docker(["image", "inspect", "--format", fmt, IMAGE], 5)
    if labels.returncode or labels.stdout.strip() != "|".join([BASE_IMAGE, SOURCE_MANIFEST_SHA256, VERIFIER_SHA256, "1220708526935641"]):
        raise RuntimeError("Fresh image provenance labels mismatch")
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
        "/opt/tadazz-package-worker-provenance/verify-and-build.mjs",
        "/input/source.tadazz", "/output",
    ]
    if args.phase == "provenance":
        command.append("--verify-only")
    report = {
        "format": "tadazz-theme-worker-smoke-v2", "status": "FAIL",
        "phase": args.phase, "sourceManifestSha256": SOURCE_MANIFEST_SHA256,
        "contextManifestSha256": CONTEXT_MANIFEST_SHA256,
        "verifierSha256": VERIFIER_SHA256, "asanaTaskId": "1220708526935641",
        "compilePerformed": False, "cacheBindUsed": False,
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
        provenance_file = output / "provenance.json"
        if provenance_file.exists() and not provenance_file.is_symlink() and provenance_file.stat().st_size < 1_000_000:
            report["provenance"] = json.loads(provenance_file.read_text())
        if completed.returncode != 0:
            raise RuntimeError("Fresh worker provenance/compile exited nonzero; see provenance and logs")
        names = sorted(p.name for p in output.iterdir())
        expected_outputs = ["provenance.json"] if args.phase == "provenance" else ["bundle.json", "provenance.json", "result.json"]
        if names != expected_outputs:
            raise RuntimeError("Unexpected worker output inventory")
        for file in output.iterdir():
            if file.is_symlink() or not file.is_file() or file.stat().st_size > 8_000_000:
                raise RuntimeError("Unsafe worker output")
        provenance = report.get("provenance", {})
        if (provenance.get("status") != "PASS"
            or provenance.get("sourceManifestSha256") != SOURCE_MANIFEST_SHA256
            or provenance.get("verifierSha256") != VERIFIER_SHA256
            or provenance.get("baseImage") != BASE_IMAGE
            or provenance.get("uid") != 65534 or provenance.get("platform") != "linux"
            or provenance.get("failures") != []
            or provenance.get("compileAdmitted") is not (args.phase == "compile")):
            raise RuntimeError("Fresh in-image provenance was not verified")
        if set(provenance.get("files", {})) != set(source_pins["files"]):
            raise RuntimeError("Incomplete in-image code inventory")
        for relative, pin in source_pins["files"].items():
            if provenance["files"][relative] != pin:
                raise RuntimeError("In-image source mismatch: " + relative)
        expected_packages = sorted((p["origin"], p["spec"], p["resolution"], p["name"], p["version"]) for p in source_pins["packages"])
        actual_packages = sorted((p["origin"], p["spec"], p["resolution"], p["name"], p["version"]) for p in provenance["packages"])
        if actual_packages != expected_packages:
            raise RuntimeError("In-image dependency metadata mismatch")
        for tool_name, expected in source_pins["executableVersions"].items():
            if provenance["executables"].get(tool_name, {}).get("version") != expected:
                raise RuntimeError("Actual executable version mismatch: " + tool_name)
        report["provenanceVerified"] = True
        if args.phase == "compile":
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
                raise RuntimeError("Media/result protocol mismatch")
            if not isinstance(bundle, dict) or sorted(bundle) != expected_themes:
                raise RuntimeError("Compiled theme inventory mismatch")
            for theme in bundle.values():
                if not isinstance(theme, dict) or not isinstance(theme.get("js"), str) or not theme["js"]:
                    raise RuntimeError("Missing compiled JavaScript")
                if not isinstance(theme.get("css"), str) or not isinstance(theme.get("assets"), dict):
                    raise RuntimeError("Invalid compiler bundle shape")
            report.update({"compilePerformed": True, "mediaValidated": True,
                           "compiledThemeIds": expected_themes,
                           "outputDigest": result["outputDigest"], "bundleBytes": len(bundle_bytes)})
        if digest(staged) != manifest["archiveSha256"] or digest(archive) != manifest["archiveSha256"]:
            raise RuntimeError("Read-only source changed")
        report.update({"status": "PASS", "sourceUnchanged": True})
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
