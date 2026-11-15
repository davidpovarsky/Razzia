"""SERVER ONLY. One bounded, network-none consumer of the root-pinned cache."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

BASE = Path("/home/ubuntu/tadazz-hq-qa-20261115")
PIN = "e538db2b931fa6c223facffa9a7e0b0ac31b6270d8f629d8bf8e8d72245bc1f6"
NAME = "mcp-m3a-" + PIN
SOURCE_ROOT = BASE / "source" / NAME
SOURCE = SOURCE_ROOT / "attempt-06"
EVIDENCE = BASE / "evidence" / NAME
ATTEMPT = EVIDENCE / "attempt-06"
DESCRIPTOR = BASE / "fixtures/integrator-root-85e-20261115-public-union/descriptor.json"
INDEX = BASE / "fixtures/integrator-root-85e-20261115-public-union/runtime-v12/v11/index.db"
VOLUME = "integrator-root-85e-20261115-metadata-ram"
CONTAINER = "tadazz-hq-mcp-m3a-20261115-r6"
CACHE_INDEX_SHA = "ab1feb01feab44b1d2dc7c58eb6299dd24919753dd25dc16893cd5451dcdee89"
CACHE_INVENTORY_SHA = "6f2126891ed74af76c8b6644a25e0faec29e438d248107010d808bbd49649c80"

if sys.platform != "linux" or Path(__file__).resolve().parent != SOURCE:
    raise SystemExit("Only the owned delivered Linux source directory is allowed")
assert SOURCE.is_dir() and not ATTEMPT.exists()
descriptor = json.loads(DESCRIPTOR.read_text())
assert descriptor["status"] == "AVAILABLE_FOR_MANAGER_ASSIGNED_READONLY_CONSUMERS"
assert descriptor["validated_runtime_index_sha256"] == CACHE_INDEX_SHA
assert descriptor["metadata_inventory_sha256"] == CACHE_INVENTORY_SHA
assert hashlib.sha256(INDEX.read_bytes()).hexdigest() == CACHE_INDEX_SHA
v = os.statvfs(BASE)
free = v.f_bavail * v.f_frsize
assert free >= 2400 * 1024**2, ("Fresh physical reserve gate", free)
assert subprocess.run(["sudo", "-n", "docker", "inspect", CONTAINER], capture_output=True).returncode != 0
keeper = json.loads(subprocess.check_output(["sudo", "-n", "docker", "inspect", descriptor["metadata_keeper"], "--format", "{{json .State}} "]))
assert keeper["Running"]
ATTEMPT.mkdir(mode=0o700)
image = subprocess.check_output(["sudo", "-n", "docker", "image", "inspect", "tadazz:design-system-qa-20261110", "--format", "{{.Id}}"], text=True).strip()
assert image.startswith("sha256:")
old = BASE / ("source/mcp-send-ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9/app")
root, sdk = [str(Path(p).parent) for p in descriptor["original_input_roots"]]
metadata_receipt = BASE / "evidence/integrator-root-85e-20261115/metadata-vite-repair/hydration-receipt.json"
command = ["sudo", "-n", "docker", "run", "-d", "--name", CONTAINER,
           "--user", "1001:1001", "--network", "none", "--cpus", "0.25", "--memory", "2g", "--memory-swap", "2g",
           "--pids-limit", "128", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
           "--ulimit", "core=0:0",
           "--log-driver", "json-file", "--log-opt", "max-size=1m", "--log-opt", "max-file=1",
           "--tmpfs", "/ram:rw,exec,nosuid,nodev,size=268435456,mode=1777",
           "--mount", f"type=volume,src={VOLUME},dst=/snapshot,readonly,volume-nocopy",
           "--mount", f"type=bind,src={root},dst=/cache-root,readonly",
           "--mount", f"type=bind,src={sdk},dst=/cache-sdk,readonly",
           "--mount", f"type=bind,src={INDEX},dst=/validated-index.db,readonly",
           "--mount", f"type=bind,src={DESCRIPTOR},dst=/cache-descriptor.json,readonly",
           "--mount", f"type=bind,src={metadata_receipt},dst=/metadata-receipt.json,readonly",
           "--mount", f"type=bind,src={old},dst=/accepted-source,readonly",
           "--mount", f"type=bind,src={SOURCE},dst=/delivery,readonly",
           "--mount", f"type=bind,src={SOURCE_ROOT},dst=/all-deliveries,readonly",
           "--mount", f"type=bind,src={EVIDENCE},dst=/all-evidence,readonly",
           "--mount", f"type=bind,src={EVIDENCE / 'attempt-03'},dst=/prior-sdk,readonly",
           "--mount", f"type=bind,src={ATTEMPT},dst=/evidence",
           "--env", "HOME=/ram/home", "--env", "TMPDIR=/ram/tmp", "--env", "XDG_RUNTIME_DIR=/ram/runtime",
           "--env", "NODE_OPTIONS=", "--env", "NODE_PATH=", "--entrypoint", "python3", image, "/delivery/consumer.py"]
(ATTEMPT / "launch.json").write_text(json.dumps({"allocationNamespacePin": PIN,
    "sourceManifestSha256": hashlib.sha256((SOURCE / "full-input-manifest.json").read_bytes()).hexdigest(), "freeBefore": free,
    "command": command, "image": image, "diskCapBytes": 64 * 1024**2,
    "ownTmpfsCapBytes": 256 * 1024**2, "sharedMetadataCopied": False,
    "cacheIndexSha256": CACHE_INDEX_SHA, "cacheInventorySha256": CACHE_INVENTORY_SHA}, indent=2) + "\n")
result = subprocess.run(command, capture_output=True, text=True)
(ATTEMPT / "launch.stdout").write_text(result.stdout)
(ATTEMPT / "launch.stderr").write_text(result.stderr)
print(json.dumps({"exit": result.returncode, "container": CONTAINER, "stdout": result.stdout, "stderr": result.stderr}))
raise SystemExit(result.returncode)
