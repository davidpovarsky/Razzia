"""HELD metadata-only Oracle comparison with the pinned package-worker base.

This performs file hashes only: no Docker build, app, browser, decoder, package
job, native install, runtime compilation, or activation. It is not qualification.
Invoke only after the coordinator explicitly authorizes this read-only container.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import traceback
import uuid

sys.dont_write_bytecode = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--source-run", required=True)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--input-manifest", required=True, type=Path)
    parser.add_argument("--input-manifest-sha256", required=True)
    parser.add_argument("--qualifier-source-sha256", required=True)
    args = parser.parse_args()
    assert sys.platform == "linux" and os.geteuid() == 0
    os.umask(0o077)
    revision = args.candidate_sha
    assert re.fullmatch(r"[a-f0-9]{40}", revision)
    assert re.fullmatch("tadazz-codex-" + revision[:12] + r"-[a-f0-9]{8}", args.source_run)
    for pin in (args.input_manifest_sha256, args.qualifier_source_sha256):
        assert re.fullmatch(r"[a-f0-9]{64}", pin)
    qualifier_path = Path(__file__).resolve().with_name("final-package-worker-qualify.py")
    assert qualifier_path.is_file() and not qualifier_path.is_symlink()
    assert hashlib.sha256(qualifier_path.read_bytes()).hexdigest() == args.qualifier_source_sha256
    spec = importlib.util.spec_from_file_location("reviewed_worker_qualifier", qualifier_path)
    qualifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(qualifier)  # Definitions/constants only; main() is guarded.
    source = qualifier.plain(args.source_root, directory=True)
    assert source == Path("/home/ubuntu/tadazz-phase2-20261116/evidence") / args.source_run / "source"
    assert qualifier.sha(qualifier.plain(args.input_manifest)) == args.input_manifest_sha256
    inputs = json.loads(args.input_manifest.read_bytes())
    assert inputs["sha"] == revision
    files = inputs["files"]
    assert isinstance(files, dict) and 0 < len(files) < 20000
    candidate = {}
    for name, pin in files.items():
        qualifier.relative(name)
        assert re.fullmatch(r"[a-f0-9]{64}", pin)
        file = qualifier.plain(source / name)
        assert qualifier.sha(file) == pin, name
        candidate[name] = {"sha256": pin, "bytes": file.stat().st_size}
    assert qualifier.inspect("image", qualifier.BASE_IMAGE)["Id"] == qualifier.BASE_IMAGE
    available = next(int(line.split()[1]) * 1024 for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemAvailable:"))
    assert available >= 1024**3, "Need1GiB for the explicitly authorized768MiB metadata reader"
    run = "worker-base-inventory-" + revision[:12] + "-" + uuid.uuid4().hex[:8]
    root = Path("/home/ubuntu") / ("tadazz-" + run)
    root.mkdir(mode=0o700, exist_ok=False)
    request = root / "requested-source-files.json"
    request_pin = qualifier.write(request, {"files": files})
    name = "tadazz-" + run
    report = {"format": "tadazz-worker-base-metadata-only-v1", "run": run, "candidateSha": revision,
              "sourceRun": args.source_run, "baseImage": qualifier.BASE_IMAGE,
              "inputManifestSha256": args.input_manifest_sha256, "qualifierSourceSha256": args.qualifier_source_sha256,
              "requestedFilesSha256": request_pin, "candidateFileCount": len(files),
              "candidateSourceBytes": sum(item["bytes"] for item in candidate.values()),
              "passed": False, "diagnosticOnly": True, "releaseQualified": False,
              "qualificationPerformed": False, "dockerBuildPerformed": False,
              "applicationExecuted": False, "sourceBytesCopied": 0,
              "productionChanged": False, "customerStorageAccessed": False,
              "network": "none", "sourceReadOnly": True}
    command = ["docker", "run", "--name", name, "--pull=never", "--init", "--read-only", "--network", "none",
               "--user", "0:0", "--cpus", "1", "--memory", "768m", "--memory-swap", "768m", "--pids-limit", "32",
               "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--shm-size", "16m",
               "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16777216", "--label", "com.tadazz.qa=" + run,
               "--mount", "type=bind,source=" + str(request) + ",target=/input/source-manifest.json,readonly",
               "-e", "NODE_OPTIONS=--max-old-space-size=128", "--entrypoint", "node", qualifier.BASE_IMAGE,
               "-e", qualifier.BASE_INVENTORY_JS]
    qualifier.write(root / "execution-plan.json", {"command": command, "metadataOnly": True, "deadlineSeconds": 120})
    started = time.time()
    try:
        with (root / "base-inventory.json").open("wb") as out, (root / "base-inventory.stderr.log").open("wb") as err:
            result = subprocess.run(command, stdout=out, stderr=err, timeout=120)
        report["exit"] = result.returncode
        assert result.returncode == 0
        actual = qualifier.inspect("container", name)
        assert actual["Image"] == qualifier.BASE_IMAGE
        assert actual["Config"]["Labels"]["com.tadazz.qa"] == run
        assert actual["HostConfig"]["NetworkMode"] == "none" and actual["HostConfig"]["ReadonlyRootfs"] is True
        assert actual["HostConfig"]["NanoCpus"] == 1_000_000_000 and actual["HostConfig"]["Memory"] == 768 * 1024**2
        mounts = [item for item in actual["Mounts"] if item["Type"] == "bind"]
        assert len(mounts) == 1 and mounts[0]["Source"] == str(request) and mounts[0]["Destination"] == "/input/source-manifest.json" and mounts[0]["RW"] is False
        inventory = json.loads((root / "base-inventory.json").read_bytes())
        assert inventory["format"] == "tadazz-worker-base-source-inventory-v1" and set(inventory["files"]) == set(files)
        for item in inventory["files"].values():
            assert item is None or (set(item) == {"sha256", "bytes"} and re.fullmatch(r"[a-f0-9]{64}", item["sha256"]) and type(item["bytes"]) is int and item["bytes"] >= 0)
        matching = {key for key in candidate if inventory["files"][key] == candidate[key]}
        delta = {key: value for key, value in candidate.items() if key not in matching}
        delta_pin = qualifier.write(root / "delta-estimate.json", {"candidateSha": revision, "baseImage": qualifier.BASE_IMAGE,
                                   "inputManifestSha256": args.input_manifest_sha256, "files": delta})
        report.update(baseMatchingFileCount=len(matching), deltaFileCount=len(delta),
                      deltaBytes=sum(item["bytes"] for item in delta.values()), deltaSourceSha256=qualifier.canonical(delta),
                      deltaManifestSha256=delta_pin, baseInventorySha256=qualifier.sha(root / "base-inventory.json"),
                      readOnlyMountsVerified=True, passed=True)
    except Exception:
        report["failure"] = traceback.format_exc()
        report["passed"] = False
    finally:
        try:
            actual = qualifier.inspect("container", name)
            assert actual["Config"]["Labels"]["com.tadazz.qa"] == run
            if actual["State"]["Running"]:
                subprocess.run(["docker", "stop", "--time", "10", name], check=True, stdout=subprocess.DEVNULL, timeout=25)
            stopped = qualifier.inspect("container", name)
            report.update(containerStopped=stopped["State"]["Running"] is False,
                          noOom=actual["State"].get("OOMKilled") is False and stopped["State"].get("OOMKilled") is False)
            assert report["containerStopped"] is True and report["noOom"] is True
            assert qualifier.sha(request) == request_pin
            assert qualifier.sha(args.input_manifest) == args.input_manifest_sha256
            assert all(qualifier.sha(source / key) == value["sha256"] and (source / key).stat().st_size == value["bytes"] for key, value in candidate.items())
            report["candidateSourceHashesVerifiedBeforeAfter"] = True
        except Exception:
            report["cleanupFailure"] = traceback.format_exc()
            report["passed"] = False
        report["seconds"] = round(time.time() - started, 2)
        receipt = root / "receipt.json"
        report_pin = qualifier.write(receipt, report)
        print(json.dumps({key: report.get(key) for key in ("run", "passed", "candidateSha", "candidateFileCount",
              "candidateSourceBytes", "baseMatchingFileCount", "deltaFileCount", "deltaBytes", "deltaSourceSha256",
              "deltaManifestSha256", "baseInventorySha256", "containerStopped", "noOom",
              "candidateSourceHashesVerifiedBeforeAfter", "dockerBuildPerformed", "applicationExecuted", "qualificationPerformed")}
              | {"receipt": str(receipt), "receiptSha256": report_pin}), flush=True)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
