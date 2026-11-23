"""Inspect only this stopped allocation, retain its receipts and return compute."""
from pathlib import Path
import hashlib
import json
import os
import subprocess

BASE = Path("/home/ubuntu/tadazz-hq-qa-20261115")
NAME = "mcp-bfb160-87ffbfdbe45d43fdbe5e7f799c18036d"
E = BASE / "evidence" / NAME
SOURCE = BASE / "source" / NAME
CONTAINER = "tadazz-hq-mcp-bfb160-87ffbfdbe45d"
fmt = '{"state":{{json .State}},"image":{{json .Image}},"network":{{json .HostConfig.NetworkMode}},"portBindings":{{json .HostConfig.PortBindings}},"readonlyRootfs":{{json .HostConfig.ReadonlyRootfs}},"memory":{{json .HostConfig.Memory}},"memorySwap":{{json .HostConfig.MemorySwap}},"nanoCpus":{{json .HostConfig.NanoCpus}},"mounts":{{json .Mounts}},"logPath":{{json .LogPath}},"logConfig":{{json .HostConfig.LogConfig}}}'
row = json.loads(subprocess.check_output(["sudo", "-n", "docker", "inspect", CONTAINER, "--format", fmt]))
assert not row["state"]["Running"] and not row["state"]["OOMKilled"]
assert row["state"]["ExitCode"] == 1
assert row["network"] == "none" and not row["portBindings"] and row["readonlyRootfs"]
assert row["memory"] == row["memorySwap"] == 2147483648 and row["nanoCpus"] == 250000000
summary = json.loads((E / "stage-summary.json").read_text())
assert summary["phases"] == {"typecheck": 0, "firstParty34": 0, "actualProducerCompatibility": 0, "format": 1}
assert summary["firstFailure"] == {"phase": "05-format", "exit": 1}
logs = subprocess.check_output(["sudo", "-n", "docker", "logs", CONTAINER], stderr=subprocess.STDOUT)
assert len(logs) < 1024 * 1024
(E / "container.log").write_bytes(logs)
directory = Path(row["logPath"]).parent
assert directory.parent == Path("/var/lib/docker/containers")
container_bytes = int(subprocess.check_output(["sudo", "-n", "du", "-sB1", "--", str(directory)]).split()[0])
own = sum(int(subprocess.check_output(["du", "-sB1", "--", str(path)]).split()[0]) for path in [SOURCE, E])
allowance = 2 * 1024**2
receipt_allowance = 64 * 1024
upper = own + container_bytes + allowance + receipt_allowance
assert upper <= 8 * 1024**2
fs = os.statvfs(BASE)
free = fs.f_bavail * fs.f_frsize
required = (2048 + 200 + 64) * 1024**2 + max(0, 8 * 1024**2 - upper)
assert free >= required >= 2048 * 1024**2
index = BASE / "fixtures/integrator-root-85e-20261115-public-union/runtime-v12/v11/index.db"
index_sha = hashlib.sha256(index.read_bytes()).hexdigest()
assert index_sha == "ab1feb01feab44b1d2dc7c58eb6299dd24919753dd25dc16893cd5451dcdee89"
keeper = json.loads(subprocess.check_output(["sudo", "-n", "docker", "inspect",
    "integrator-root-85e-20261115-metadata-keeper", "--format", "{{json .State}}"]))
assert keeper["Running"]
result = {"kind": "BOUND_BFB160_ALLOCATION_RELEASE", "grant": summary["grant"],
    "ownContainerStoppedNaturally": True, "naturalExit": row["state"]["ExitCode"], "oomKilled": False,
    "exitReason": "Scoped format check failed; all functional phases passed; no retry/edit",
    "ownSourceEvidencePhysicalBytesBeforeReceipt": own, "ownContainerDirectoryPhysicalBytes": container_bytes,
    "additionalLayerAllowanceBytes": allowance, "receiptAllowanceBytes": receipt_allowance,
    "newPhysicalConservativeUpperBoundBytes": upper, "newPhysicalCapBytes": 8 * 1024**2,
    "hostFreeAfterBytes": free, "requiredRemainingReserveBytes": required,
    "sharedMetadataKeeperLeftRunning": True, "sharedMetadataCopied": False,
    "validatedIndexSha256After": index_sha, "computeReturned": True, "container": row}
(E / "allocation-release.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({key: value for key, value in result.items() if key != "container"}))
