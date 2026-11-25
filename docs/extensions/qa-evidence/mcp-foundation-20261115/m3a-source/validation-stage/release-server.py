"""Read only this allocation's selected state and physical file metadata."""
from pathlib import Path
import hashlib
import json
import os
import subprocess

base = Path("/home/ubuntu/tadazz-hq-qa-20261115")
name = "mcp-m3a-e538db2b931fa6c223facffa9a7e0b0ac31b6270d8f629d8bf8e8d72245bc1f6"
e = base / "evidence" / name
containers = ["tadazz-hq-mcp-m3a-20261115", "tadazz-hq-mcp-m3a-20261115-r2", "tadazz-hq-mcp-m3a-20261115-r3", "tadazz-hq-mcp-m3a-20261115-r4", "tadazz-hq-mcp-m3a-format-20261115", "tadazz-hq-mcp-m3a-20261115-r6"]
fmt = '{"state":{{json .State}},"image":{{json .Image}},"network":{{json .HostConfig.NetworkMode}},"portBindings":{{json .HostConfig.PortBindings}},"readonlyRootfs":{{json .HostConfig.ReadonlyRootfs}},"memory":{{json .HostConfig.Memory}},"nanoCpus":{{json .HostConfig.NanoCpus}},"mounts":{{json .Mounts}},"logPath":{{json .LogPath}}}'
rows = []
container_disk = 0
for item in containers:
    row = json.loads(subprocess.check_output(["sudo", "-n", "docker", "inspect", item, "--format", fmt]))
    row["name"] = item
    assert not row["state"]["Running"] and not row["state"]["OOMKilled"]
    assert row["network"] == "none" and not row["portBindings"] and row["readonlyRootfs"]
    assert row["memory"] == 2147483648 and row["nanoCpus"] == 250000000
    directory = Path(row["logPath"]).parent
    if directory.parent == Path("/var/lib/docker/containers"):
        amount = int(subprocess.check_output(["sudo", "-n", "du", "-sB1", "--", str(directory)]).split()[0])
        row["containerDirectoryPhysicalBytes"] = amount
        container_disk += amount
    rows.append(row)
assert rows[-1]["state"]["ExitCode"] == 0
own = sum(int(subprocess.check_output(["du", "-sB1", "--", str(p)]).split()[0]) for p in [base / "source" / name, e])
v = os.statvfs(base)
free = v.f_bavail * v.f_frsize
upper = own + container_disk + 2 * 1024**2
assert upper < 64 * 1024**2 and free >= 2048 * 1024**2
index = base / "fixtures/integrator-root-85e-20261115-public-union/runtime-v12/v11/index.db"
index_sha = hashlib.sha256(index.read_bytes()).hexdigest()
assert index_sha == "ab1feb01feab44b1d2dc7c58eb6299dd24919753dd25dc16893cd5451dcdee89"
keeper = json.loads(subprocess.check_output(["sudo", "-n", "docker", "inspect", "integrator-root-85e-20261115-metadata-keeper", "--format", "{{json .State}}"]))
assert keeper["Running"]
result = {"kind": "ACTUAL_ALLOCATION_RELEASE_AND_PHYSICAL_ACCOUNTING", "allOwnContainersStopped": True, "finalNaturalExit": 0,
    "allOomKilledFalse": True, "ownSourceEvidencePhysicalBytes": own, "ownContainerDirectoryPhysicalBytes": container_disk,
    "additionalLayerAllowanceBytes": 2097152, "newPhysicalConservativeUpperBoundBytes": upper, "newPhysicalCapBytes": 67108864,
    "hostFreeAfterBytes": free, "sharedMetadataKeeperLeftRunning": True, "sharedMetadataCopied": False,
    "validatedIndexSha256After": index_sha, "containers": rows}
(e / "allocation-release.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({k: v for k, v in result.items() if k != "containers"}))
