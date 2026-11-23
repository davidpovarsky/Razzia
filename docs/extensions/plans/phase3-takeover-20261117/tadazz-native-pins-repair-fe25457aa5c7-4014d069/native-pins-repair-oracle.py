"""Guarded, preparation-only native pin repair; invoked remotely by its driver.

Capture streams bounded failed-build evidence before any source mutation. Repair
uses the existing failed source at canonical depth, retaining all release gates.
"""
from pathlib import Path, PurePosixPath
import base64
import hashlib
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import traceback

CONFIG = None
PARENT = Path("/home/ubuntu/tadazz-phase2-20261116/evidence")
RUN = "tadazz-codex-fe25457aa5c7-53880a3e"
REVISION = "fe25457aa5c79e7ac24c36ef55ff2235d97dd9d4"
INPUT_PIN = "bb651d7dec9b0e4afb34afa1fd29cbaac5cc6f7b5d0af4d3e62bfd823ebd8ba1"
IMAGE = "sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647"
SOURCE = PARENT / RUN / "source"
INTERNAL = "/evidence/" + RUN + "/source"
SDK = PARENT / "tadazz-codex-browser-c4125d58a746-8e0c29d3/mcp-deps"
BUILDER = "extensions/qa/build-application-preview.mjs"
FIXTURE = "extensions/qa/phase3-full-show/native-parity-fixtures.ts"
MANIFEST = "extensions/src/core/show-library/application-preview-build.json"
DIST = "extensions/dist/application-preview/"
WIDGET = "extensions/src/mcp-app/widget/dist/"
GENERATED = [DIST, WIDGET, "packages/web/dist/"]
OLD = {
    BUILDER: "634e463b09dc0b51993e27b0455dd2baeb1cabeed94ee17bde28beb41acaa21d",
    FIXTURE: "c9965a90a0702caac5180409930daf6dd5cbfc240a75e386f3e005dfafb68470",
    MANIFEST: "c3c8c1f99a2903a7117cf9b47ee5a7bf2226afb526eb8410a40ba8666b31c410",
}
LINKS = {d + "node_modules": "/cleanup/" + d + "node_modules" for d in [
    "", "extensions/", "packages/common/", "packages/socket/", "packages/web/", "packages/e2e/",
]}
LINKS["extensions/src/mcp-app/node_modules"] = "/tmp/phase3-999ed90c/deps/node_modules"


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def canonical(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2) + "\n").encode()


def snapshot(root, exclude_dependencies=True):
    rows = {}
    for dp, directories, files in os.walk(root, followlinks=False):
        for name in list(directories):
            p = Path(dp) / name
            if p.is_symlink():
                rows[p.relative_to(root).as_posix()] = {"symlink": os.readlink(p)}
                directories.remove(name)
            elif exclude_dependencies and name in [".git", "node_modules"]:
                directories.remove(name)
        for name in files:
            p = Path(dp) / name
            key = p.relative_to(root).as_posix()
            if p.is_symlink():
                rows[key] = {"symlink": os.readlink(p)}
            else:
                info = p.lstat()
                assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1, key
                rows[key] = {"sha256": sha(p), "bytes": info.st_size}
    return rows


def inspect(name):
    return json.loads(subprocess.check_output(["docker", "inspect", name], timeout=20))[0]


def overlaps(a, b):
    return a == b or a.is_relative_to(b) or b.is_relative_to(a)


def guard_consumers():
    cache = inspect("tadazz-phase2-20261116")
    assert cache["Id"].startswith("07b64bb4f995") and cache["Image"] == IMAGE
    assert cache["State"]["Running"] is True
    assert cache["HostConfig"]["NetworkMode"] == "none" and not cache["HostConfig"].get("PortBindings")
    processes = subprocess.check_output(["docker", "top", cache["Id"], "-eo", "pid,comm,args"], text=True, timeout=20).splitlines()[1:]
    assert len(processes) == 1 and processes[0].split()[1:] == ["sleep", "sleep", "infinity"], processes
    observed = []
    for cid in subprocess.check_output(["docker", "ps", "-q", "--no-trunc"], text=True, timeout=20).split():
        mounts = json.loads(subprocess.check_output(["docker", "inspect", "--format", "{{json .Mounts}}", cid], timeout=20))
        matching = [m for m in mounts if overlaps(SOURCE, Path(m["Source"]))]
        if matching:
            assert cid == cache["Id"], "Active source consumer: " + cid
            assert all(m["Source"] == str(PARENT) and m["Destination"] == "/evidence" for m in matching)
            observed.append(cid)
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit() or int(proc.name) == os.getpid():
            continue
        try:
            descriptors = list((proc / "fd").iterdir())
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            descriptors = []
        for entry in [*descriptors, proc / "cwd", proc / "root"]:
            try:
                target = Path(os.readlink(entry).removesuffix(" (deleted)"))
            except (FileNotFoundError, PermissionError, ProcessLookupError, OSError):
                continue
            for prefix in [SOURCE, Path(INTERNAL)]:
                assert not (target == prefix or target.is_relative_to(prefix)), "Open source consumer: " + str(entry)
    return cache, {"cacheException": cache["Id"], "cacheImage": IMAGE, "cacheOnlySleep": True,
                   "cacheNetworkNone": True, "cacheNoPorts": True, "activeSourceMounts": observed,
                   "noOtherContainerOrProcessConsumer": True}


