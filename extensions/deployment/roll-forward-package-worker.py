#!/usr/bin/env python3
"""Roll the owned package-builder override forward to a qualified immutable image.

The JSON plan pins the current override/script/image and unchanged base unit/timer,
plus the new source manifest, script, image and qualification receipt. No package
contents or credentials are read. The historical one-off upgrader stays intact.
"""

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import time
from dataclasses import dataclass


class GuardFailure(RuntimeError):
    pass


def need(condition, code):
    if not condition:
        raise GuardFailure(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_owned(path):
    need(path.is_absolute() and path.resolve() == path, "NONCANONICAL_PATH")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid(), "UNOWNED_FILE")
        need(not info.st_mode & 0o022 and info.st_size <= 2000000, "UNSAFE_FILE_MODE_OR_SIZE")
        return stream.read()


def write_new(path, data, mode=0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def replace_owned(path, expected, data, mode):
    need(digest(read_owned(path)) == expected, "OVERRIDE_RACED")
    temporary = path.with_name("." + path.name + "." + os.urandom(8).hex())
    write_new(temporary, data, mode)
    try:
        need(digest(read_owned(path)) == expected, "OVERRIDE_RACED")
        os.replace(temporary, path)
        sync_dir(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


@dataclass(frozen=True)
class Paths:
    unit: Path = Path("/etc/systemd/system/tadazz-package-builder.service")
    timer: Path = Path("/etc/systemd/system/tadazz-package-builder.timer")
    override: Path = Path("/etc/systemd/system/tadazz-package-builder.service.d/20-qualified-toolchain.conf")
    releases: Path = Path("/opt/tadazz-package-runtime/releases")
    lock: Path = Path("/run/lock/tadazz-mcp-deploy.lock")


class Operations:
    def run(self, argv):
        result = subprocess.run(argv, capture_output=True, text=True, timeout=30)
        need(result.returncode == 0, "COMMAND_FAILED:" + argv[0])
        return result.stdout.strip()

    def state(self, unit):
        properties = ["ActiveState", "MainPID", "ControlPID", "Result", "ExecMainStatus", "InvocationID", "ExecStart"]
        output = self.run(["systemctl", "show", unit, *["--property=" + name for name in properties]])
        return dict(line.split("=", 1) for line in output.splitlines() if "=" in line)

    def now(self):
        return time.monotonic()

    def wait(self):
        time.sleep(1)


def quiet(state):
    return state.get("ActiveState") in {"inactive", "failed"} and state.get("MainPID", "0") == state.get("ControlPID", "0") == "0"


def wait_quiet(ops, unit, seconds, previous_invocation=None):
    deadline = ops.now() + seconds
    while True:
        value = ops.state(unit)
        invoked = previous_invocation is None or bool(value.get("InvocationID")) and value["InvocationID"] != previous_invocation
        if quiet(value) and invoked:
            return value
        need(ops.now() < deadline, "BUILD_DID_NOT_SETTLE")
        ops.wait()


def restore_timer(ops, name, prior):
    ops.run(["systemctl", "start" if prior == "active" else "stop", name])
    need(ops.state(name).get("ActiveState") == prior, "TIMER_STATE_NOT_RESTORED")


def preflight(plan, paths, ops):
    for name in ["qualification_sha256", "source_manifest_sha256", "worker_sha256", "current_override_sha256", "current_worker_sha256", "unit_sha256", "timer_sha256"]:
        need(bool(re.fullmatch(r"[a-f0-9]{64}", plan[name])), "INVALID_DIGEST_PIN")
    need(bool(re.fullmatch(r"[a-f0-9]{40}", plan["revision"])), "INVALID_REVISION")
    for name in ["image", "current_image"]:
        need(bool(re.fullmatch(r"sha256:[a-f0-9]{64}", plan[name])), "INVALID_IMAGE_PIN")
    need(1 <= plan.get("wait_seconds", 600) <= 3600, "INVALID_WAIT_LIMIT")
    need(paths.override.parent.resolve() == paths.override.parent and not paths.override.parent.is_symlink(), "OVERRIDE_DIRECTORY_CHANGED")
    need(set(paths.override.parent.glob("*.conf")) == {paths.override}, "OTHER_ACTIVE_OVERRIDE")
    old = read_owned(paths.override)
    need(digest(old) == plan["current_override_sha256"], "CURRENT_OVERRIDE_CHANGED")
    lines = old.decode().splitlines()
    need(len(lines) == 3 and lines[:2] == ["[Service]", "ExecStart="] and lines[2].startswith("ExecStart="), "UNEXPECTED_OVERRIDE_FORMAT")
    command = shlex.split(lines[2].removeprefix("ExecStart="))
    need(len(command) == 5 and command[0] == "/usr/bin/python3" and command[3] == "--image", "UNEXPECTED_CURRENT_COMMAND")
    current_worker = Path(command[1])
    need(current_worker == Path(plan["current_worker"]) and current_worker.parent.parent == paths.releases and current_worker.name == "package-build-worker.py", "CURRENT_WORKER_PATH_CHANGED")
    need(bool(re.fullmatch(r"[a-f0-9]{40}", current_worker.parent.name)), "INVALID_CURRENT_RELEASE")
    need(command[4] == plan["current_image"], "CURRENT_IMAGE_CHANGED")
    need(bool(re.fullmatch(r"/[A-Za-z0-9_./-]+", command[2])) and ".." not in Path(command[2]).parts, "UNEXPECTED_STORE_PATH")
    current_bytes = read_owned(current_worker)
    need(digest(current_bytes) == plan["current_worker_sha256"], "CURRENT_WORKER_CHANGED")
    unit, timer = read_owned(paths.unit), read_owned(paths.timer)
    need(digest(unit) == plan["unit_sha256"] and digest(timer) == plan["timer_sha256"], "BASE_UNIT_OR_TIMER_CHANGED")
    current_state = ops.state(paths.unit.name)
    need(" ".join(command) in current_state.get("ExecStart", ""), "EFFECTIVE_CURRENT_COMMAND_CHANGED")
    timer_state = ops.state(paths.timer.name).get("ActiveState")
    need(timer_state in {"active", "inactive"}, "UNSTABLE_TIMER_STATE")
    root = Path(plan["qualified_root"])
    source = read_owned(root / "source/scripts/qa/package-build-worker.py")
    need(digest(source) == plan["worker_sha256"], "QUALIFIED_WORKER_CHANGED")
    manifest_bytes = read_owned(root / "source-manifest.json")
    need(digest(manifest_bytes) == plan["source_manifest_sha256"], "SOURCE_MANIFEST_CHANGED")
    manifest = json.loads(manifest_bytes)
    need(manifest["revision"] == plan["revision"] and manifest["appRevision"] == plan["revision"] and manifest["files"]["scripts/qa/package-build-worker.py"] == plan["worker_sha256"], "MANIFEST_PIN_MISMATCH")
    proof_bytes = read_owned(root / "matching-worker-proof.json")
    need(digest(proof_bytes) == plan["qualification_sha256"], "QUALIFICATION_CHANGED")
    proof = json.loads(proof_bytes)
    need(proof["ok"] is True and proof["revision"] == plan["revision"] and proof["image"] == plan["image"] and proof["sourceManifestSha256"] == plan["source_manifest_sha256"] and proof["workerSha256"] == plan["worker_sha256"], "QUALIFICATION_PIN_MISMATCH")
    accepted, rejected = proof["nativeAccept"], proof["belowMinimum"]
    need(proof["workerExit"] == 0 and proof["mediaValidated"] is True and accepted["phaseBeforeInstall"] == "preview-ready" and accepted["phaseAfterInstall"] == "installed" and accepted["nativeGames"] >= 1 and accepted["preservedCooldownSeconds"] == accepted["reexportPreservedCooldownSeconds"] and bool(accepted["preservedCooldownSeconds"]) and rejected == {"nativePreflightRejected": True, "workerRejected": True, "bundleProduced": False}, "WORKER_QUALIFICATION_INCOMPLETE")
    need(proof["productionChanged"] is False and proof["customerStorageAccessed"] is False, "QUALIFICATION_SCOPE_MISMATCH")
    for image in [plan["current_image"], plan["image"]]:
        inspected = json.loads(ops.run(["docker", "image", "inspect", image]))[0]
        need(inspected["Id"] == image, "IMAGE_CHANGED")
        if image == plan["image"]:
            labels = inspected["Config"]["Labels"]
            need(labels.get("org.opencontainers.image.revision") == plan["revision"] and labels.get("com.tadazz.package-worker.source-manifest-sha256") == plan["source_manifest_sha256"] and labels.get("com.tadazz.package-worker.sdk-sha256") == manifest["files"]["extensions/src/presentation/package-runtime/sdk.tsx"], "IMAGE_SOURCE_LABELS_CHANGED")
    return old, current_bytes, unit, timer, source, timer_state, command[2]


def roll_forward(plan, paths=Paths(), ops=None):
    ops = ops or Operations()
    lock = os.open(paths.lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        need(stat.S_ISREG(os.fstat(lock).st_mode), "UNSAFE_DEPLOY_LOCK")
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        old, current, unit, timer, source, timer_state, store = preflight(plan, paths, ops)
        report_dir = Path(plan["report_dir"])
        need(report_dir.is_absolute() and report_dir.parent.resolve() == report_dir.parent, "UNSAFE_REPORT_PATH")
        report_dir.mkdir(mode=0o700, exist_ok=False)
        for name, data in [("override.before", old), ("worker.before.py", current), ("unit.before", unit), ("timer.before", timer), ("plan.json", json.dumps(plan, sort_keys=True).encode())]:
            write_new(report_dir / name, data)
        sync_dir(report_dir)
        report = {"success": False, "revision": plan["revision"], "image": plan["image"], "previousImage": plan["current_image"], "previousTimerState": timer_state, "phase": "quiesce", "baseUnitUnchanged": True, "timerConfigurationUnchanged": True}
        new_bytes = None
        old_mode = stat.S_IMODE(paths.override.stat().st_mode)
        try:
            ops.run(["systemctl", "stop", paths.timer.name])
            wait_quiet(ops, paths.unit.name, plan.get("wait_seconds", 600))
            need(set(paths.override.parent.glob("*.conf")) == {paths.override}, "OTHER_ACTIVE_OVERRIDE")
            need(digest(read_owned(paths.unit)) == plan["unit_sha256"] and digest(read_owned(paths.timer)) == plan["timer_sha256"], "BASE_UNIT_OR_TIMER_RACED")
            need(digest(read_owned(Path(plan["current_worker"]))) == plan["current_worker_sha256"], "CURRENT_WORKER_RACED")
            release = paths.releases / plan["revision"]
            release.mkdir(mode=0o700, exist_ok=True)
            need(release.resolve() == release and not release.is_symlink(), "RELEASE_PATH_CHANGED")
            target = release / "package-build-worker.py"
            if target.exists():
                need(digest(read_owned(target)) == plan["worker_sha256"], "EXISTING_RELEASE_DIFFERS")
            else:
                write_new(target, source)
                sync_dir(release)
            new_command = "/usr/bin/python3 " + str(target) + " " + store + " --image " + plan["image"]
            new_bytes = ("[Service]\nExecStart=\nExecStart=" + new_command + "\n").encode()
            write_new(report_dir / "override.after", new_bytes, old_mode)
            sync_dir(report_dir)
            report["phase"] = "activate"
            replace_owned(paths.override, plan["current_override_sha256"], new_bytes, old_mode)
            ops.run(["systemctl", "daemon-reload"])
            state = ops.state(paths.unit.name)
            need(new_command in state.get("ExecStart", ""), "NEW_COMMAND_NOT_LOADED")
            previous_invocation = state.get("InvocationID", "")
            ops.run(["systemctl", "start", "--no-block", paths.unit.name])
            result = wait_quiet(ops, paths.unit.name, plan.get("wait_seconds", 600), previous_invocation)
            need(result.get("Result") == "success" and result.get("ExecMainStatus") == "0", "NEW_WORKER_RUN_FAILED")
            need(digest(read_owned(paths.override)) == digest(new_bytes), "NEW_OVERRIDE_RACED")
            need(digest(read_owned(paths.unit)) == plan["unit_sha256"] and digest(read_owned(paths.timer)) == plan["timer_sha256"], "BASE_UNIT_OR_TIMER_RACED")
            restore_timer(ops, paths.timer.name, timer_state)
            need(digest(read_owned(paths.override)) == digest(new_bytes), "NEW_OVERRIDE_RACED")
            report.update(success=True, phase="verified", workerRunPassed=True, timerStateRestored=True, overrideSha256=digest(new_bytes))
        except Exception as error:
            report["failureCode"] = str(error) if isinstance(error, GuardFailure) else type(error).__name__
            try:
                # Never stop a service build, including one that outlived a client wait.
                ops.run(["systemctl", "stop", paths.timer.name])
                wait_quiet(ops, paths.unit.name, plan.get("wait_seconds", 600))
                # Rename may have succeeded even if the subsequent directory fsync
                # failed. Reconcile actual bytes instead of a completed-call flag.
                current_override = digest(read_owned(paths.override))
                if current_override == plan["current_override_sha256"]:
                    report["overrideConfirmedPrevious"] = True
                elif new_bytes is not None and current_override == digest(new_bytes):
                    replace_owned(paths.override, digest(new_bytes), old, old_mode)
                    ops.run(["systemctl", "daemon-reload"])
                    need(digest(read_owned(paths.override)) == plan["current_override_sha256"], "ROLLBACK_BYTES_DIFFER")
                    report["rolledBackToExactPreviousOverride"] = True
                else:
                    raise GuardFailure("ROLLBACK_OVERRIDE_UNKNOWN")
                old_command = "/usr/bin/python3 " + plan["current_worker"] + " " + store + " --image " + plan["current_image"]
                need(old_command in ops.state(paths.unit.name).get("ExecStart", ""), "ROLLBACK_COMMAND_NOT_LOADED")
                need(digest(read_owned(paths.unit)) == plan["unit_sha256"] and digest(read_owned(paths.timer)) == plan["timer_sha256"], "BASE_UNIT_OR_TIMER_RACED")
                restore_timer(ops, paths.timer.name, timer_state)
                need(digest(read_owned(paths.override)) == plan["current_override_sha256"], "ROLLBACK_OVERRIDE_RACED")
                report["timerStateRestored"] = True
            except Exception as rollback_error:
                report["reconciliationRequired"] = True
                report["rollbackFailureCode"] = str(rollback_error) if isinstance(rollback_error, GuardFailure) else type(rollback_error).__name__
                try:
                    ops.run(["systemctl", "stop", paths.timer.name])
                    report["timerLeftPaused"] = ops.state(paths.timer.name).get("ActiveState") == "inactive"
                except Exception as pause_error:
                    report["pauseFailureCode"] = str(pause_error) if isinstance(pause_error, GuardFailure) else type(pause_error).__name__
        for field, file, expected in [("baseUnitUnchanged", paths.unit, plan["unit_sha256"]), ("timerConfigurationUnchanged", paths.timer, plan["timer_sha256"])]:
            try:
                report[field] = digest(read_owned(file)) == expected
            except Exception:
                report[field] = False
        if not report["baseUnitUnchanged"] or not report["timerConfigurationUnchanged"]:
            report.update(success=False, phase="reconciliation", reconciliationRequired=True)
            report.setdefault("failureCode", "BASE_UNIT_OR_TIMER_RACED")
            try:
                # A late external unit edit must never produce a success receipt.
                # Pause future invocations without overwriting or stopping its work.
                ops.run(["systemctl", "stop", paths.timer.name])
                need(ops.state(paths.timer.name).get("ActiveState") == "inactive", "TIMER_NOT_PAUSED")
                report["timerLeftPaused"] = True
                report["timerStateRestored"] = timer_state == "inactive"
            except Exception as pause_error:
                report["pauseFailureCode"] = str(pause_error) if isinstance(pause_error, GuardFailure) else type(pause_error).__name__
        report["finishedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        write_new(report_dir / "result.json", (json.dumps(report, indent=2) + "\n").encode())
        sync_dir(report_dir)
        return report
    finally:
        os.close(lock)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    args = parser.parse_args()
    need(os.geteuid() == 0, "ROOT_REQUIRED")
    os.umask(0o077)
    try:
        plan = json.loads(read_owned(args.plan))
        report = roll_forward(plan)
    except Exception as error:
        report = {"success": False, "phase": "preflight", "failureCode": str(error) if isinstance(error, GuardFailure) else type(error).__name__}
    print(json.dumps(report))
    return 0 if report["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
