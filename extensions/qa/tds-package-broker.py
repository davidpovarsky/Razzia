"""Bounded operator-side broker for this isolated TDS acceptance environment.

Run on the QA host as the Docker operator. No Docker socket is mounted in the
application. The existing pinned worker creates disposable networkless builders.
"""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import time

ROOT = pathlib.Path("/home/ubuntu/tadazz-design-system-20261110")
CONTAINER = "tadazz-design-system-qa-20261110"
IMAGE = "sha256:aea88c60c29d5160dfe5ae822179da4233ed882c3979b4d592f6cd86902e05c5"
WORKER_HASH = "7b591a69dd4aca951cf0f8224670c797696979085ae23c01d596ab99159d60d6"

parser = argparse.ArgumentParser()
parser.add_argument("run_id")
parser.add_argument("--seconds", type=int, default=1200)
args = parser.parse_args()
if not re.fullmatch(r"[a-zA-Z0-9-]{1,64}", args.run_id) or not 1 <= args.seconds <= 1800:
    raise SystemExit("Expected a unique bounded QA run identifier")
inspect = json.loads(subprocess.check_output(["docker", "inspect", CONTAINER]))[0]
evidence = (ROOT / "evidence").resolve(strict=True)
mounts = inspect["Mounts"]
if len(mounts) != 1 or mounts[0]["Destination"] != "/evidence" or pathlib.Path(mounts[0]["Source"]).resolve() != evidence:
    raise SystemExit("Unexpected QA mount boundary")
if inspect["HostConfig"]["PortBindings"]:
    raise SystemExit("QA must have no published ports")
worker = ROOT / f"tds-worker-{args.run_id}.py"
subprocess.run(["docker", "cp", f"{CONTAINER}:/cleanup/scripts/qa/package-build-worker.py", str(worker)], check=True)
if hashlib.sha256(worker.read_bytes()).hexdigest() != WORKER_HASH:
    raise SystemExit("Worker differs from the reviewed original")
subprocess.run(["docker", "image", "inspect", IMAGE], check=True, stdout=subprocess.DEVNULL)
store = evidence / "package-staging-tds12-20261112/extensions/packages"
store.mkdir(parents=True, exist_ok=True)
ready = evidence / f"phase-12-broker-{args.run_id}-ready.json"
done = evidence / f"phase-12-broker-{args.run_id}-done"
if ready.exists() or done.exists():
    raise SystemExit("Run identifier already used; choose a fresh identifier")
ready.write_text(json.dumps({"runId": args.run_id, "image": IMAGE, "startedAt": time.time(), "expiresAt": time.time() + args.seconds}))
deadline = time.monotonic() + args.seconds
while time.monotonic() < deadline and not done.exists():
    subprocess.run([sys.executable, str(worker), str(store), "--image", IMAGE], check=True, timeout=300)
    time.sleep(2)
print("QA broker completed", args.run_id, "done" if done.exists() else "deadline", flush=True)
