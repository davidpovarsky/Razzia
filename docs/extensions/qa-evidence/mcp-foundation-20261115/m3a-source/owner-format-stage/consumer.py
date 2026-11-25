"""Format-only successor: isolated copy, eight AST-equal edits, TC and scoped tests."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import threading
import time
import traceback

E, D, RAM = Path("/evidence"), Path("/delivery"), Path("/ram")
MANIFEST_SHA = "4c02c37421191cd8ea2fe46e35c0b8a37467a7d89708a11bf8cd68047bac29ab"
INDEX_SHA = "ab1feb01feab44b1d2dc7c58eb6299dd24919753dd25dc16893cd5451dcdee89"
INVENTORY_SHA = "6f2126891ed74af76c8b6644a25e0faec29e438d248107010d808bbd49649c80"
LOCK_SHA = "e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838"
GRANT = "mcp-format-F-20261115-01a1dfaa"
MODULE = "extensions/src/mcp-app/"
CAP = 8 * 1024**2
DOCKER_ALLOWANCE = 2 * 1024**2
stop = threading.Event()
errors = []
active = None
first_failure = None
os.umask(0o077)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def save(name, data):
    (E / name).write_text(json.dumps(data, indent=2) + "\n")


def physical(root):
    total = Path(root).lstat().st_blocks * 512
    for parent, folders, files in os.walk(root, followlinks=False):
        total += sum((Path(parent) / name).lstat().st_blocks * 512 for name in [*folders, *files])
    return total


def guard():
    owned = physical("/all-own-source") + physical("/all-own-evidence") + DOCKER_ALLOWANCE
    fs = os.statvfs(E)
    free = fs.f_bavail * fs.f_frsize
    required = int(json.loads((D / "activation.json").read_text())["otherReserveBytes"]) + max(0, CAP - owned)
    ram = os.statvfs(RAM)
    used_ram = (ram.f_blocks - ram.f_bfree) * ram.f_frsize
    value = {"newPhysicalUpperBoundBytes": owned, "diskCapBytes": CAP,
        "dockerAllowanceBytes": DOCKER_ALLOWANCE, "freeBytes": free,
        "requiredRemainingReserveBytes": required, "absoluteFloorBytes": 2048 * 1024**2,
        "ownTmpfsUsedBytes": used_ram, "ownTmpfsCapBytes": 256 * 1024**2}
    if owned > CAP or free < required or used_ram > 256 * 1024**2:
        save("resource-stop.json", value)
        raise RuntimeError("Bound disk/reserve/RAM admission crossed")
    return value


def monitor():
    while not stop.wait(1):
        try:
            guard()
        except Exception as error:
            errors.append(str(error))
            if active and active.poll() is None:
                # The bounded logger starts its command in a separate session.
                # Stop that owned child group as well as the logger group.
                children = Path(f"/proc/{active.pid}/task/{active.pid}/children")
                try:
                    for child in children.read_text().split():
                        try:
                            os.killpg(int(child), signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                    os.killpg(active.pid, signal.SIGTERM)
                except (ProcessLookupError, FileNotFoundError):
                    pass
            break


def run(name, command, env):
    global active, first_failure
    guard()
    active = subprocess.Popen(["python3", str(D / "run-phase.py"), name, *command],
        cwd=RAM / "work" / MODULE, env=env, start_new_session=True)
    code = active.wait()
    active = None
    if code and first_failure is None:
        first_failure = {"phase": name, "exit": code}
    if errors:
        raise RuntimeError("Resource monitor stopped owned phase: " + "; ".join(errors))
    save(name + "-resources.json", guard())
    return code


def source_check(manifest):
    for row in manifest["files"]:
        path = RAM / "work" / row["path"]
        assert path.is_file() and not path.is_symlink()
        assert path.stat().st_size == row["bytes"] and sha(path) == row["sha256"], row["path"]
    return {"files": len(manifest["files"]), "manifestSha256": MANIFEST_SHA,
        "unexpectedChanges": [], "privateLockSha256": sha(RAM / "work" / MODULE / "pnpm-lock.yaml")}


def metadata_check():
    inventory = json.loads(Path("/snapshot/inventory.json").read_text())
    ready = json.loads(Path("/snapshot/ready.json").read_text())
    hydration = json.loads(Path("/metadata-receipt.json").read_text())
    assert ready["complete"] and hydration["complete"] and not hydration["failures"]
    assert sha("/snapshot/inventory.json") == INVENTORY_SHA == ready["inventory_sha256"]
    assert sha("/metadata-receipt.json") == inventory["receipt_sha256"] == ready["hydration_receipt_sha256"]
    rows = {row["cache_relative_path"]: row for row in inventory["files"]}
    assert len(rows) == 459 and rows == {row["cache_relative_path"]: row for row in hydration["results"]}
    for relative, row in rows.items():
        path = Path("/snapshot/metadata") / relative
        assert path.is_file() and not path.is_symlink()
        assert path.stat().st_size == row["cache_bytes"] and sha(path) == row["cache_sha256"]
    assert sha("/validated-index.db") == INDEX_SHA
    return {"verifiedMetadataFiles": len(rows), "indexSha256": INDEX_SHA,
        "metadataInventorySha256": INVENTORY_SHA, "sharedMetadataCopied": False}


def reuse_sdk(manifest):
    prior = Path("/prior-sdk")
    result = json.loads((prior / "06-sdk.json").read_text())
    assert result["actualReturnCode"] == result["shellExit"] == 0 and not result["logTruncated"]
    assert sha(prior / "06-sdk.log") == result["logSha256"] == "ecf07bc1a5bd7b195268635b0002fa4d104130a22ee95400ba977bd34e196e9a"
    text = (prior / "06-sdk.log").read_text()
    for pattern in [r"\btests 41\b", r"\bpass 41\b", r"\bfail 0\b", r"\bskipped 0\b"]:
        assert re.search(pattern, text)
    assert sha(prior / "generated-private-pnpm-lock.yaml") == LOCK_SHA
    for name in ["node.version", "pnpm.version"]:
        assert (prior / name).read_bytes() == (E / name).read_bytes()
    assert json.loads((prior / "launch.json").read_text())["image"] == json.loads((E / "launch.json").read_text())["image"]
    old = json.loads((prior / "full-input-manifest.json").read_text())
    current = {row["path"]: row for row in manifest["files"]}
    checked = []
    for row in old["files"]:
        path = row["path"]
        if path.startswith((MODULE + "first-party/", MODULE + "tests/first-party/")) or path == MODULE + "pnpm-lock.yaml":
            continue
        assert row == current[path], path
        checked.append(path)
    for name in ["validated_runtime_index_sha256", "metadata_inventory_sha256"]:
        assert json.loads((prior / "cache-pin.json").read_text())[name] == json.loads((E / "cache-pin.json").read_text())[name]
    save("sdk41-reuse.json", {"kind": "REUSED_ACTUAL_SDK41_NO_RERUN", "actualPass": 41, "actualFail": 0,
        "logSha256": result["logSha256"], "unchangedNonFirstPartyInputCount": len(checked),
        "unchangedNonFirstPartyInputs": checked, "sameLockImageNodePnpmCache": True})


code = 1
try:
    save("resource-start.json", guard())
    watcher = threading.Thread(target=monitor, daemon=True)
    watcher.start()
    activation = json.loads((D / "activation.json").read_text())
    assert activation["threadId"] == "01a1dfaa-0f10-77b2-aa65-462ca5fe0a90"
    assert activation["job"] == GRANT and activation["ownerActivation"] == "SINGLE_MANAGER_WAVE_RESTART_20261115"
    mounts = Path("/proc/self/mountinfo").read_text().splitlines()
    readonly = ["/delivery", "/producer-source", "/accepted-source", "/prior-sdk", "/snapshot",
        "/cache-root", "/cache-sdk", "/validated-index.db", "/cache-descriptor.json", "/metadata-receipt.json",
        "/all-own-source", "/all-own-evidence", "/predecessor"]
    for target in readonly:
        row = next(row for row in mounts if row.split()[4] == target)
        assert "ro" in row.split()[5].split(","), target
    save("readonly-mounts.json", {"readonlyTargets": readonly, "mountinfo": mounts})
    descriptor = json.loads(Path("/cache-descriptor.json").read_text())
    assert descriptor["validated_runtime_index_sha256"] == INDEX_SHA
    assert descriptor["metadata_inventory_sha256"] == INVENTORY_SHA
    save("cache-pin.json", descriptor)
    save("cache-before.json", metadata_check())
    for folder in ["home", "tmp", "runtime", "store/v11/files"]:
        (RAM / folder).mkdir(parents=True, mode=0o700)
    shutil.copyfile("/validated-index.db", RAM / "store/v11/index.db")
    os.chmod(RAM / "store/v11/index.db", 0o600)
    linked = 0
    for cache in [Path("/cache-root/v11"), Path("/cache-sdk/v11")]:
        for source in sorted((cache / "files").glob("*/*")):
            assert source.is_file() and not source.is_symlink()
            target = RAM / "store/v11" / source.relative_to(cache)
            if target.is_symlink():
                assert target.stat().st_size == source.stat().st_size
                assert bool(target.stat().st_mode & 0o111) == bool(source.stat().st_mode & 0o111)
                continue
            target.parent.mkdir(exist_ok=True)
            target.symlink_to(source)
            linked += 1
    mirror = RAM / "home/.cache/pnpm/v12"
    mirror.mkdir(parents=True)
    for name in ["metadata-full", "metadata"]:
        (mirror / name).symlink_to("/snapshot/metadata", target_is_directory=True)
    save("cache-materialization.json", {"ownCafsSymlinks": linked, "copiedBodyBytes": 0,
        "sharedMetadataCopied": False, "indexInputSha256": INDEX_SHA})
    assert sha(Path("/predecessor/final-input-manifest.json")) == MANIFEST_SHA
    manifest = json.loads((Path("/predecessor/final-input-manifest.json")).read_text())
    assert len(manifest["files"]) == 160
    work = RAM / "work"
    assert not work.exists()
    work.mkdir(mode=0o700)
    sources = [Path("/predecessor/app"), Path("/producer-source/app"), Path("/accepted-source")]
    selections = []
    for row in manifest["files"]:
        relative = Path(row["path"])
        assert not relative.is_absolute() and ".." not in relative.parts
        source = next((root / relative for root in sources if (root / relative).exists()), None)
        assert source and source.is_file() and not source.is_symlink(), row["path"]
        assert any(source.resolve().is_relative_to(root.resolve()) for root in sources)
        assert source.stat().st_size == row["bytes"] and sha(source) == row["sha256"], row["path"]
        target = work / relative
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        target.write_bytes(source.read_bytes())
        target.chmod(0o444)
        selections.append({"path": row["path"], "source": str(source)})
    save("source-selections.json", selections)
    save("source-before.json", source_check(manifest))
    env = {"PATH": os.environ["PATH"], "HOME": "/ram/home", "TMPDIR": "/ram/tmp",
        "XDG_CACHE_HOME": "/ram/home/.cache", "XDG_DATA_HOME": "/ram/home/.local/share",
        "XDG_STATE_HOME": "/ram/home/.local/state", "XDG_RUNTIME_DIR": "/ram/runtime", "PNPM_HOME": "/ram/pnpm",
        "npm_config_cache": "/ram/npm-cache", "NPM_CONFIG_USERCONFIG": "/ram/empty-user.npmrc",
        "NPM_CONFIG_GLOBALCONFIG": "/ram/empty-global.npmrc", "NPM_CONFIG_REGISTRY": "https://registry.npmjs.org/",
        "NODE_OPTIONS": "", "NODE_PATH": "", "NO_UPDATE_NOTIFIER": "1",
        "MCP_SYNTHETIC_REVIEW_EVIDENCE": "/evidence/review-witnesses"}
    for name in ["empty-user.npmrc", "empty-global.npmrc"]:
        (RAM / name).write_bytes(b"")
    for name, command, expected in [("node.version", ["node", "--version"], b"v24.22.2\n"),
        ("pnpm.version", ["pnpm", "--version"], b"12.18.0\n")]:
        value = subprocess.check_output(command, env=env)
        (E / name).write_bytes(value)
        assert value == expected
    reuse_sdk(manifest)
    assert not (work / MODULE / "node_modules").exists()
    install = run("01-frozen-bootstrap", ["pnpm", "install", "--ignore-workspace", "--frozen-lockfile",
        "--offline", "--ignore-scripts", "--store-dir=/ram/store", "--package-import-method=copy",
        "--verify-store-integrity=true", "--reporter=append-only"], env)
    if install:
        save("dependent-phases-not-run.json", {"prerequisite": "01-frozen-bootstrap", "exit": install,
            "notRun": ["typecheck", "firstParty34", "actualProducerCompatibility", "format"]})
        raise RuntimeError("Frozen bootstrap failed; no retry or source edit")
    assert sha(work / MODULE / "pnpm-lock.yaml") == LOCK_SHA
    modules = work / MODULE / "node_modules"
    assert modules.is_dir() and not modules.is_symlink()
    assert not (work / "node_modules").exists() and not (work / "node_modules").is_symlink()
    (work / "node_modules").symlink_to(modules, target_is_directory=True)
    phases = {}
    phases["semanticFormat"] = run("02-semantic-format", ["node", "/delivery/format-and-compare.mjs"], env)
    if phases["semanticFormat"]:
        raise RuntimeError("Eight-file AST comparison failed; dependent phases not run")
    manifest = json.loads((E / "formatted-input-manifest.json").read_text())
    phases["typecheck"] = run("03-typecheck", ["pnpm", "run", "typecheck"], env)
    phases["firstParty34"] = run("04-first-party", ["pnpm", "run", "test:first-party"], env)
    phases["actualProducerCompatibility"] = run("05-actual-producer", ["pnpm", "exec", "tsx",
        "--tsconfig", "tsconfig.json", "tests/first-party/compatibility.observation.ts"], env)
    formatter = "/cleanup/node_modules/prettier/bin/prettier.cjs"
    assert Path(formatter).is_file()
    save("format-options.json", {"semi": False, "tabWidth": 2, "singleQuote": False,
        "printWidth": 80, "trailingComma": "all"})
    format_paths = [path.removeprefix(MODULE) for path in manifest["deltaPaths"]
        if path.startswith(MODULE) and "/ad895-producer/" not in path]
    assert len(format_paths) == 12
    phases["format"] = run("06-format", ["node", formatter, "--config", "/evidence/format-options.json",
        "--check", *format_paths], env)
    save("source-after.json", source_check(manifest))
    save("cache-after.json", metadata_check())
    save("stage-summary.json", {"grant": GRANT, "productSource": manifest.get("predecessorSource", "bfb796c72495f0f9d99442066f825a74ebd054d4"),
        "manifestSha256": MANIFEST_SHA, "phases": phases, "firstFailure": first_failure,
        "firstPartyDeclarations": 34, "separateCompatibilityObservation": 1, "sdk41": "REUSED_NOT_RERUN",
        "resources": guard(), "unchangedOtherInputs": 152, "formattedAstEqualInputs": 8, "nativeOrOAuthMount": False,
        "syscallZeroWriteProof": False})
    code = 0 if not any(phases.values()) else 1
except Exception as error:
    save("failure.json", {"error": str(error), "firstFailure": first_failure, "traceback": traceback.format_exc()})
    print(traceback.format_exc(), flush=True)
finally:
    stop.set()
    if "watcher" in globals():
        watcher.join(timeout=3)
    if "manifest" in globals() and (RAM / "work").exists():
        try:
            save("source-finally.json", source_check(manifest))
        except Exception as error:
            save("source-finally-failure.json", {"error": str(error)})
            code = 1
    try:
        save("resource-end.json", guard())
    except Exception as error:
        errors.append(str(error))
        code = 1
    if errors:
        save("monitor-errors.json", errors)
    print(json.dumps({"exit": code, "firstFailure": first_failure, "monitorErrors": errors}), flush=True)
raise SystemExit(code)