def load_before():
    assert sys.platform == "linux" and os.geteuid() == 0
    assert SOURCE.resolve() == SOURCE and SOURCE.is_dir()
    assert sha(PARENT / RUN / "input-manifest.json") == INPUT_PIN
    inputs = json.loads((PARENT / RUN / "input-manifest.json").read_bytes())
    assert inputs["sha"] == REVISION and len(inputs["files"]) == 2266
    files = inputs["files"]
    before = snapshot(SOURCE)
    for key, pin in files.items():
        part = PurePosixPath(key)
        assert not part.is_absolute() and ".." not in part.parts
        assert before.get(key, {}).get("sha256") == pin, key
    assert {key: value["symlink"] for key, value in before.items() if "symlink" in value} == LINKS
    assert not [key for key, value in before.items() if "sha256" in value and key not in files and not any(key.startswith(prefix) for prefix in GENERATED)]
    assert all(before[key]["sha256"] == pin for key, pin in OLD.items())
    return inputs, before


def capture():
    inputs, before = load_before()
    _, consumer = guard_consumers()
    selected = sorted([key for key, value in before.items() if key.startswith(DIST) and "sha256" in value] + list(OLD))
    assert 8 <= len(selected) <= 32 and sum(before[key]["bytes"] for key in selected) < 32 * 1024**2
    required = [DIST + name for name in ["artifact.json", "registry.json", "verification.json", "renderer.mjs", "renderer.css"]]
    assert all(key in selected for key in required)
    artifact = json.loads((SOURCE / DIST / "artifact.json").read_bytes())
    generated_sources = [row["path"] for row in artifact["source"] if row["path"].startswith(WIDGET)]
    assert len(generated_sources) == 3, generated_sources
    payload = {"source/" + key: (SOURCE / key).read_bytes() for key in selected}
    payload["input-manifest.json"] = (PARENT / RUN / "input-manifest.json").read_bytes()
    payload["source-before-inventory.json"] = json_bytes(before)
    receipt = {"format": "tadazz-native-pin-failed-state-capture-v1", "sourceRun": RUN,
               "sourceSha": REVISION, "inputManifestSha256": INPUT_PIN,
               "sourceTreeSha256": canonical(before), "sourceEntries": len(before),
               "files": {key: {"sha256": hashlib.sha256(value).hexdigest(), "bytes": len(value)} for key, value in payload.items()},
               "artifactGeneratedWidgetSources": generated_sources, "consumerGuard": consumer,
               "sourceUnchangedDuringCapture": True, "productionChanged": False, "releaseQualified": False}
    assert snapshot(SOURCE) == before
    guard_consumers()
    payload["capture-receipt.json"] = json_bytes(receipt)
    with tarfile.open(fileobj=sys.stdout.buffer, mode="w|gz") as archive:
        for key, value in payload.items():
            entry = tarfile.TarInfo(key)
            entry.size = len(value)
            entry.mode = 0o600
            archive.addfile(entry, io.BytesIO(value))


