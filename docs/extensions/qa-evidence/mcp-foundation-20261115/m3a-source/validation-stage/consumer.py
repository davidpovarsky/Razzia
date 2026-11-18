"""SERVER ONLY. Exact source + private offline install; no shared cache mutation."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import threading
import time
import traceback

E = Path("/evidence")
D = Path("/delivery")
RAM = Path("/ram")
INDEX_SHA = "ab1feb01feab44b1d2dc7c58eb6299dd24919753dd25dc16893cd5451dcdee89"
INVENTORY_SHA = "6f2126891ed74af76c8b6644a25e0faec29e438d248107010d808bbd49649c80"
disk_cap = 64 * 1024**2
errors = []
active = None
stop = threading.Event()


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def save(name, value):
    (E / name).write_text(json.dumps(value, indent=2) + "\n")


def physical(root):
    total = 0
    for current, folders, names in os.walk(root, followlinks=False):
        for name in [*folders, *names]:
            total += (Path(current) / name).lstat().st_blocks * 512
    return total


def meter():
    owned = physical(Path("/all-deliveries")) + physical(Path("/all-evidence"))
    fs = os.statvfs(E)
    free = fs.f_bavail * fs.f_frsize
    required = 2336 * 1024**2 + max(0, disk_cap - owned)
    used_ram = os.statvfs(RAM)
    return {"newPhysicalBytes": owned, "capBytes": disk_cap, "hostFreeBytes": free,
            "dockerStateAndCappedLogAllowanceBytes": 2 * 1024**2,
            "newPhysicalUpperBoundBytes": owned + 2 * 1024**2,
            "requiredRemainingReserveBytes": required, "ownTmpfsUsedBytes": (used_ram.f_blocks - used_ram.f_bfree) * used_ram.f_frsize}


def guard():
    value = meter()
    if value["newPhysicalUpperBoundBytes"] > disk_cap or value["hostFreeBytes"] < value["requiredRemainingReserveBytes"]:
        save("resource-stop.json", value)
        raise RuntimeError("Owned disk cap or remaining-growth reserve crossed")
    return value


def monitor():
    while not stop.wait(1):
        try:
            guard()
        except Exception as error:
            errors.append(str(error))
            if active and active.poll() is None:
                try: os.killpg(active.pid, 15)
                except ProcessLookupError: pass
            break


def run(label, command, env=None):
    global active
    guard()
    started = time.time()
    with (E / (label + ".log")).open("w") as log:
        active = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True)
        code = active.wait()
        active = None
    result = {"command": command, "exit": code, "seconds": round(time.time() - started, 3),
              "logSha256": digest(E / (label + ".log")), "resources": guard()}
    save(label + ".json", result)
    print(label, json.dumps(result), flush=True)
    return code


try:
    save("resource-start.json", guard())
    monitor_thread = threading.Thread(target=monitor, daemon=True)
    monitor_thread.start()
    descriptor = json.loads(Path("/cache-descriptor.json").read_text())
    assert descriptor["validated_runtime_index_sha256"] == INDEX_SHA
    assert descriptor["metadata_inventory_sha256"] == INVENTORY_SHA
    assert digest(Path("/validated-index.db")) == INDEX_SHA
    save("cache-pin.json", descriptor)
    mounts = Path("/proc/self/mountinfo").read_text().splitlines()
    required_ro = ["/snapshot", "/cache-root", "/cache-sdk", "/validated-index.db", "/cache-descriptor.json", "/metadata-receipt.json", "/accepted-source", "/delivery", "/all-deliveries", "/all-evidence", "/prior-sdk"]
    for target in required_ro:
        row = next(line for line in mounts if line.split()[4] == target)
        assert "ro" in row.split()[5].split(","), target
    save("read-only-cache-mount-proof.json", {"readonlyTargets": required_ro,
        "mountinfo": mounts, "sharedMetadataNotDuplicated": True})
    for folder in ["home", "tmp", "runtime", "store/v11/files"]:
        (RAM / folder).mkdir(parents=True, mode=0o700)
    os.chmod(RAM / "runtime", 0o700)
    shutil.copyfile("/validated-index.db", RAM / "store/v11/index.db")
    os.chmod(RAM / "store/v11/index.db", 0o600)
    body_files = 0
    for cache in [Path("/cache-root/v11"), Path("/cache-sdk/v11")]:
        for source in sorted((cache / "files").glob("*/*")):
            assert source.is_file() and not source.is_symlink()
            destination = RAM / "store/v11" / source.relative_to(cache)
            if destination.is_symlink():
                first, second = destination.stat(), source.stat()
                assert first.st_size == second.st_size and bool(first.st_mode & 0o111) == bool(second.st_mode & 0o111)
                continue
            destination.parent.mkdir(exist_ok=True)
            destination.symlink_to(source)
            body_files += 1
    receipt = json.loads(Path("/metadata-receipt.json").read_text())
    inventory = json.loads(Path("/snapshot/inventory.json").read_text())
    ready = json.loads(Path("/snapshot/ready.json").read_text())
    assert ready["complete"] and receipt["complete"] and not receipt["failures"]
    assert digest(Path("/snapshot/inventory.json")) == INVENTORY_SHA == ready["inventory_sha256"]
    assert digest(Path("/metadata-receipt.json")) == inventory["receipt_sha256"] == ready["hydration_receipt_sha256"]
    entries = {row["cache_relative_path"]: row for row in receipt["results"]}
    assert len(entries) == 459 and entries == {row["cache_relative_path"]: row for row in inventory["files"]}
    for relative, row in entries.items():
        file = Path("/snapshot/metadata") / relative
        assert file.is_file() and not file.is_symlink()
        assert file.stat().st_size == row["cache_bytes"] and digest(file) == row["cache_sha256"]
    mirror = RAM / "home/.cache/pnpm/v12"
    mirror.mkdir(parents=True)
    (mirror / "metadata-full").symlink_to("/snapshot/metadata", target_is_directory=True)
    (mirror / "metadata").symlink_to("/snapshot/metadata", target_is_directory=True)
    save("cache-materialization.json", {"derivedIndexBeforeSha256": digest(RAM / "store/v11/index.db"),
        "bodyFileSymlinks": body_files, "copiedBodyBytes": 0, "metadataFilesVerified": len(entries),
        "metadataInventorySha256": INVENTORY_SHA, "metadataExpandedBytesSharedOnce": ready["expanded_bytes"],
        "ownMetadataMirrors": [str(mirror / name) for name in ["metadata-full", "metadata"]],
        "sameGenuineBodiesNoTransform": True, "resources": guard()})
    shutil.copyfile(D / "full-input-manifest.json", E / "full-input-manifest.json")
    for name in ["check-source.mjs", "get-observer.mjs", "analyze-get-trace.mjs"]:
        shutil.copyfile(D / name, E / name)
    assert run("00-materialize", ["node", str(D / "materialize-source.mjs"), "/accepted-source", str(D / "app"), str(E / "full-input-manifest.json"), "/ram/work", str(E / "source-before.json")]) == 0
    # Read-only formatter tool from the existing QA image; application imports
    # continue to resolve only delivered /ram/work source and private modules.
    formatter = Path("/cleanup/node_modules/prettier/bin/prettier.cjs")
    assert formatter.is_file()
    save("format-options.json", {"semi": False, "tabWidth": 2, "singleQuote": False, "printWidth": 80, "trailingComma": "all"})
    child_env = {"PATH": os.environ["PATH"], "HOME": "/ram/home", "TMPDIR": "/ram/tmp", "XDG_RUNTIME_DIR": "/ram/runtime",
        "MCP_VERIFIED_PUBLIC_CACHE_READY": "yes", "MCP_MAX_NEW_DISK_BYTES": str(disk_cap), "MCP_OWN_RAM_ROOT": "/ram",
        "MCP_OWN_OFFLINE_STORE": "/ram/store", "MCP_FORMATTER_CLI": str(formatter), "NODE_OPTIONS": "", "NODE_PATH": ""}
    code = run("12-private-validation", ["bash", str(D / "validate-private.sh")], child_env)
    if code: raise RuntimeError("Private validation failed; retain actual phase logs")
except Exception as error:
    save("failure.json", {"error": str(error), "traceback": traceback.format_exc()})
    print(traceback.format_exc(), flush=True)
finally:
    stop.set()
    if "monitor_thread" in globals(): monitor_thread.join(timeout=3)
    if (E / "source-before.json").exists():
        args = ["node", str(E / "check-source.mjs"), str(E / "full-input-manifest.json"), "/ram/work", str(E / "source-after-final.json")]
        if (E / "generated-private-pnpm-lock.yaml").exists(): args.append(str(E / "generated-private-pnpm-lock.yaml"))
        with (E / "source-after-final.log").open("w") as log:
            final_check = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT)
        save("source-after-final-exit.json", {"exit": final_check.returncode})
        if final_check.returncode: errors.append("Final source check failed")
    save("resource-end.json", {**meter(), "memoryPeak": Path("/sys/fs/cgroup/memory.peak").read_text().strip(),
        "memoryEvents": Path("/sys/fs/cgroup/memory.events").read_text(), "monitorErrors": errors,
        "sharedMetadataTmpfsUsed": (os.statvfs("/snapshot").f_blocks - os.statvfs("/snapshot").f_bfree) * os.statvfs("/snapshot").f_frsize})
    assert digest(Path("/validated-index.db")) == INDEX_SHA
    save("cache-after.json", {"validatedReadonlyIndexSha256": INDEX_SHA, "inventorySha256": digest(Path("/snapshot/inventory.json")),
        "readOnlyMountsPreserved": True, "originalCacheInputsWritable": False})
if (E / "failure.json").exists() or errors: raise SystemExit(1)
