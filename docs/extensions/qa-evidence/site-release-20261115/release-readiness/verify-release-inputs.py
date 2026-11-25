"""Read-only, fixed-target release input audit. Never creates release controls."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
from datetime import datetime, timezone

TARGET = "dd1401638311a15212e52dcf0153b759003feb83fbce89c6b2756c9ff6732891"
IMAGE = "sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346"
START = "2026-11-12T03:38:48.157101207Z"
CANDIDATE = "sha256:54d162faae23681b56279d85b8dfa1243c6a9fb8fd62f5bb87c91479f7f4a79d"
ROOT = Path("/home/ubuntu/tadazz-unified-site-20261115-31b3cb0")
CONTROL = Path("/home/ubuntu/tadazz-release-control")
PINS = {
    "base-web-inventory.json": "f79f270e5be9662e3f5b36c7de9bebb7077da387d92cfd37ddceaac7e1817ca9",
    "candidate-web-inventory.json": "3f7b3942cca983f09a6fd15d335ac7b01895fc5c9530dd339ac0721a59a20b57",
    "artifact.sha256": "406a22eadb840f0ac0c8fd269ed2444287157eadbbf15f1779c4a967d2507730",
}
PROTECTED = {
    "/app/socket/index.cjs": "83f75aac39d14e92eb849cca17d3848e13dd140fee5ce3a1c946694c289d6476",
    "/etc/nginx/nginx.conf": "ca4278d6b81120988a6056c2a71891ea2719aad4535d2fc4f7ab7ac8da560c2f",
    "/etc/nginx/http.d/default.conf": "3edfd96a46ed0346c2631ca30cdfd206e300a2637f3f86afa10b966dd657a0e2",
    "/etc/nginx/tadazz/server.conf": "17e42c8281fd9a0f673e87332f02f6130e8f471a4a977b0bba26389ef083ea7f",
    "/etc/supervisord.conf": "d58d111a1d4dfb0e936f0fa0048cc61ee120ff52979980bb57d8bbbee683c26b",
}
ENV = {"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "DOCKER_CONFIG": "/nonexistent"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path, limit=8 * 1024 * 1024):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ValueError("nonregular or oversized public input")
        data = b""
        while len(data) <= limit:
            chunk = os.read(fd, min(1024 * 1024, limit + 1 - len(data)))
            if not chunk:
                break
            data += chunk
        if len(data) != info.st_size:
            raise ValueError("public input changed")
        return data
    finally:
        os.close(fd)


def inventory(root):
    result = {}
    device = os.lstat(root).st_dev
    for parent, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            path = Path(parent) / name
            info = os.lstat(path)
            if info.st_dev != device or stat.S_ISLNK(info.st_mode):
                raise ValueError("public tree symlink/device crossing")
            if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
                raise ValueError("public tree special entry")
        for name in files:
            path = Path(parent) / name
            result[path.relative_to(root).as_posix()] = sha(read(path))
    return result


def inspect():
    obj = json.loads(subprocess.check_output(
        ["/usr/bin/docker", "--host", "unix:///var/run/docker.sock", "inspect", TARGET],
        env=ENV, timeout=15,
    ))[0]
    if obj["Id"] != TARGET or obj["Image"] != IMAGE or obj["State"]["StartedAt"] != START or not obj["State"]["Running"]:
        raise ValueError("production identity changed")
    return obj


def main():
    before = inspect()
    pid = before["State"]["Pid"]
    proc = Path("/proc") / str(pid)
    process_start = (proc / "stat").read_text().split(")", 1)[1].split()[19]
    # /proc/PID/root is the sole intentional symlink, bounded by two identity checks.
    target_root = proc / "root"
    for part in (target_root / "app", target_root / "app/web"):
        if not stat.S_ISDIR(os.lstat(part).st_mode):
            raise ValueError("unsafe public root")
    inputs = {name: read(ROOT / name, 262144) for name in PINS}
    if any(sha(inputs[name]) != pin for name, pin in PINS.items()):
        raise ValueError("retained manifest changed")
    base = json.loads(inputs["base-web-inventory.json"])["files"]
    candidate = json.loads(inputs["candidate-web-inventory.json"])["files"]
    artifact = {name: digest for digest, name in (line.split("  ", 1) for line in inputs["artifact.sha256"].decode().splitlines())}
    live = inventory(target_root / "app/web")
    built = inventory(ROOT / "web")
    if live != base or built != artifact or len(base) != 202 or len(candidate) != 242 or len(artifact) != 152:
        raise ValueError("public base/artifact inventory mismatch")
    protected = {name: sha(read(target_root / name.lstrip("/"))) for name in PROTECTED}
    if protected != PROTECTED:
        raise ValueError("protected executable/config bytes changed")
    image = json.loads(subprocess.check_output(
        ["/usr/bin/docker", "image", "inspect", CANDIDATE], env=ENV, timeout=15,
    ))[0]
    if image["Id"] != CANDIDATE or image["Config"].get("Labels", {}).get("org.opencontainers.image.revision") != "31b3cb084efeb50dced6952498e9703cb47dc45c":
        raise ValueError("candidate image identity changed")
    after = inspect()
    if after["State"]["Pid"] != pid or (proc / "stat").read_text().split(")", 1)[1].split()[19] != process_start:
        raise ValueError("production process identity changed")
    mounts = [{key: mount.get(key) for key in ("Type", "Source", "Destination", "RW")} for mount in after["Mounts"]]
    expected_mounts = [{"Type": "bind", "Source": "/var/lib/tadazz-release-5312660/config", "Destination": "/app/config", "RW": True}]
    if mounts != expected_mounts or (after["HostConfig"].get("Tmpfs") or {}):
        raise ValueError("production mount/tmpfs contract changed")
    fs = os.statvfs(ROOT)
    report = {
        "captured_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "read-only fixed public files and sanitized Docker metadata; no customer/config content",
        "target": TARGET, "image": IMAGE, "started": START,
        "mounts": mounts, "tmpfs": after["HostConfig"].get("Tmpfs") or {},
        "restart_policy": after["HostConfig"]["RestartPolicy"],
        "manifest_pins": PINS, "base_files_verified": len(live), "artifact_files_verified": len(built),
        "candidate_manifest_files": len(candidate), "protected_bytes": protected,
        "candidate_image": CANDIDATE, "candidate_image_labels": image["Config"].get("Labels", {}),
        "installed_helper_sha256": sha(read(ROOT / "atomic-web-publish.py", 262144)),
        "reviewed_helper_sha256": "352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2",
        "size_receipt_present": (ROOT / "public-file-sizes-and-controls.json").exists(),
        "control_directory_present": CONTROL.exists(),
        "production_stage_present": (target_root / "app/.tadazz-web-release-31b3cb0").exists(),
        "free_bytes": fs.f_bavail * fs.f_frsize,
        "permission": "no release controls provisioned; no production action authorized/executed",
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
