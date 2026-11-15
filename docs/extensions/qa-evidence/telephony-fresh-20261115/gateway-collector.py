"""Collect only an exact terminal Lane C synthetic namespace; never credentials."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument("--sha", required=True)
parser.add_argument("--phase", choices=["gateway"], required=True)
parser.add_argument("--name", required=True)
parser.add_argument("--prior-bytes", required=True, type=int)
parser.add_argument("--extra-evidence", action="append", default=[])
parser.add_argument("--fixture")
args = parser.parse_args()
assert len(args.sha) == 40 and all(c in "0123456789abcdef" for c in args.sha)
assert 5898240 <= args.prior_bytes <= 16777216
qa = pathlib.Path("/home/ubuntu/tadazz-hq-qa-20261115")
prefix = "phone-gateway-" + args.sha[:7] + "-"
assert args.name.startswith(prefix) and "/" not in args.name
for name in args.extra_evidence:
    assert name.startswith(prefix) and "/" not in name
data = json.loads(subprocess.check_output(["docker", "inspect", "--size", args.name]))[0]
assert not data["State"]["Running"] and data["State"]["Pid"] == 0
assert not data["State"]["OOMKilled"]
summary = qa / "evidence" / ("phone-summary-" + args.phase + "-" + args.sha[:7])
summary.mkdir(mode=0o700)
terminal = {
    "name": args.name, "id": data["Id"], "image": data["Image"],
    "state": data["State"], "size_rw": data.get("SizeRw"),
    "memory_bytes": data["HostConfig"]["Memory"], "nano_cpus": data["HostConfig"]["NanoCpus"],
    "network": data["HostConfig"]["NetworkMode"], "readonly_rootfs": data["HostConfig"]["ReadonlyRootfs"],
}
(summary / "terminal.json").write_text(json.dumps(terminal, indent=2) + "\n")
evidence = [qa / "evidence" / name for name in [args.name, *args.extra_evidence]] + [summary]
archive = qa / "artifacts" / ("phone-gateway-receipts-" + args.phase + "-" + args.sha[:7] + ".tar")
with tarfile.open(archive, "x") as tar:
    for directory in evidence:
        assert directory.is_dir()
        for path in sorted(directory.rglob("*")):
            if path.is_file() and not path.is_symlink() and path.name != "container-before.json":
                tar.add(path, arcname=path.relative_to(qa / "evidence"), recursive=False)
docker_root = subprocess.check_output(["docker", "info", "--format", "{{.DockerRootDir}}"], text=True).strip()
components = [qa / "artifacts" / ("phone-gateway-" + args.sha),
              qa / "source" / ("phone-auth-" + args.sha), *evidence, archive,
              pathlib.Path(docker_root) / "containers" / data["Id"]]
if args.fixture:
    assert args.fixture == "phone-crash-" + args.sha
    components.append(qa / "fixtures" / args.fixture)
receipt = {
    "source_sha": args.sha, "phase": args.phase, "container": args.name,
    "recorded_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "prior_cumulative_bytes": args.prior_bytes, "archive": str(archive),
    "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    "archive_bytes": archive.stat().st_size, "all_own_jobs_terminal": True,
}
accounting = summary / "accounting.json"
for _ in range(3):
    receipt["components"] = [{"path": str(path), "allocated_bytes": int(subprocess.check_output(["du", "-sB1", str(path)], text=True).split()[0])} for path in components]
    receipt["new_allocated_bytes"] = sum(item["allocated_bytes"] for item in receipt["components"])
    receipt["cumulative_allocated_bytes"] = args.prior_bytes + receipt["new_allocated_bytes"]
    accounting.write_text(json.dumps(receipt, indent=2) + "\n")
assert receipt["cumulative_allocated_bytes"] <= 16777216
for path in [summary, summary / "terminal.json", accounting, archive]:
    os.chown(path, 1001, 1001)
print(json.dumps({key: value for key, value in receipt.items() if key != "components"}))
