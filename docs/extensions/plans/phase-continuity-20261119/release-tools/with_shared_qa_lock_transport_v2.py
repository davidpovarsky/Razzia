"""Run only the reviewed transport proof under the shared Tadazz release lock.

Operational wrapper only: the canonical controller, artifacts and assertions
remain unchanged. A failure never certifies cleanup without observed evidence.
"""
from pathlib import Path
import datetime
import hashlib
import json
import queue
import re
import shlex
import subprocess
import sys
import threading
import time

ROOT = Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119")
DOCS = ROOT / "docs/extensions/plans/phase-continuity-20261119"
BASE = ROOT / "docs/extensions/plans/phase3-takeover-20261117"
SHA = "dccfd9d22a4673130704fea02bd80a8399498467"
CONTROLLER_SHA = "6ab6c244740f79c9475ab8009fe6b80fc650e425666cfee0c680d68f3d8f9e83"
CONTROLLER_BUDGET = 1980
LOCK_LEASE = 2200
CONTROLLER = ROOT / "extensions/qa/phase3-full-show/linux-browser-verify.py"
PREFIX = "tadazz-codex-transport-" + SHA[:12] + "-"

def release_events(output):
    return [item for line in output.splitlines() if line.strip()
            for item in [json.loads(line)] if item.get("released") is True]

if sys.argv[1:] != ["transport"]:
    raise SystemExit("Pass exactly transport; this v2 wrapper cannot run standard qualification")
assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() == SHA
assert not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=ROOT, text=True).strip()
assert hashlib.sha256(CONTROLLER.read_bytes()).hexdigest() == CONTROLLER_SHA
progress = json.loads((DOCS / "release-gates-progress.json").read_text(encoding="utf-8"))
assert progress["sourceSha"] == SHA and progress["status"] == "passed"
source_run = progress["sourceRun"]
assert re.fullmatch("tadazz-codex-" + SHA[:12] + r"-[a-f0-9]{8}", source_run)
standard = json.loads((DOCS / ("shared-qa-lock-standard-" + SHA[:12] + ".json")).read_text(encoding="utf-8"))
standard_release = release_events(standard["lockReleaseOutput"])
assert standard["sourceSha"] == SHA and standard["mode"] == "standard"
assert standard["status"] == "passed" and standard["exit"] == 0 and standard["lockHolderExit"] == 0
assert len(standard_release) == 1 and standard_release[0]["reason"] == "release"
record = DOCS / ("shared-qa-lock-transport-v2-" + SHA[:12] + ".json")
assert not record.exists(), "Inspect the earlier v2 invocation before any repeat"
existing_runs = {path.name for path in BASE.glob(PREFIX + "*") if path.is_dir()}
command = [sys.executable, str(CONTROLLER), source_run, "transport-race"]
state = {
    "sourceSha": SHA, "sourceRun": source_run, "mode": "transport",
    "wrapperVersion": 2, "controllerSha256": CONTROLLER_SHA,
    "controllerBudgetSeconds": CONTROLLER_BUDGET, "lockLeaseSeconds": LOCK_LEASE,
    "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "status": "acquiring", "productionChanged": False,
    "cleanup": {"status": "unverified", "reason": "No owned-run cleanup observation yet"},
    "acceptanceFailures": [],
}
with record.open("x", encoding="utf-8") as output:
    json.dump(state, output, indent=2)
    output.write("\n")

def save():
    record.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")

