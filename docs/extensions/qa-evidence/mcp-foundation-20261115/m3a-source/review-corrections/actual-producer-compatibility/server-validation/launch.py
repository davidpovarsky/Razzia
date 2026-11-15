"""SERVER ONLY: launch one fresh immutable grant-bound container."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

BASE = Path("/home/ubuntu/tadazz-hq-qa-20261115")
NAME = "mcp-bfb160-87ffbfdbe45d43fdbe5e7f799c18036d"
SOURCE = BASE / "source" / NAME
EVIDENCE = BASE / "evidence" / NAME
CONTAINER = "tadazz-hq-mcp-bfb160-87ffbfdbe45d"
OLD_NAME = "mcp-m3a-e538db2b931fa6c223facffa9a7e0b0ac31b6270d8f629d8bf8e8d72245bc1f6"
DESCRIPTOR = BASE / "fixtures/integrator-root-85e-20261115-public-union/descriptor.json"
INDEX = BASE / "fixtures/integrator-root-85e-20261115-public-union/runtime-v12/v11/index.db"
assert Path(__file__).resolve().parent == SOURCE
assert SOURCE.is_dir() and EVIDENCE.is_dir() and not (EVIDENCE / "launch.json").exists()
grant = json.loads((SOURCE / "grant.json").read_text())
assert grant["grant_id"] == "hq-mcp-bfb-87ffbfdbe45d43fdbe5e7f799c18036d"
assert grant["execution_authorized"] and grant["new_additional_physical_mib_max"] == 8
assert hashlib.sha256((SOURCE / "final-input-manifest.json").read_bytes()).hexdigest() == grant["manifest160_sha256"]
assert hashlib.sha256((SOURCE / "final-source-overlay.tar.gz").read_bytes()).hexdigest() == grant["overlay_sha256"]
descriptor = json.loads(DESCRIPTOR.read_text())
assert descriptor["status"] == "AVAILABLE_FOR_MANAGER_ASSIGNED_READONLY_CONSUMERS"
assert hashlib.sha256(INDEX.read_bytes()).hexdigest() == descriptor["validated_runtime_index_sha256"] == "ab1feb01feab44b1d2dc7c58eb6299dd24919753dd25dc16893cd5451dcdee89"
assert descriptor["metadata_inventory_sha256"] == "6f2126891ed74af76c8b6644a25e0faec29e438d248107010d808bbd49649c80"
fs = os.statvfs(BASE)
free = fs.f_bavail * fs.f_frsize
assert free >= 2320 * 1024**2, ("fresh disk reserve", free)
meminfo = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
available_ram = int(meminfo["MemAvailable"].split()[0]) * 1024
assert available_ram >= 2112 * 1024**2
assert subprocess.run(["sudo", "-n", "docker", "inspect", CONTAINER], capture_output=True).returncode != 0
keeper = json.loads(subprocess.check_output(["sudo", "-n", "docker", "inspect", descriptor["metadata_keeper"]]))[0]
assert keeper["State"]["Running"]
image = subprocess.check_output(["sudo", "-n", "docker", "image", "inspect",
    "tadazz:design-system-qa-20261110", "--format", "{{.Id}}"], text=True).strip()
prior = json.loads((BASE / "evidence" / OLD_NAME / "attempt-03/launch.json").read_text())
assert image == prior["image"]
root, sdk = [str(Path(path).parent) for path in descriptor["original_input_roots"]]
command = ["sudo", "-n", "docker", "run", "-d", "--name", CONTAINER,
    "--user", str(os.getuid()) + ":" + str(os.getgid()), "--network", "none", "--cpus", ".25",
    "--memory", "2g", "--memory-swap", "2g", "--pids-limit", "128", "--read-only",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--ulimit", "core=0:0",
    "--log-driver", "json-file", "--log-opt", "max-size=1m", "--log-opt", "max-file=1",
    "--tmpfs", "/ram:rw,exec,nosuid,nodev,size=268435456,mode=1777"]
mounts = [
    ("volume", descriptor["metadata_ram_volume"], "/snapshot", True),
    ("bind", root, "/cache-root", True), ("bind", sdk, "/cache-sdk", True),
    ("bind", str(INDEX), "/validated-index.db", True),
    ("bind", str(DESCRIPTOR), "/cache-descriptor.json", True),
    ("bind", descriptor["metadata_hydration_receipt"], "/metadata-receipt.json", True),
    ("bind", str(BASE / "source/mcp-send-ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9/app"), "/accepted-source", True),
    ("bind", str(BASE / "source" / OLD_NAME / "attempt-06"), "/producer-source", True),
    ("bind", str(BASE / "evidence" / OLD_NAME / "attempt-03"), "/prior-sdk", True),
    ("bind", str(SOURCE), "/delivery", True), ("bind", str(SOURCE), "/all-own-source", True),
    ("bind", str(EVIDENCE), "/all-own-evidence", True), ("bind", str(EVIDENCE), "/evidence", False)]
for kind, source, target, readonly in mounts:
    value = f"type={kind},src={source},dst={target}"
    if readonly:
        value += ",readonly"
    if kind == "volume":
        value += ",volume-nocopy"
    command += ["--mount", value]
command += ["--env", "HOME=/ram/home", "--env", "TMPDIR=/ram/tmp", "--env", "XDG_RUNTIME_DIR=/ram/runtime",
    "--env", "NODE_OPTIONS=", "--env", "NODE_PATH=", "--entrypoint", "python3", image, "/delivery/consumer.py"]
running = subprocess.check_output(
    ["sudo", "-n", "docker", "ps", "--format", "{{.Names}} {{.Status}}"], text=True)
(EVIDENCE / "launch.json").write_text(json.dumps({"grant": grant, "container": CONTAINER,
    "image": image, "freeBeforeBytes": free, "availableRamBeforeBytes": available_ram,
    "command": command, "otherRunningContainersBefore": running, "diskCapBytes": 8 * 1024**2,
    "ownTmpfsCapBytes": 256 * 1024**2, "sharedMetadataCopied": False,
    "cacheIndexSha256": descriptor["validated_runtime_index_sha256"],
    "cacheInventorySha256": descriptor["metadata_inventory_sha256"]}, indent=2) + "\n")
result = subprocess.run(command, capture_output=True, text=True)
(EVIDENCE / "launch.stdout").write_text(result.stdout)
(EVIDENCE / "launch.stderr").write_text(result.stderr)
print(json.dumps({"launchExit": result.returncode, "container": CONTAINER,
    "stdout": result.stdout, "stderr": result.stderr, "freshFreeBytes": free,
    "freshAvailableRamBytes": available_ram}))
raise SystemExit(result.returncode)