def repair(c):
    inputs, before = load_before()
    assert canonical(before) == c["beforeTreeSha256"] and len(before) == c["beforeEntries"]
    cache, consumer = guard_consumers()
    assert c["windowsBeforeArchiveVerified"] is True
    assert set(c["patches"]) == {BUILDER, FIXTURE}
    rootfs = Path("/var/lib/docker/rootfs/overlayfs") / cache["Id"]
    cleanup = rootfs / "cleanup"
    assert cleanup.is_dir() and SDK.is_dir() and not SDK.is_symlink()
    sdk_before = snapshot(SDK, exclude_dependencies=False)
    assert sdk_before
    available = next(int(line.split()[1]) * 1024 for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemAvailable:"))
    assert available >= 3 * 1024**3, "Need3GiB host memory before a2GiB preparation container"
    disk_before = shutil.disk_usage(PARENT).free
    # Reuses source and dependencies; only bounded logs and existing build outputs
    # are written. This preparation budget does not change stage/worker gates.
    preparation_disk_floor = 512 * 1024**2
    assert disk_before >= preparation_disk_floor, "Preserve512MiB bounded preparation headroom"
    owned = Path("/home/ubuntu") / c["repairRun"]
    assert c["repairRun"].startswith("tadazz-native-pins-repair-fe25457aa5c7-")
    owned.mkdir(mode=0o700, exist_ok=False)
    (owned / "source-before-inventory.json").write_bytes(json_bytes(before))
    old_artifact = json.loads((SOURCE / DIST / "artifact.json").read_bytes())
    old_registry_pin = sha(SOURCE / DIST / "registry.json")
    old_widget = {key: value for key, value in before.items() if key.startswith(WIDGET)}
    name = c["repairRun"]
    report = {"format": "tadazz-native-pin-repair-preparation-v1", "sourceRun": RUN,
              "sourceSha": REVISION, "run": name, "sourceRoot": str(SOURCE), "inputManifestSha256": INPUT_PIN,
              "beforeTreeSha256": canonical(before), "beforeEntries": len(before),
              "windowsBeforeArchiveSha256": c["windowsBeforeArchiveSha256"],
              "windowsCaptureReceiptSha256": c["windowsCaptureReceiptSha256"],
              "failedNativeReceiptSha256": c["failedNativeReceiptSha256"],
              "consumerGuard": consumer, "qaImage": IMAGE, "checks": [], "passed": False,
              "preparationOnly": True, "releaseQualified": False, "productionChanged": False,
              "customerStorageAccessed": False, "sourceReusedAfterFailedQualification": True}
    report["diskBudget"] = {"minimumFreeBytes": preparation_disk_floor, "beforeFreeBytes": disk_before,
                            "purpose": "bounded preparation reuses existing source and dependencies",
                            "stageAndWorkerDiskGatesChanged": False}
    started = time.monotonic()
    created = False
    creation_attempted = False
    try:
        for key, patch in c["patches"].items():
            data = base64.b64decode(patch["base64"], validate=True)
            assert hashlib.sha256(data).hexdigest() == patch["sha256"]
            assert sha(SOURCE / key) == OLD[key]
            (SOURCE / key).write_bytes(data)
        mounts = [(str(SOURCE), INTERNAL, False), (str(cleanup), "/cleanup", True),
                  (str(SDK), "/tmp/phase3-999ed90c/deps", True)]
        command = ["docker", "run", "--detach", "--pull=never", "--init", "--read-only", "--name", name,
                   "--network", "none", "--cpus", "1", "--memory", "2g", "--memory-swap", "2g", "--pids-limit", "384",
                   "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--shm-size", "256m",
                   "--tmpfs", "/tmp:rw,nosuid,nodev,size=536870912", "--label", "com.tadazz.qa=native-pins-repair"]
        for origin, target, readonly in mounts:
            command += ["--mount", "type=bind,source=" + origin + ",target=" + target + (",readonly" if readonly else "")]
        command += ["--entrypoint", "/bin/sleep", IMAGE, "infinity"]
        (owned / "execution-plan.json").write_bytes(json_bytes({"command": command, "sourceDepth": INTERNAL, "releaseQualified": False}))
        creation_attempted = True
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, timeout=30)
        created = True
        active = inspect(name)
        assert active["State"]["Running"] and active["Image"] == IMAGE
        assert active["HostConfig"]["NetworkMode"] == "none" and not active["HostConfig"].get("PortBindings")
        assert active["HostConfig"]["ReadonlyRootfs"] and active["HostConfig"]["Init"]
        assert active["HostConfig"]["NanoCpus"] == 1_000_000_000 and active["HostConfig"]["Memory"] == 2 * 1024**3
        assert {(m["Source"], m["Destination"], m["RW"]) for m in active["Mounts"] if m["Type"] == "bind"} == {(origin, target, not readonly) for origin, target, readonly in mounts}
        prefix = ["docker", "exec", "-w", INTERNAL, "-e", "TSX_DISABLE_CACHE=1", "-e", "PYTHONDONTWRITEBYTECODE=1",
                  "-e", "NODE_OPTIONS=--max-old-space-size=1024", name, "nice", "-n", "19", "taskset", "-c", "0", "timeout", "-k", "5"]

        def check(label, seconds, arguments):
            command = prefix + [str(seconds)] + arguments
            beginning = time.monotonic()
            result = subprocess.run(command, capture_output=True, timeout=seconds + 20)
            (owned / (label + ".stdout.log")).write_bytes(result.stdout)
            (owned / (label + ".stderr.log")).write_bytes(result.stderr)
            report["checks"].append({"label": label, "command": command, "exit": result.returncode,
                                     "seconds": round(time.monotonic() - beginning, 3),
                                     "stdoutSha256": hashlib.sha256(result.stdout).hexdigest(),
                                     "stderrSha256": hashlib.sha256(result.stderr).hexdigest()})
            assert result.returncode == 0, label + " failed"

        semantic_case = "extensions/qa/phase3-full-show/semantic-edit.nodecheck.ts"
        semantic_scope = ["extensions/src/mcp-app/" + path for path in [
            "contracts/semantic-edit.ts", "server/semantic-drafts.ts", "server/semantic-state.ts",
            "server/authoring.ts", "first-party/oauth-semantic-drafts.ts",
        ]] + [semantic_case, FIXTURE, "extensions/src/core/show-library/reviewed-preview-assets.ts",
              "extensions/src/core/show-library/application-preview-input.ts", "extensions/src/server/api/account-preview-builtins.ts",
              "extensions/src/server/api/account-preview-source.ts", "extensions/qa/phase3-native-consent/account-preview-builtins.nodecheck.ts"]
        check("format-repair-source", 60, ["node", "/cleanup/node_modules/prettier/bin/prettier.cjs", "--write", BUILDER, FIXTURE])
        check("semantic-types", 120, ["node", "/cleanup/node_modules/typescript/bin/tsc", "--noEmit", "-p", "extensions/qa/phase3-full-show/tsconfig.json"])
        check("semantic-lint", 120, ["node", "--experimental-strip-types", "/cleanup/node_modules/oxlint/bin/oxlint", "-c", "oxlint.config.ts", *semantic_scope])
        check("semantic-format", 60, ["node", "/cleanup/node_modules/prettier/bin/prettier.cjs", "--check", *semantic_scope, BUILDER])
        check("native-generate", 240, ["node", BUILDER])
        generated_verification = json.loads((SOURCE / DIST / "verification.json").read_bytes())
        assert generated_verification["mode"] == "generate-manifest" and generated_verification["productionChanged"] is False
        assert not generated_verification["liveAuthorityInputs"]
        (owned / "native-generate-verification.json").write_bytes(json_bytes(generated_verification))
        check("native-verify-before-widget", 240, ["node", BUILDER, "--verify-manifest"])
        verified_before = {key: sha(SOURCE / DIST / key) for key in ["artifact.json", "registry.json", "renderer.mjs", "renderer.css"]}
        verified_manifest_pin = sha(SOURCE / MANIFEST)
        (owned / "native-verify-before-widget.json").write_bytes((SOURCE / DIST / "verification.json").read_bytes())
        check("widget-build", 300, ["node", "extensions/src/mcp-app/widget/build-full-show.mjs"])
        check("native-verify-after-widget", 240, ["node", BUILDER, "--verify-manifest"])
        verified_after = {key: sha(SOURCE / DIST / key) for key in verified_before}
        assert verified_after == verified_before and sha(SOURCE / MANIFEST) == verified_manifest_pin
        (owned / "native-verify-after-widget.json").write_bytes((SOURCE / DIST / "verification.json").read_bytes())
        artifact = json.loads((SOURCE / DIST / "artifact.json").read_bytes())
        prior_sources = {item["path"]: item["sha256"] for item in old_artifact["source"]}
        sources = {item["path"]: item["sha256"] for item in artifact["source"]}
        removed = sorted(set(prior_sources) - set(sources))
        assert len(removed) == 3 and all(key.startswith(WIDGET) for key in removed), removed
        assert not (set(sources) - set(prior_sources))
        assert all(pin == prior_sources[key] for key, pin in sources.items())
        assert artifact["files"] == old_artifact["files"] and artifact["resources"] == old_artifact["resources"]
        assert {key: value for key, value in artifact["toolchain"].items() if key != "buildScriptSha256"} == {key: value for key, value in old_artifact["toolchain"].items() if key != "buildScriptSha256"}
        assert artifact["toolchain"]["buildScriptSha256"] == sha(SOURCE / BUILDER)
        assert verified_after["registry.json"] == old_registry_pin
        assert all(verified_after[key] == before[DIST + key]["sha256"] for key in ["renderer.mjs", "renderer.css"])
        assert all(not row["path"].startswith("extensions/src/") or row["path"] in inputs["files"] for row in artifact["source"])
        manifest = json.loads((SOURCE / MANIFEST).read_bytes())
        assert manifest["available"] is True and len(manifest["pins"]) == 3
        assert {item["renderer"]["id"] for item in manifest["pins"]} == {"tadazz-classic-stage", "razzia-native-stage", "tadazz-original-stage"}
        widget_after = {key: value for key, value in snapshot(SOURCE).items() if key.startswith(WIDGET)}
        assert widget_after != old_widget, "Widget build must exercise changed generated bytes"
        report.update(removedGeneratedSourcePaths=removed, actualRendererFilesUnchanged=True,
                      registryAndResourcesUnchanged=True, allRemainingArtifactSourcesUnchanged=True,
                      everyExtensionSourceIsTracked=True, nativeArtifactStableAcrossWidgetBuild=True,
                      generatedManifestSha256=verified_manifest_pin, nativeArtifactSha256=verified_after["artifact.json"],
                      widgetOutputChanged=True,
                      passed=True)
    except Exception:
        report["failure"] = traceback.format_exc()
        report["passed"] = False
    finally:
        try:
            if creation_attempted and not created:
                probe = subprocess.run(["docker", "inspect", name], capture_output=True, timeout=20)
                created = probe.returncode == 0
            if created:
                current = inspect(name)
                assert current["Config"]["Labels"]["com.tadazz.qa"] == "native-pins-repair" and current["Image"] == IMAGE
                if current["State"]["Running"]:
                    subprocess.run(["docker", "stop", "--time", "10", name], check=True, stdout=subprocess.DEVNULL, timeout=25)
                stopped = inspect(name)
                report["containerStopped"] = not stopped["State"]["Running"]
                report["noOom"] = current["State"].get("OOMKilled") is False and stopped["State"].get("OOMKilled") is False
                assert report["containerStopped"] and report["noOom"]
            else:
                report["containerStopped"] = True
                report["noOom"] = True
            after = snapshot(SOURCE)
            changed = sorted(key for key in set(before) | set(after) if before.get(key) != after.get(key))
            allowed = set(OLD)
            assert all(key in allowed or key.startswith(DIST) or key.startswith(WIDGET) for key in changed), changed
            assert {key: value["symlink"] for key, value in after.items() if "symlink" in value} == LINKS
            assert all(after.get(key, {}).get("sha256") == pin for key, pin in inputs["files"].items() if key not in allowed)
            assert sha(PARENT / RUN / "input-manifest.json") == INPUT_PIN
            assert snapshot(SDK, exclude_dependencies=False) == sdk_before
            disk_after = shutil.disk_usage(PARENT).free
            report["diskBudget"]["afterFreeBytes"] = disk_after
            assert disk_after >= preparation_disk_floor, "Preparation disk floor violated"
            guard_consumers()
            (owned / "source-after-inventory.json").write_bytes(json_bytes(after))
            report.update(sourceTreeSha256=canonical(after), sourceEntries=len(after),
                          changedPaths=changed, trackedChangedPaths=sorted(key for key in changed if key in inputs["files"]),
                          allOtherTrackedSourceUnchanged=True, dependencyLinksUnchanged=True, sdkUnchanged=True)
            report["formattedSource"] = {key: {"sha256": sha(SOURCE / key), "bytes": (SOURCE / key).stat().st_size} for key in OLD}
            for key in OLD:
                target = owned / "source-copyback" / key
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((SOURCE / key).read_bytes())
        except Exception:
            report["cleanupOrInvariantFailure"] = traceback.format_exc()
            report["passed"] = False
        report["seconds"] = round(time.monotonic() - started, 3)
        path = owned / "receipt.json"
        path.write_bytes(json_bytes(report))
        print(json.dumps({"passed": report["passed"], "receipt": str(path), "receiptSha256": sha(path),
                          "evidence": str(owned), "containerStopped": report.get("containerStopped"),
                          "noOom": report.get("noOom"), "checks": report["checks"],
                          "sourceTreeSha256": report.get("sourceTreeSha256"), "sourceEntries": report.get("sourceEntries"),
                          "failure": report.get("failure"), "cleanupOrInvariantFailure": report.get("cleanupOrInvariantFailure")}), flush=True)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    assert isinstance(CONFIG, dict)
    os.umask(0o077)
    if CONFIG["mode"] == "capture":
        capture()
    else:
        assert CONFIG["mode"] == "repair"
        raise SystemExit(repair(CONFIG))