REMOTE = r'''
import fcntl,json,os,re,select,subprocess,sys
lease=2200
prefix="tadazz-codex-transport-dccfd9d22a46-"
lock=open("/run/lock/tadazz-mcp-deploy.lock","a")
try:
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:
    print(json.dumps({"held":False,"reason":"shared-lock-busy"}),flush=True)
    raise SystemExit(73)
try:
    names=subprocess.check_output(["docker","ps","--format","{{.Names}}"],text=True,timeout=20).splitlines()
    heavy=[name for name in names if name.startswith(("tadazz-codex-","tadazz-gallery-","tadazz-editor-pins-","tadazz-mcp-stage-","tadazz-mcp-restore-proof-"))]
    assert not heavy,heavy
    template='{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}}}'
    app=json.loads(subprocess.check_output(["docker","inspect","--format",template,"tadazz"],text=True,timeout=20))
    assert app["id"]=="090d26a2fe7dd98a43226288932b7387bb9ec847cee5e5e2ff6ef48b6444bf40"
    assert app["image"]=="sha256:56de89dd9ca496595980af84a7187b49fbff8c0cb563c3393c269d2b7c09d82a"
    assert app["running"] is True
    print(json.dumps({"held":True,"pid":os.getpid(),"path":"/run/lock/tadazz-mcp-deploy.lock","heavyQa":[],"productionContainer":app["id"],"productionImage":app["image"]}),flush=True)
    ready,_,_=select.select([sys.stdin],[],[],lease)
    line=sys.stdin.readline() if ready else ""
    request=json.loads(line) if line.strip() else {}
    reason=request.get("command") if line.strip() else ("lease-timeout" if not ready else "connection-eof")
    cleanup={"status":"unverified","reason":"No exact owned-run inspection"}
    if reason=="release":
        run=request.get("run")
        try:
            active=subprocess.check_output(["docker","ps","--filter","name=^/"+prefix,"--format","{{.Names}}"],text=True,timeout=15).splitlines()
            cleanup["activeOwnedRuns"]=active
            if isinstance(run,str) and re.fullmatch(re.escape(prefix)+r"[a-f0-9]{8}",run):
                template='{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"pid":{{.State.Pid}},"status":{{json .State.Status}},"oomKilled":{{json .State.OOMKilled}}}'
                observed=json.loads(subprocess.check_output(["docker","inspect","--format",template,run],text=True,timeout=15))
                cleanup.update(run=run,container=observed)
                assert observed["name"]=="/"+run
                if not active and observed["running"] is False and observed["pid"]==0:
                    cleanup.update(status="verified",reason="Exact owned QA container stopped; container process PID is zero")
                elif observed["running"]:
                    processes=subprocess.check_output(["docker","top",run,"-eo","pid,ppid,comm"],text=True,timeout=15)
                    cleanup["ownedProcessObservation"]=processes.splitlines()[:24]
                    cleanup["reason"]="Owned QA container or processes remain active"
            else:
                cleanup["reason"]="Exact newly created run name unavailable"
        except Exception as error:
            cleanup["error"]=type(error).__name__+": "+str(error)[:1000]
    print(json.dumps({"released":True,"reason":reason,"cleanupInspection":cleanup}),flush=True)
    if reason!="release":
        raise SystemExit(74)
finally:
    fcntl.flock(lock,fcntl.LOCK_UN)
    lock.close()
'''
assert "lease=" + str(LOCK_LEASE) in REMOTE
ssh = [
    "ssh", "-i", r"C:\Users\DAVID\.ssh\tadazz_oracle_2026",
    "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
    "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=10",
    "-o", "ServerAliveCountMax=3", "ubuntu@132.145.25.168",
    "sudo -n python3 -u -c " + shlex.quote(REMOTE),
]
holder = None
child = None
child_exit = None
holder_lost = False
explicit_release_verified = False
controller_interrupted = False
holder_lines = []
line_queue = queue.Queue()
reader = None
started = time.monotonic()

def collect_holder_output():
    for line in holder.stdout:
        holder_lines.append(line)
        line_queue.put(line)
    line_queue.put(None)

def fail(reason):
    if reason not in state["acceptanceFailures"]:
        state["acceptanceFailures"].append(reason)

