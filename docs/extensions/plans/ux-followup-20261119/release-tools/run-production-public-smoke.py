"""Run only after the coordinator confirms production deployment and observation.
No product or Git writes; only the isolated, guarded public-browser smoke.
"""
import argparse
import json
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[3]
DOCS = ROOT / "docs/extensions/plans/ux-followup-20261119"
NODE = pathlib.Path(r"C:\Users\DAVID\.local\tools\node-v24.22.1-win-x64\node.exe")
parser = argparse.ArgumentParser()
parser.add_argument("--expected-revision", required=True)
parser.add_argument("--identity-proof", type=pathlib.Path, default=DOCS / "post-deploy-observation.json")
parser.add_argument("--deployment-execution", type=pathlib.Path, default=DOCS / "deployment-deploy-execution.json")
parser.add_argument("--out", type=pathlib.Path, default=DOCS / "production-public-smoke")
args = parser.parse_args()
if args.out.exists():
    raise SystemExit("OUTPUT_ALREADY_EXISTS_PRESERVE_EVIDENCE")
command = [str(NODE), str(pathlib.Path(__file__).with_name("production-public-smoke.mjs")),
           "--expected-revision", args.expected_revision, "--identity-proof", str(args.identity_proof),
           "--deployment-execution", str(args.deployment_execution), "--out", str(args.out.resolve())]
started = time.monotonic()
process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace",
                           creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
timed_out = False
forced_tree_cleanup = None
try:
    stdout, stderr = process.communicate(timeout=150)
except subprocess.TimeoutExpired:
    timed_out = True
    # This PID is the still-running child created above. No process-name or port kill.
    if process.poll() is None:
        cleanup = subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                 capture_output=True, text=True, timeout=15)
        forced_tree_cleanup = {"targetOwnedNodePid": process.pid, "exit": cleanup.returncode}
    stdout, stderr = process.communicate(timeout=15)
exit_code = 124 if timed_out else process.returncode
result = {"kind": "production-public-browser-smoke-execution", "exit": exit_code,
          "expectedRevision": args.expected_revision, "seconds": round(time.monotonic() - started, 3),
          "timedOut": timed_out, "ownedNodePid": process.pid, "forcedTreeCleanup": forced_tree_cleanup,
          "stdout": stdout[-8000:], "stderr": stderr[-5000:]}
receipt_path = args.out / "receipt.json"
# Refused deployment guards must not create or overwrite evidence.
if receipt_path.is_file():
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("nodePid") == process.pid and receipt.get("identity", {}).get("verified") is True and receipt["identity"].get("sourceSha") == args.expected_revision:
        (args.out / "execution.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result), flush=True)
raise SystemExit(exit_code)
