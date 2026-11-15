"""Prepared SERVER runner; no execution until a separate explicit root grant.
No source clone/install/pnpm/image pull, no original-fixture mutation or retries.
"""
from pathlib import Path
import argparse, datetime, hashlib, json, os, re, shutil, signal, subprocess, time

ROOT = Path("/home/ubuntu/tadazz-hq-qa-20261115")
def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-plan-sha256", required=True)
    parser.add_argument("--expected-transfer-sha256", required=True)
    parser.add_argument("--root-grant-id", required=True)
    parser.add_argument("--execute-after-root-grant", action="store_true")
    args = parser.parse_args()
    def interrupted(signum, frame):
        raise KeyboardInterrupt("external-stop:" + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGHUP, interrupted)
    if not args.execute_after_root_grant:
        raise SystemExit("HOLD: preparation only; explicit root execution grant required")
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,160}", args.root_grant_id) or not re.fullmatch(r"[a-f0-9]{64}", args.expected_plan_sha256) or not re.fullmatch(r"[a-f0-9]{64}", args.expected_transfer_sha256):
        raise SystemExit("HOLD: missing actual root grant reference")
    fixture = Path(__file__).resolve().parent
    if fixture.parent != ROOT / "fixtures":
        raise SystemExit("HOLD: runner is not in its exact new fixture namespace")
    plan_path = fixture / "overlay-plan.json"
    if digest(plan_path) != args.expected_plan_sha256:
        raise SystemExit("HOLD: reviewed plan hash mismatch")
    plan = json.loads(plan_path.read_text())
    if fixture != Path(plan["fixturePath"]):
        raise SystemExit("HOLD: namespace mismatch")
    evidence = Path(plan["evidencePath"])
    if evidence.parent != ROOT / "evidence" or evidence.exists():
        raise SystemExit("HOLD: evidence must be a fresh exact namespace")
    bounds = plan["resourceProposalNotGrant"]
    if os.getuid() == 0:
        raise SystemExit("HOLD: invoke as the approved unprivileged QA owner, not root")
    if shutil.disk_usage(ROOT).free < bounds["startFreeBytes"]:
        raise SystemExit("HOLD: fresh disk gate below proposed 2344 MiB")
    # The CLI flag/reference records the operator's already-issued grant; it does
    # not itself confer authority or replace root's resource/scope approval.
    if digest(fixture / "transfer-manifest.json") != args.expected_transfer_sha256:
        raise SystemExit("HOLD: reviewed transfer manifest mismatch")
    transfer = json.loads((fixture / "transfer-manifest.json").read_text())
    expected_names = {f["name"] for f in transfer["files"]} | {"transfer-manifest.json"}
    if {f.name for f in fixture.iterdir()} != expected_names:
        raise SystemExit("HOLD: unexpected uploaded file")
    if sum(f["bytes"] for f in transfer["files"]) + (fixture / "transfer-manifest.json").stat().st_size > bounds["maxUploadedBytes"]:
        raise SystemExit("HOLD: uploaded bytes exceed proposed 256 KiB")
    for f in transfer["files"]:
        file = fixture / f["name"]
        if file.is_symlink() or file.stat().st_size != f["bytes"] or digest(file) != f["sha256"]:
            raise SystemExit("HOLD: uploaded bytes mismatch " + f["name"])
    image = subprocess.check_output(["sudo", "-n", "docker", "image", "inspect", "--format", "{{.Id}}", plan["image"]], timeout=15).decode().strip()
    if image != plan["imageId"]:
        raise SystemExit("HOLD: existing image mismatch; no pull allowed")
    # A fresh unique name must never replace or stop another worker container.
    prior = subprocess.run(["sudo", "-n", "docker", "container", "inspect", plan["container"]], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
    if prior.returncode == 0:
        raise SystemExit("HOLD: proposed container name already exists")
    if b"No such" not in prior.stderr:
        raise SystemExit("HOLD: could not verify fresh container namespace")
    evidence.mkdir(mode=0o700)
    receipt = {"mode": "SERVER_ONE_COMPILED_INDEX_FILE_AND_FOCUSED_TC_ONLY", "planSha256": args.expected_plan_sha256, "transferManifestSha256": args.expected_transfer_sha256, "rootGrantReference": args.root_grant_id, "sourceCommit": plan["sourceCommit"], "commands": [], "status": "RUNNING", "freeBefore": shutil.disk_usage(ROOT).free, "testsExpected": plan["expectedTests"], "oldTests": "NOT_COLLECTED", "installClonePull": "NOT_RUN"}
    created = False
    create_attempted = False
    started = time.monotonic()
    container = plan["container"]

    def save():
        temp = evidence / "receipt.json.tmp"
        temp.write_text(json.dumps(receipt, indent=2) + "\n")
        temp.replace(evidence / "receipt.json")
    def new_bytes():
        return sum(f.stat().st_size for folder in (fixture, evidence) for f in folder.iterdir() if f.is_file())
    def budget():
        if shutil.disk_usage(ROOT).free < bounds["reserveFreeBytes"] or new_bytes() > bounds["maxNewDiskBytes"] or time.monotonic() - started > bounds["jobWatchdogSeconds"]:
            raise RuntimeError("HOLD: resource/job bound")
    def audit_physical():
        source = Path(plan["baseSource"])
        for record in plan["lowerCoreFiles"]:
            if digest(source / record["path"]) != record["sha256"]:
                raise RuntimeError("HOLD: immutable original core changed " + record["path"])
        for record in plan["allCoreFileMounts"]:
            path = Path(record["hostPath"])
            if path.is_symlink() or path.stat().st_size != record["bytes"] or digest(path) != record["sha256"]:
                raise RuntimeError("HOLD: exact core input changed " + str(path))
        for record in plan["scopedBaselineWitnesses"]:
            if digest(source / record["path"]) != record["sha256"]:
                raise RuntimeError("HOLD: scoped baseline changed " + record["path"])
        return {"status": "PASS", "oldLowerCore": 26, "acceptedEffectiveCore": 26, "newSourceFiles": 4, "baselineWitnesses": len(plan["scopedBaselineWitnesses"])}
    def command(label, command_args, timeout):
        budget()
        logfile = evidence / (label + ".log")
        began = time.monotonic()
        interrupted = None
        with logfile.open("wb") as output:
            process = subprocess.Popen(command_args, stdout=output, stderr=subprocess.STDOUT)
            try:
                while process.poll() is None:
                    budget()
                    if time.monotonic() - began > timeout or logfile.stat().st_size > bounds["logLimitBytes"]:
                        raise RuntimeError("HOLD: command watchdog/log limit " + label)
                    time.sleep(1)
            except BaseException as error:
                interrupted = str(error)
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)
        item = {"label": label, "argv": command_args, "exitCode": process.returncode, "wallSeconds": round(time.monotonic() - began, 3), "logSha256": digest(logfile)}
        if interrupted: item["interrupted"] = interrupted
        receipt["commands"].append(item)
        save()
        print(json.dumps(item), flush=True)
        if interrupted: raise RuntimeError(interrupted)
        budget()
        return process.returncode
    try:
        receipt["physicalBefore"] = audit_physical()
        budget()
        docker = ["sudo", "-n", "docker"]
        create = docker + ["run", "-d", "--pull=never", "--name", container, "--read-only", "--cpus=0.25", "--memory=2g", "--pids-limit=128", "--network=none", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=" + str(os.getuid()) + ":" + str(os.getgid()), "--workdir=/workspace/extensions", "--env", "XDG_DATA_HOME=/tmp/vitest-private", "--tmpfs", "/tmp:rw,nosuid,nodev,size=128m", "--mount", "type=bind,src=" + plan["baseSource"] + ",dst=/workspace,readonly", "--tmpfs", "/workspace/extensions/src/core/show-library:rw,nosuid,nodev,size=2m,mode=0555", "--mount", "type=bind,src=" + str(fixture) + ",dst=/plan,readonly", "--mount", "type=bind,src=" + str(evidence) + ",dst=/evidence"]
        for mount in plan["allCoreFileMounts"]:
            create += ["--mount", "type=bind,src=" + mount["hostPath"] + ",dst=" + mount["containerPath"] + ",readonly"]
        create += ["--label", "tadazz.qa.owner=show_engine", "--label", "tadazz.qa.source-bundle=" + plan["diagnosticSourceBundleSha256"], "--label", "tadazz.qa.root-grant=" + args.root_grant_id, "--entrypoint=sleep", plan["image"], "infinity"]
        # A startup failure is retained; never replace the old source with files
        # or change mount security/permissions to work around it.
        create_attempted = True
        if command("container-create", create, 20):
            raise RuntimeError("container startup failed; no mount fallback")
        created = True
        inspect = json.loads(subprocess.check_output(docker + ["inspect", container], timeout=15))[0]
        host = inspect["HostConfig"]
        receipt["allocation"] = {"imageId": inspect["Image"], "nanoCpus": host["NanoCpus"], "memoryBytes": host["Memory"], "network": host["NetworkMode"], "readonlyRootfs": host["ReadonlyRootfs"], "tmpfs": host["Tmpfs"], "user": inspect["Config"]["User"], "capDrop": host["CapDrop"], "ports": inspect["NetworkSettings"]["Ports"]}
        if inspect["Image"] != plan["imageId"] or host["NanoCpus"] != bounds["nanoCpus"] or host["Memory"] != bounds["memoryBytes"] or host["NetworkMode"] != "none" or not host["ReadonlyRootfs"] or inspect["NetworkSettings"]["Ports"] or host["CapDrop"] != ["ALL"] or inspect["Config"]["User"] != str(os.getuid()) + ":" + str(os.getgid()):
            raise RuntimeError("allocation boundary mismatch")
        prefix = docker + ["exec", container]
        if command("view-before", prefix + ["node", "/plan/audit-view.cjs"], 30):
            raise RuntimeError("effective view preflight failed")
        test_exit = command("compiled-index-tests", prefix + plan["testsCommand"], bounds["testsWatchdogSeconds"])
        report_path = evidence / "compiled-index-tests.json"
        if report_path.exists():
            result = json.loads(report_path.read_text())
            files = result.get("testResults", [])
            receipt["tests"] = {"exitCode": test_exit, "total": result.get("numTotalTests"), "passed": result.get("numPassedTests"), "failed": result.get("numFailedTests"), "pending": result.get("numPendingTests"), "files": [f.get("name") for f in files]}
            receipt["testScopeExact"] = len(files) == 1 and files[0].get("name", "").endswith("/src/core/show-library/compiled-index.test.ts") and result.get("numTotalTests") == plan["expectedTests"] and result.get("numPendingTests", 0) == 0 and result.get("numTodoTests", 0) == 0
        else:
            receipt["testScopeExact"] = False
        if not receipt["testScopeExact"]:
            raise RuntimeError("HOLD: test startup/collection/scope is not the exact focused53 file")
        type_exit = command("focused-types", prefix + plan["typesCommand"], bounds["typesWatchdogSeconds"])
        if command("view-after", prefix + ["node", "/plan/audit-view.cjs"], 30):
            raise RuntimeError("effective view after failed")
        receipt["physicalAfter"] = audit_physical()
        before_view = json.loads((evidence / "view-before.log").read_text())
        after_view = json.loads((evidence / "view-after.log").read_text())
        if before_view["toolFileHashes"] != after_view["toolFileHashes"]: raise RuntimeError("tool file hashes changed during run")
        receipt["status"] = "PASS" if test_exit == 0 and type_exit == 0 and receipt["testScopeExact"] and receipt["tests"].get("passed") == plan["expectedTests"] and receipt["tests"].get("failed") == 0 else "FAIL_RAW_RESULTS_RETAINED_NO_RETRY"
    except BaseException as error:
        receipt["status"] = "FAIL_OR_HOLD"
        receipt["failure"] = str(error)
    finally:
        if create_attempted:
            try:
                probe = subprocess.run(["sudo", "-n", "docker", "inspect", "--size", container], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
                if probe.returncode == 0:
                    detail = json.loads(probe.stdout)[0]
                    labels = detail["Config"].get("Labels") or {}
                    if labels.get("tadazz.qa.owner") != "show_engine" or labels.get("tadazz.qa.source-bundle") != plan["diagnosticSourceBundleSha256"] or labels.get("tadazz.qa.root-grant") != args.root_grant_id:
                        raise RuntimeError("HOLD: cleanup ownership label mismatch")
                    receipt["containerWritableBytes"] = detail["SizeRw"]
                    receipt["oomKilled"] = detail["State"]["OOMKilled"]
                    stop = subprocess.run(["sudo", "-n", "docker", "stop", "--timeout", "2", container], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=15)
                    remove = subprocess.run(["sudo", "-n", "docker", "rm", container], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=15)
                    (evidence / "release.log").write_bytes(stop.stdout + remove.stdout)
                    receipt["allocationReleased"] = remove.returncode == 0
                    if not receipt["allocationReleased"]:
                        raise RuntimeError("HOLD: own container removal failed")
                else:
                    if b"No such" in probe.stderr:
                        receipt["allocationReleased"] = True
                    else:
                        raise RuntimeError("HOLD: could not verify own container release")
            except BaseException as cleanup_error:
                receipt["status"] = "FAIL_OR_HOLD"
                receipt["cleanupFailure"] = str(cleanup_error)
        receipt["fixtureEvidenceBytes"] = new_bytes()
        receipt["newDiskBoundPassed"] = receipt["fixtureEvidenceBytes"] + receipt.get("containerWritableBytes", 0) <= bounds["maxNewDiskBytes"]
        if not receipt["newDiskBoundPassed"]: receipt["status"] = "FAIL_OR_HOLD"
        receipt["freeAfter"] = shutil.disk_usage(ROOT).free
        receipt["finishedUtc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        save()
        print(json.dumps({"status": receipt["status"], "allocationReleased": receipt.get("allocationReleased", False), "freeAfter": receipt["freeAfter"]}), flush=True)
    return 0 if receipt["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