try:
    holder = subprocess.Popen(ssh, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, bufsize=1)
    reader = threading.Thread(target=collect_holder_output, daemon=True)
    reader.start()
    line = line_queue.get(timeout=70)
    assert line, "Lock holder exited without admission"
    admitted = json.loads(line)
    state["admission"] = admitted
    assert admitted.get("held") is True, admitted
    state["status"] = "running"
    save()
    print(json.dumps({"sharedLock": admitted, "commandMode": "transport", "wrapperVersion": 2}), flush=True)
    child = subprocess.Popen(command, cwd=ROOT)
    state["controllerPid"] = child.pid
    save()
    deadline = time.monotonic() + CONTROLLER_BUDGET
    while child.poll() is None:
        if holder.poll() is not None and not holder_lost:
            holder_lost = True
            fail("Shared lock holder exited before controller completion")
            state["lockLossDetectedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            save()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            controller_interrupted = True
            fail("Controller exceeded the wrapper budget; descendant cleanup is unverified")
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=10)
            child_exit = 124
            break
        try:
            child.wait(timeout=min(1, remaining))
        except subprocess.TimeoutExpired:
            pass
    if child_exit is None:
        child_exit = child.returncode
    if child_exit != 0:
        fail("Transport controller did not pass")
except BaseException as error:
    fail(type(error).__name__ + ": " + str(error)[:2000])
    child_exit = child_exit if child_exit is not None else 1
finally:
    if child is not None and child.poll() is None:
        controller_interrupted = True
        fail("Controller interrupted; descendant cleanup is unverified")
        child.terminate()
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=10)
    new_runs = sorted({path.name for path in BASE.glob(PREFIX + "*") if path.is_dir()} - existing_runs)
    state["createdRunDirectories"] = new_runs
    owned_run = new_runs[0] if len(new_runs) == 1 else None
    if owned_run is None:
        fail("Exactly one new transport run directory was not observed")
    state.update(status="verifying-cleanup-and-release", controllerExit=child_exit,
                 controllerInterrupted=controller_interrupted,
                 seconds=round(time.monotonic() - started, 3))
    save()
    if holder is not None:
        if holder.poll() is None:
            try:
                holder.stdin.write(json.dumps({"command": "release", "run": owned_run}) + "\n")
                holder.stdin.flush()
                holder.stdin.close()
            except (BrokenPipeError, OSError):
                holder_lost = True
                fail("Could not request explicit lock release")
        else:
            holder_lost = True
            fail("Lock holder was absent before explicit release")
        try:
            holder.wait(timeout=65)
        except subprocess.TimeoutExpired:
            holder_lost = True
            fail("Lock release or cleanup observation exceeded its bounded wait")
            holder.terminate()
            try:
                holder.wait(timeout=10)
            except subprocess.TimeoutExpired:
                holder.kill()
                holder.wait(timeout=5)
        if reader is not None:
            reader.join(timeout=2)
        state["lockHolderExit"] = holder.returncode
        state["lockReleaseOutput"] = "".join(holder_lines[1:])[-12000:]
        state["lockStderr"] = holder.stderr.read(4000)
        try:
            events = release_events(state["lockReleaseOutput"])
            if len(events) != 1 or events[0]["reason"] != "release":
                fail("Lock did not end with exactly one explicit release acknowledgement")
            else:
                explicit_release_verified = True
                state["ownedContainerCleanup"] = events[0]["cleanupInspection"]
                if events[0]["cleanupInspection"].get("status") != "verified":
                    fail("Owned QA container and process cleanup is unverified")
                elif not controller_interrupted and not holder_lost:
                    state["cleanup"] = events[0]["cleanupInspection"]
        except (KeyError, ValueError, TypeError) as error:
            fail("Invalid lock release observation: " + str(error)[:1000])
        if holder.returncode != 0:
            fail("Lock holder exited unsuccessfully")
    else:
        fail("Lock holder did not start")
    if holder_lost:
        fail("Shared lock continuity was lost")
    if controller_interrupted:
        state["cleanup"] = {
            "status": "unverified",
            "reason": "Only the direct local controller was terminated; its descendants require inspection",
            "ownedContainerObservation": state.get("ownedContainerCleanup"),
        }
    state["lockContinuityVerified"] = (
        not holder_lost and state.get("lockHolderExit") == 0 and explicit_release_verified
    )
    passed = child_exit == 0 and not state["acceptanceFailures"] and state["cleanup"]["status"] == "verified"
    state.update(exit=0 if passed else (child_exit if child_exit not in (None, 0) else 1),
                 status="passed" if passed else "failed",
                 finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    save()
print(json.dumps(state), flush=True)
raise SystemExit(state["exit"])
