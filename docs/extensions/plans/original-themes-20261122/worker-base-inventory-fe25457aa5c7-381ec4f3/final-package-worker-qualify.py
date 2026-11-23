"""HELD: qualify a fresh same-candidate worker and compiled runtime on Oracle.

This script performs no activation. Invoke only with the coordinator's final
candidate/source/native-build pins and an explicit Oracle resource window.
The Docker context is streamed from the immutable source; no source tree copy
or customer/previous-job input is created or consumed.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import threading
import time
import traceback
import uuid

BASE_IMAGE = "sha256:4ef04ef752c23e5360399880f1bcf4c79c0f48900c9597bcaa68da8aa01d1411"
BROKER = "scripts/qa/package-build-worker.py"
SDK = "extensions/src/presentation/package-runtime/sdk.tsx"
RUNTIME_BUILD = "extensions/deployment/package-runtime/build-runtime.cjs"
REQUIRED_INPUTS = {
    BROKER, SDK, RUNTIME_BUILD, "extensions/qa/package-builder.ts",
    "extensions/qa/package-media-probe.ts", "extensions/src/testkit/package-fixtures.ts",
    "extensions/fixtures/packages/generated-video.mp4",
    "extensions/src/server/packages/store.ts", "extensions/src/server/packages/archive.ts",
    "extensions/src/server/packages/references.ts", "extensions/src/server/packages/preflight.ts",
}
BASE_INVENTORY_JS = r"""
const fs = require('node:fs'), crypto = require('node:crypto');
const manifest = JSON.parse(fs.readFileSync('/input/source-manifest.json', 'utf8'));
const files = {};
for (const name of Object.keys(manifest.files).sort()) {
  const path = '/cleanup/' + name;
  let info;
  try { info = fs.lstatSync(path); }
  catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) { files[name] = null; continue; } throw error; }
  if (!info.isFile() || info.isSymbolicLink()) { files[name] = null; continue; }
  const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024), fd = fs.openSync(path, 'r');
  try { for (;;) { const size = fs.readSync(fd, buffer, 0, buffer.length, null); if (!size) break; hash.update(buffer.subarray(0, size)); } }
  finally { fs.closeSync(fd); }
  files[name] = {sha256: hash.digest('hex'), bytes: info.size};
}
console.log(JSON.stringify({format:'tadazz-worker-base-source-inventory-v1',files}));
"""


def sha(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def canonical(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def write(path, value):
    raw = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
    with Path(path).open("xb") as stream:
        stream.write(raw)
    return hashlib.sha256(raw).hexdigest()


def plain(path, directory=False):
    path = Path(path)
    assert path.is_absolute() and path == Path(os.path.normpath(path))
    for parent in [*reversed(path.parents), path]:
        info = parent.lstat()
        assert not stat.S_ISLNK(info.st_mode), str(parent)
        assert stat.S_ISDIR(info.st_mode) if parent != path or directory else stat.S_ISREG(info.st_mode), str(parent)
    return path


def relative(name):
    value = PurePosixPath(name)
    assert isinstance(name, str) and name and not value.is_absolute()
    assert str(value) == name and "\\" not in name and not any(part in ("", ".", "..") for part in value.parts)
    return value


def snapshot(root):
    result = {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        dirs.sort()
        files.sort()
        for name in list(dirs):
            path = Path(directory) / name
            if path.is_symlink():
                result[path.relative_to(root).as_posix()] = {"symlink": os.readlink(path)}
                dirs.remove(name)
            elif name in (".git", "node_modules"):
                dirs.remove(name)
        for name in files:
            path = Path(directory) / name
            before = path.lstat()
            key = path.relative_to(root).as_posix()
            if stat.S_ISLNK(before.st_mode):
                result[key] = {"symlink": os.readlink(path)}
                continue
            assert stat.S_ISREG(before.st_mode), key
            digest = sha(path)
            after = path.stat()
            assert (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns), key
            result[key] = {"sha256": digest, "bytes": before.st_size}
    assert result
    return result


def inspect(kind, identity):
    return json.loads(subprocess.check_output(["docker", kind, "inspect", identity], timeout=25))[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--source-run", required=True)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--source-tree-sha256", required=True)
    parser.add_argument("--input-manifest", required=True, type=Path)
    parser.add_argument("--input-manifest-sha256", required=True)
    parser.add_argument("--native-build-receipt", required=True, type=Path)
    parser.add_argument("--native-build-receipt-sha256", required=True)
    parser.add_argument("--driver", required=True, type=Path)
    parser.add_argument("--driver-sha256", required=True)
    parser.add_argument("--runtime-directory", type=Path)
    args = parser.parse_args()
    assert sys.platform == "linux" and os.geteuid() == 0, "Oracle Linux root required"
    os.umask(0o077)
    revision = args.candidate_sha
    assert re.fullmatch(r"[a-f0-9]{40}", revision)
    assert re.fullmatch("tadazz-codex-" + revision[:12] + r"-[a-f0-9]{8}", args.source_run)
    for pin in (args.source_tree_sha256, args.input_manifest_sha256, args.native_build_receipt_sha256, args.driver_sha256):
        assert re.fullmatch(r"[a-f0-9]{64}", pin)
    source = plain(args.source_root, directory=True)
    assert source == Path("/home/ubuntu/tadazz-phase2-20261116/evidence") / args.source_run / "source"
    for path, pin in ((args.input_manifest, args.input_manifest_sha256), (args.native_build_receipt, args.native_build_receipt_sha256), (args.driver, args.driver_sha256)):
        assert sha(plain(path)) == pin, str(path)
    assert args.driver.name == "final-package-worker-driver.mts"
    inputs = json.loads(args.input_manifest.read_bytes())
    build = json.loads(args.native_build_receipt.read_bytes())
    assert inputs["sha"] == build["sha"] == revision
    assert build["run"] == args.source_run and build["suite"] == "native-launch"
    assert build["allHashesVerifiedBeforeAfter"] is True
    assert build["hashesBefore"] == build["hashesAfter"] == inputs["files"]
    assert build["checks"] and all(item["exit"] == 0 for item in build["checks"])
    assert {"native-site-build", "native-application-preview-build", "native-widget-build", "native-launch-build"} <= {item["label"] for item in build["checks"]}
    files = inputs["files"]
    assert isinstance(files, dict) and 0 < len(files) < 20000 and REQUIRED_INPUTS <= files.keys()
    total_source_bytes = 0
    for name, pin in files.items():
        relative(name)
        assert re.fullmatch(r"[a-f0-9]{64}", pin)
        file = plain(source / name)
        assert sha(file) == pin, name
        total_source_bytes += file.stat().st_size
    assert total_source_bytes <= 1024**3
    before = snapshot(source)
    assert canonical(before) == args.source_tree_sha256
    available = next(int(line.split()[1]) * 1024 for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemAvailable:"))
    assert available >= 3 * 1024**3, "Need3GiB for the sequential1CPU2GiB qualification"
    assert shutil.disk_usage("/var/lib/docker").free >= max(2 * 1024**3, total_source_bytes * 4), "Insufficient bounded Docker build headroom"
    assert inspect("image", BASE_IMAGE)["Id"] == BASE_IMAGE

    root = Path("/home/ubuntu") / ("tadazz-package-worker-" + revision[:12] + "-" + uuid.uuid4().hex[:8])
    root.mkdir(mode=0o700, exist_ok=False)
    logs = root / "evidence"
    logs.mkdir(mode=0o700)
    proof_root = root / "proof"
    proof_root.mkdir(mode=0o700)
    temporary = root / "worker-tmp"
    temporary.mkdir(mode=0o700)
    driver = root / "final-package-worker-driver.mts"
    shutil.copyfile(args.driver, driver)
    assert sha(driver) == args.driver_sha256
    broker = root / "source" / BROKER
    broker.parent.mkdir(parents=True, mode=0o700)
    shutil.copyfile(source / BROKER, broker)
    assert sha(broker) == files[BROKER]
    manifest = {"revision": revision, "appRevision": revision, "sourceRun": args.source_run,
                "inputManifestSha256": args.input_manifest_sha256, "baseImage": BASE_IMAGE, "files": files}
    manifest_file = root / "source-manifest.json"
    manifest_pin = write(manifest_file, manifest)
    write(proof_root / "qualification-plan.json", {"revision": revision, "sourceRun": args.source_run,
          "sourceManifestSha256": manifest_pin, "driverSha256": args.driver_sha256})
    if args.runtime_directory:
        runtime = args.runtime_directory
        assert runtime.name == "runtime"
        assert re.fullmatch(r"/home/ubuntu/tadazz-operator-" + revision[:12] + r"-[a-f0-9]{8}", str(runtime.parent))
        plain(runtime.parent, directory=True)
    else:
        runtime = root / "compiled-runtime"
    runtime.mkdir(mode=0o700, exist_ok=False)
    report = {"format": "tadazz-same-candidate-worker-qualification-v1", "ok": False,
              "revision": revision, "sourceRun": args.source_run, "qualifiedRoot": str(root),
              "baseImage": BASE_IMAGE, "sourceManifestSha256": manifest_pin, "workerSha256": files[BROKER],
              "driverSha256": args.driver_sha256, "inputManifestSha256": args.input_manifest_sha256,
              "nativeBuildReceiptSha256": args.native_build_receipt_sha256, "sourceTreeBeforeSha256": canonical(before),
              "productionChanged": False, "customerStorageAccessed": False, "activationPerformed": False,
              "oldPayloadOrJobRead": False, "sourceReadOnly": True, "network": "none",
              "contextStreamed": True, "fullCandidateSourceBytes": total_source_bytes,
              "contextStrategy": "verified-delta-from-pinned-base",
              "fullContextCopyCreated": False, "runtimeDirectory": str(runtime)}
    created = []
    no_oom = True
    started = time.time()
    image = None

    def run_container(label, command, mounts, budget, environment=None, selected_image=None):
        nonlocal no_oom
        selected_image = selected_image or image
        assert selected_image and re.fullmatch(r"sha256:[a-f0-9]{64}", selected_image)
        name = root.name + "-" + label
        argv = ["docker", "run", "--name", name, "--pull=never", "--init", "--read-only", "--network", "none", "--user", "0:0",
                "--cpus", "1", "--memory", "2g", "--memory-swap", "2g", "--pids-limit", "256", "--shm-size", "128m",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                "--tmpfs", "/tmp:rw,nosuid,nodev,size=536870912", "--label", "com.tadazz.worker-qualification=" + root.name,
                "--workdir", "/cleanup"]
        for origin, target, readonly in mounts:
            argv += ["--mount", "type=bind,source=" + str(origin) + ",target=" + target + (",readonly" if readonly else "")]
        env = {"TMPDIR": "/tmp", "XDG_DATA_HOME": "/tmp/data", "XDG_CACHE_HOME": "/tmp/cache",
               "TSX_DISABLE_CACHE": "1", "TSX_TSCONFIG_PATH": "/cleanup/tsconfig.json", "NODE_OPTIONS": "--max-old-space-size=1400"}
        env.update(environment or {})
        for key, value in env.items():
            argv += ["-e", key + "=" + value]
        argv += ["--entrypoint", command[0], selected_image, *command[1:]]
        write(logs / (label + "-plan.json"), {"command": argv, "deadlineSeconds": budget})
        created.append(name)
        with (logs / (label + ".stdout.log")).open("wb") as out, (logs / (label + ".stderr.log")).open("wb") as err:
            result = subprocess.run(argv, stdout=out, stderr=err, timeout=budget)
        actual = inspect("container", name)
        assert actual["Image"] == selected_image
        assert actual["Config"]["Labels"]["com.tadazz.worker-qualification"] == root.name
        assert actual["State"]["Running"] is False
        no_oom = no_oom and actual["State"].get("OOMKilled") is False
        assert actual["HostConfig"]["NetworkMode"] == "none" and actual["HostConfig"]["ReadonlyRootfs"] is True
        assert actual["HostConfig"]["NanoCpus"] == 1_000_000_000 and actual["HostConfig"]["Memory"] == 2 * 1024**3
        assert {(item["Source"], item["Destination"], item["RW"]) for item in actual["Mounts"] if item["Type"] == "bind"} == {(str(origin), target, not readonly) for origin, target, readonly in mounts}
        assert result.returncode == 0, label + " failed"
        return result.returncode

    def run_driver(mode, budget=180):
        return run_container("driver-" + mode, ["node", "--import", "/cleanup/extensions/node_modules/tsx/dist/loader.mjs", "/driver.mts", mode],
                             [(driver, "/driver.mts", True), (proof_root, "/proof", False)], budget,
                             {"TADAZZ_BUILD_SANDBOX": "1"})

    def run_broker(store, label):
        environment = dict(os.environ, TMPDIR=str(temporary), PYTHONDONTWRITEBYTECODE="1")
        with (logs / (label + ".stdout.log")).open("wb") as out, (logs / (label + ".stderr.log")).open("wb") as err:
            result = subprocess.run([sys.executable, "-B", str(broker), str(store), "--image", image], env=environment,
                                    stdout=out, stderr=err, timeout=100)
        assert result.returncode == 0, label + " broker failed"
        return result.returncode

    try:
        run_container("base-inputs", ["node", "-e", BASE_INVENTORY_JS],
                      [(manifest_file, "/input/source-manifest.json", True)], 120, selected_image=BASE_IMAGE)
        base_inventory = json.loads((logs / "base-inputs.stdout.log").read_text())
        assert base_inventory["format"] == "tadazz-worker-base-source-inventory-v1"
        base_files = base_inventory["files"]
        assert set(base_files) == set(files)
        for item in base_files.values():
            assert item is None or (set(item) == {"sha256", "bytes"} and re.fullmatch(r"[a-f0-9]{64}", item["sha256"]) and type(item["bytes"]) is int and item["bytes"] >= 0)
        matching = {name for name, pin in files.items() if base_files[name] is not None and base_files[name]["sha256"] == pin and base_files[name]["bytes"] == before[name]["bytes"]}
        delta = {name: pin for name, pin in files.items() if name not in matching}
        delta_files = {name: {"sha256": pin, "bytes": before[name]["bytes"]} for name, pin in delta.items()}
        delta_bytes = sum(item["bytes"] for item in delta_files.values())
        delta_manifest = {"format": "tadazz-worker-verified-delta-context-v1", "revision": revision,
                          "baseImage": BASE_IMAGE, "sourceManifestSha256": manifest_pin,
                          "baseInventorySha256": sha(logs / "base-inputs.stdout.log"),
                          "baseMatchingFileCount": len(matching), "candidateFileCount": len(files),
                          "deltaFileCount": len(delta), "deltaBytes": delta_bytes, "files": delta_files}
        delta_pin = write(root / "delta-manifest.json", delta_manifest)
        report.update(baseMatchingFileCount=len(matching), candidateFileCount=len(files),
                      baseInventorySha256=delta_manifest["baseInventorySha256"], deltaFileCount=len(delta),
                      deltaManifestSha256=delta_pin, deltaSourceSha256=canonical(delta_files), contextSourceBytes=delta_bytes)
        dockerfile = ("FROM " + BASE_IMAGE + ("\nCOPY source/ /cleanup/\n" if delta else "\n")).encode()
        (root / "worker.Dockerfile").write_bytes(dockerfile)
        tag = "tadazz-package-worker:" + root.name.removeprefix("tadazz-package-worker-")
        labels = {"org.opencontainers.image.revision": revision,
                  "com.tadazz.package-worker.source-manifest-sha256": manifest_pin,
                  "com.tadazz.package-worker.sdk-sha256": files[SDK]}
        command = ["docker", "build", "--pull=false", "--network", "none", "--file", "worker.Dockerfile", "--tag", tag]
        for key, value in labels.items():
            command += ["--label", key + "=" + value]
        command += ["-"]
        write(logs / "image-build-plan.json", {"command": command, "candidateFiles": len(files), "contextSourceFiles": len(delta),
              "baseMatchingFiles": len(matching), "contextSourceBytes": delta_bytes, "deltaManifestSha256": delta_pin,
              "contextPersisted": False, "dockerfileSha256": hashlib.sha256(dockerfile).hexdigest()})
        with (logs / "image-build.stdout.log").open("wb") as out, (logs / "image-build.stderr.log").open("wb") as err:
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=out, stderr=err)
            def terminate_build():
                try:
                    if process.poll() is None:
                        process.kill()
                except ProcessLookupError:
                    pass
            deadline = threading.Timer(360, terminate_build)
            deadline.daemon = True
            deadline.start()
            try:
                with tarfile.open(fileobj=process.stdin, mode="w|") as archive:
                    header = tarfile.TarInfo("worker.Dockerfile")
                    header.size, header.mode = len(dockerfile), 0o644
                    archive.addfile(header, io.BytesIO(dockerfile))
                    for relative_name, expected in sorted(delta.items()):
                        file = plain(source / relative_name)
                        assert sha(file) == expected, relative_name
                        header = archive.gettarinfo(str(file), arcname="source/" + relative_name)
                        assert header.isfile()
                        with file.open("rb") as stream:
                            archive.addfile(header, stream)
                process.stdin.close()
                code = process.wait(timeout=300)
                assert code == 0, "Docker image build failed"
            finally:
                deadline.cancel()
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=15)
        actual_image = inspect("image", tag)
        image = actual_image["Id"]
        assert re.fullmatch(r"sha256:[a-f0-9]{64}", image)
        assert all(actual_image["Config"].get("Labels", {}).get(key) == value for key, value in labels.items())
        report.update(image=image, imageLabels=labels)
        hash_script = "const f=require('node:fs'),c=require('node:crypto'),m=JSON.parse(f.readFileSync('/input/source-manifest.json','utf8'));for(const[p,h]of Object.entries(m.files)){if(c.createHash('sha256').update(f.readFileSync('/cleanup/'+p)).digest('hex')!==h)throw Error('IMAGE_SOURCE:'+p)}console.log(JSON.stringify({verifiedFiles:Object.keys(m.files).length,revision:m.revision}))"
        run_container("image-inputs", ["node", "-e", hash_script], [(manifest_file, "/input/source-manifest.json", True)], 90)
        image_inputs = json.loads((logs / "image-inputs.stdout.log").read_text())
        assert image_inputs == {"verifiedFiles": len(files), "revision": revision}
        report["imageSourceHashesVerified"] = True

        run_driver("prepare")
        prepare = json.loads((proof_root / "prepare.json").read_text())
        assert prepare["questionCount"] == 10 and prepare["cooldownSeconds"] == [2] and prepare["gameCount"] == 1
        report["fixture"] = prepare
        report["workerExit"] = run_broker(proof_root / "synthetic-store", "positive-worker")
        jobs = list((proof_root / "synthetic-store").glob("*/jobs/*/result.json"))
        assert len(jobs) == 1
        worker_result = json.loads(jobs[0].read_text())
        assert worker_result.get("mediaValidated") is True and not worker_result.get("error")
        assert worker_result["sourceDigest"] == prepare["inputSourceDigest"]
        assert sha(jobs[0].parent / "bundle.json") == worker_result["outputDigest"]
        report["workerResult"] = worker_result
        report["nativeAcceptExit"] = run_driver("accept")
        accepted = json.loads((proof_root / "native-accept.json").read_text())
        assert accepted["phaseBeforeInstall"] == "preview-ready" and accepted["phaseAfterInstall"] == "installed"
        assert accepted["nativeGames"] == 1 and accepted["questionCount"] == 10
        assert accepted["preservedCooldownSeconds"] == accepted["reexportPreservedCooldownSeconds"] == [2]
        assert all(accepted[key] is True for key in ("privateMediaDecoded", "reexportMediaDecoded", "mediaValidated", "customRuntimeCompiled", "customThemeSelectionPreserved"))
        report.update(nativeAccept=accepted, mediaValidated=True)

        run_driver("negative")
        rejected = json.loads((proof_root / "negative-native.json").read_text())
        assert rejected["nativePreflightRejected"] is True and rejected["rejectedCooldownSeconds"] == 1
        negative_store = root / "negative-store"
        negative_id = str(uuid.uuid4())
        negative_job = negative_store / "synthetic-only" / "jobs" / negative_id
        negative_job.mkdir(parents=True, mode=0o700)
        request = json.loads((jobs[0].parent / "request.json").read_text())
        request.update(uploadId=negative_id, sourceDigest=rejected["sourceDigest"])
        write(negative_job / "request.json", request)
        shutil.copyfile(proof_root / "minimum-one-rejected.tadazz", negative_job / "source.tadazz")
        assert sha(negative_job / "source.tadazz") == rejected["sourceDigest"]
        run_broker(negative_store, "negative-worker")
        negative_result = json.loads((negative_job / "result.json").read_text())
        assert negative_result.get("error") == "BUILD_REJECTED"
        assert not (negative_job / "bundle.json").exists()
        assert "cooldownSeconds" in (logs / "negative-worker.stdout.log").read_text(), "Worker must reject the actual below-minimum field"
        report["belowMinimum"] = {"nativePreflightRejected": True, "workerRejected": True, "bundleProduced": False}

        run_container("compiled-runtime", ["node", "/cleanup/" + RUNTIME_BUILD],
                      [(manifest_file, "/input/source-manifest.json", True), (runtime, "/output", False)], 240)
        assert {path.name for path in runtime.iterdir()} == {"runtime.mjs", "runtime-source-manifest.json"}
        runtime_manifest = json.loads((runtime / "runtime-source-manifest.json").read_text())
        assert runtime_manifest["sourceRevision"] == runtime_manifest["workerSourceRevision"] == revision
        assert runtime_manifest["compiler"] == "esbuild@0.28.2" and runtime_manifest["sourceInputs"]
        assert all(files.get(name) == digest for name, digest in runtime_manifest["sourceInputs"].items())
        assert runtime_manifest["runtimeSha256"] == sha(runtime / "runtime.mjs")
        report.update(runtimeManifestSha256=sha(runtime / "runtime-source-manifest.json"),
                      runtimeSha256=runtime_manifest["runtimeSha256"], compiledRuntimeSourceInputs=len(runtime_manifest["sourceInputs"]))
        report["ok"] = True
    except Exception:
        report["failure"] = traceback.format_exc()
        report["ok"] = False
    finally:
        try:
            for name in created:
                actual = inspect("container", name)
                assert actual["Config"]["Labels"]["com.tadazz.worker-qualification"] == root.name
                no_oom = no_oom and actual["State"].get("OOMKilled") is False
                if actual["State"]["Running"]:
                    subprocess.run(["docker", "stop", "--time", "10", name], check=True, stdout=subprocess.DEVNULL, timeout=25)
                assert inspect("container", name)["State"]["Running"] is False
            # The broker's generated name alone is never an ownership test.
            worker_ids = subprocess.check_output(["docker", "ps", "-aq", "--filter", "name=tadazz-package-build-"], text=True, timeout=20).split()
            cleanup_count = 0
            for identifier in worker_ids:
                actual = inspect("container", identifier)
                origins = [Path(item["Source"]) for item in actual.get("Mounts", []) if item.get("Type") == "bind"]
                if origins and all(origin.is_relative_to(temporary) for origin in origins):
                    subprocess.run(["docker", "rm", "-f", identifier], check=True, stdout=subprocess.DEVNULL, timeout=25)
                    cleanup_count += 1
            after = snapshot(source)
            report.update(sourceTreeAfterSha256=canonical(after), sourceHashesVerifiedBeforeAfter=after == before,
                          containersStopped=True, noOom=no_oom, ownedBrokerCleanupCount=cleanup_count,
                          retainedContainers=created)
            assert all(report[key] is True for key in ("sourceHashesVerifiedBeforeAfter", "containersStopped", "noOom"))
            assert sha(manifest_file) == manifest_pin and sha(broker) == files[BROKER] and sha(driver) == args.driver_sha256
            assert sha(args.input_manifest) == args.input_manifest_sha256 and sha(args.native_build_receipt) == args.native_build_receipt_sha256
            if image:
                assert all(inspect("image", image)["Config"].get("Labels", {}).get(key) == value for key, value in report["imageLabels"].items())
        except Exception:
            report["cleanupFailure"] = traceback.format_exc()
            report["ok"] = False
        report["seconds"] = round(time.time() - started, 2)
        proof = root / "matching-worker-proof.json"
        qualification_pin = write(proof, report)
        print(json.dumps({"ok": report["ok"], "qualifiedRoot": str(root), "image": image,
                          "revision": revision, "sourceManifestSha256": manifest_pin,
                          "qualificationSha256": qualification_pin, "workerSha256": files[BROKER],
                          "runtimeDirectory": str(runtime), "runtimeManifestSha256": report.get("runtimeManifestSha256"),
                          "runtimeSha256": report.get("runtimeSha256"), "containersStopped": report.get("containersStopped"),
                          "noOom": report.get("noOom"), "sourceHashesVerifiedBeforeAfter": report.get("sourceHashesVerifiedBeforeAfter"),
                          "productionChanged": False, "activationPerformed": False, "seconds": report["seconds"]}), flush=True)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
