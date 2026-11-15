#!/usr/bin/env python3
"""Review-only web publication proposal. Never run without independent QA/approval.

The CLI has fixed production identities and paths; the internal functions can be
called with synthetic constants by an isolated QA harness. No production command
is executed at import time. All payloads and backups contain public web files.
"""

import hashlib
import http.client
import errno
import io
import json
import os
import re
from pathlib import Path, PurePosixPath
import stat
import socket
import subprocess
import sys
import tarfile
import uuid
from dataclasses import dataclass, replace

CONTAINER = "dd1401638311a15212e52dcf0153b759003feb83fbce89c6b2756c9ff6732891"
IMAGE = "sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346"
STARTED = "2026-11-12T03:38:48.157101207Z"
OPERATOR = Path("/home/ubuntu/tadazz-unified-site-20261115-31b3cb0")
BASE_MANIFEST = "f79f270e5be9662e3f5b36c7de9bebb7077da387d92cfd37ddceaac7e1817ca9"
CANDIDATE_MANIFEST = "3f7b3942cca983f09a6fd15d335ac7b01895fc5c9530dd339ac0721a59a20b57"
ARTIFACT_MANIFEST = "406a22eadb840f0ac0c8fd269ed2444287157eadbbf15f1779c4a967d2507730"
SIZE_RECEIPT = "ff28b4363b86e3f7430ccc895872d0390c5943c6955f8f5e9003b83232ab99d9"
OLD_INDEX = "81a5fbe942c74398e002a17205bba112b9e021cef416b83756aa8fd2e76fdf6e"
NEW_INDEX = "9a9edaf33fbcdddc569b66fb1044c2280eb83732c958653019fb499c05681f71"
MAX_PAYLOAD = 128 * 1024 * 1024
MAX_TAR = 6 * 1024 * 1024
MAX_MANIFEST = 256 * 1024
MAX_FILE = 8 * 1024 * 1024  # Measured max 5,028,530 bytes; bounded headroom.
EXPECTED_MOUNTS = [("bind", "/app/config", "/var/lib/tadazz-release-5312660/config", True)]
LOCK_DIR = "/home/ubuntu/tadazz-release-control"
LOCK_NAME = "production-release.lock"
HOLD_NAME = "production-operation-hold.json"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def transition_exec_record(record, evidence):
    """Pure transition validation only; no Engine adapter or durable hold yet.

    A future trusted adapter must durably fence every returned state before
    taking the corresponding next action. Caller-supplied evidence alone is
    not proof of an Engine operation.
    """
    phase = record.get("phase")
    current_id = record.get("execId")
    kind = evidence.get("kind")
    if phase == "prepared" and kind == "created":
        child = evidence.get("execId")
        if not isinstance(child, str) or not re.fullmatch(r"[0-9a-f]{64}", child):
            raise ValueError("invalid exec id")
        return {**record, "phase": "created", "execId": child}
    if phase == "created" and kind == "persist-start-intent":
        return {**record, "phase": "start-intent"}
    if phase == "start-intent" and kind == "start-acknowledged":
        if evidence.get("execId") != current_id or evidence.get("positive") is not True:
            raise ValueError("start not proven")
        return {**record, "phase": "acknowledged"}
    if phase == "acknowledged" and kind == "child-running":
        if evidence.get("execId") != current_id or evidence.get("running") is not True:
            raise ValueError("child start not proven")
        return {**record, "phase": "started"}
    if phase == "started" and kind == "terminal-inspect":
        if (evidence.get("execId") != current_id or evidence.get("running") is not False
                or type(evidence.get("exitCode")) is not int
                or evidence.get("noOutstandingStart") is not True):
            raise ValueError("terminal state not proven")
        return {**record, "phase": "stopped", "exitCode": evidence["exitCode"],
                "failure": {"kind": "unclassified", "phase": None, "operation": None, "errno": None}}
    raise ValueError("invalid or ambiguous exec transition")


class DurableHold:
    """Host-only primitive under flock; not connected to the disabled runner.

    An absent or malformed/partially written record is never silently repaired.
    No expiry, delete, or administrative override is provided here.
    """
    def __init__(self, directory, lock_name=LOCK_NAME, owner_uid=None):
        self.directory = str(directory)
        self.lock_name = lock_name
        self.owner_uid = os.geteuid() if owner_uid is None else owner_uid
        self.parent = None
        self.lock = None

    def __enter__(self):
        import fcntl
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        self.parent = os.open(self.directory, flags)
        try:
            st = os.fstat(self.parent)
            if st.st_uid != self.owner_uid or stat.S_IMODE(st.st_mode) != 0o700:
                raise ValueError("untrusted control directory")
            self.lock = os.open(self.lock_name, os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK,
                                dir_fd=self.parent)
            st = os.fstat(self.lock)
            if (not stat.S_ISREG(st.st_mode) or st.st_uid != self.owner_uid
                    or stat.S_IMODE(st.st_mode) != 0o600 or st.st_nlink != 1):
                raise ValueError("untrusted control lock")
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *_):
        if self.lock is not None:
            os.close(self.lock)
            self.lock = None
        if self.parent is not None:
            os.close(self.parent)
            self.parent = None

    def _check_temp_files(self):
        if self.parent is None or self.lock is None:
            raise ValueError("control lock not held")
        if any(n.startswith(".operation-hold-") for n in os.listdir(self.parent)):
            raise ValueError("unfinished hold transition; preserve evidence")

    def read(self):
        self._check_temp_files()
        try:
            fd = os.open(HOLD_NAME, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                         dir_fd=self.parent)
        except FileNotFoundError:
            return None
        try:
            st = os.fstat(fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_uid != self.owner_uid
                    or stat.S_IMODE(st.st_mode) != 0o600 or st.st_nlink != 1
                    or st.st_size > 65536):
                raise ValueError("unsafe hold record")
            data = bytearray()
            while len(data) <= 65536:
                chunk = os.read(fd, min(4096, 65537 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
            if len(data) != st.st_size or len(data) > 65536:
                raise ValueError("hold record changed or oversized")
            value = json.loads(data)
            if not isinstance(value, dict):
                raise ValueError("malformed hold record")
            return value
        finally:
            os.close(fd)

    def _write_exclusive(self, name, value):
        raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
        if len(raw) > 65536:
            raise ValueError("hold record too large")
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=self.parent)
        try:
            if os.geteuid() != self.owner_uid:
                os.fchown(fd, self.owner_uid, -1)
            os.fchmod(fd, 0o600)
            view = memoryview(raw)
            while view:
                n = os.write(fd, view)
                if n <= 0:
                    raise OSError("short hold write")
                view = view[n:]
            os.fsync(fd)
        finally:
            os.close(fd)

    def create(self, value):
        if self.read() is not None:
            raise ValueError("operation hold already exists")
        self._write_exclusive(HOLD_NAME, value)
        os.fsync(self.parent)

    def replace(self, expected, updated):
        if self.read() != expected:
            raise ValueError("operation hold changed")
        temp = ".operation-hold-" + uuid.uuid4().hex
        self._write_exclusive(temp, updated)
        os.fsync(self.parent)
        os.replace(temp, HOLD_NAME, src_dir_fd=self.parent, dst_dir_fd=self.parent)
        os.fsync(self.parent)

    def complete(self, expected):
        if self.read() != expected or expected.get("phase") != "verified-disposition":
            raise ValueError("cannot close unverified hold")
        closed = {**expected, "phase": "closed"}
        self.replace(expected, closed)
        return closed

    def qualify_closed(self, expected):
        if self.read() != expected or expected.get("phase") != "closed":
            raise ValueError("closed hold cannot be qualified")
        fd = os.open(HOLD_NAME, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=self.parent)
        try:
            st = os.fstat(fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_uid != self.owner_uid
                    or stat.S_IMODE(st.st_mode) != 0o600 or st.st_nlink != 1):
                raise ValueError("unsafe closed hold")
            os.fsync(fd)
        finally:
            os.close(fd)
        os.fsync(self.parent)
        if self.read() != expected:
            raise ValueError("closed hold changed during qualification")


class _UnixEngineConnection(http.client.HTTPConnection):
    """Direct Engine socket: no detached launcher survives this process."""
    def __init__(self, socket_path):
        super().__init__("localhost", timeout=10)
        self.socket_path = socket_path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.socket_path)


@dataclass(frozen=True)
class FixtureTarget:
    container_id: str
    name: str
    nonce: str
    image: str
    started: str
    operator: str
    control: str
    receipt: str
    lock_name: str
    owner_uid: int
    helper_sha256: str
    mounts: tuple
    tmpfs: tuple

    def validate(self, engine):
        qa_root = "/home/ubuntu/tadazz-hq-qa-20261115/"
        if (not re.fullmatch(r"[0-9a-f]{64}", self.container_id)
                or self.container_id == CONTAINER or self.name == "tadazz"
                or not self.name.startswith("tadazz-atomic-qa-")
                or not re.fullmatch(r"[a-zA-Z0-9_-]{12,80}", self.nonce)
                or self.image != IMAGE or not self.started
                or not re.fullmatch(r"[0-9a-f]{64}", self.helper_sha256)
                or not re.fullmatch(r"[a-zA-Z0-9_.-]+", self.lock_name)):
            raise ValueError("invalid fixture identity")
        for path in (self.operator, self.control):
            if not path.startswith(qa_root) or os.path.realpath(path) != path:
                raise ValueError("fixture path outside QA root or symlinked")
            st = os.stat(path, follow_symlinks=False)
            if not stat.S_ISDIR(st.st_mode) or st.st_uid != self.owner_uid:
                raise ValueError("unowned fixture path")
        common = os.path.commonpath([self.operator, self.control])
        if (common in (self.operator, self.control) or str(OPERATOR) == self.operator
                or self.control == LOCK_DIR):
            raise ValueError("production or overlapping fixture paths")
        if self.receipt != self.control + "/public-file-sizes-and-controls.json":
            raise ValueError("fixture receipt not in private control directory")
        obj = engine._request_json("GET", "/containers/" + self.container_id + "/json")
        state, config, host = obj["State"], obj["Config"], obj["HostConfig"]
        mounts = tuple(sorted((m.get("Type"), m.get("Destination"), m.get("Source"), m.get("RW"))
                              for m in obj.get("Mounts", [])))
        tmpfs = tuple(sorted((host.get("Tmpfs") or {}).items()))
        if (obj.get("Id") != self.container_id or obj.get("Name") != "/" + self.name
                or obj.get("Image") != self.image or not state.get("Running")
                or state.get("StartedAt") != self.started
                or (config.get("Labels") or {}).get("codex.synthetic.nonce") != self.nonce
                or host.get("NetworkMode") != "none" or (host.get("PortBindings") or {})
                or (obj.get("NetworkSettings", {}).get("Ports") or {})
                or host.get("NanoCpus") != 250000000 or host.get("Memory") != 256 * 1024 * 1024
                or mounts != tuple(sorted(self.mounts)) or tmpfs != tuple(sorted(self.tmpfs))):
            raise ValueError("fixture target mismatch")
        if any(kind != "bind" or not isinstance(src, str) or not src.startswith(qa_root)
               or os.path.realpath(src) != src for kind, _, src, _ in mounts):
            raise ValueError("fixture mount is not an owned QA bind")

    def verify_helper(self):
        if sha(Path(__file__).read_bytes()) != self.helper_sha256:
            raise ValueError("helper pin mismatch")


@dataclass(frozen=True)
class ProductionTarget:
    # All values are constructed by run(), never supplied by the CLI.
    container_id: str
    name: str
    nonce: str
    image: str
    started: str
    operator: str
    control: str
    receipt: str
    lock_name: str
    owner_uid: int
    helper_sha256: str
    mounts: tuple
    tmpfs: tuple

    def validate(self, engine):
        if (self.container_id != CONTAINER or self.name != "tadazz" or self.image != IMAGE
                or self.started != STARTED or self.operator != str(OPERATOR)
                or self.control != LOCK_DIR or self.lock_name != LOCK_NAME
                or self.receipt != str(OPERATOR / "public-file-sizes-and-controls.json")
                or self.mounts != tuple(EXPECTED_MOUNTS) or self.tmpfs != ()
                or self.nonce != "production" or self.owner_uid != 1001
                or not re.fullmatch(r"[0-9a-f]{64}", self.helper_sha256)):
            raise ValueError("production target not fixed")
        obj = engine._request_json("GET", "/containers/" + CONTAINER + "/json")
        state = obj["State"]
        actual_tmpfs = tuple(sorted((obj["HostConfig"].get("Tmpfs") or {}).items()))
        actual = tuple(sorted((m.get("Type"), m.get("Destination"), m.get("Source"), m.get("RW"))
                              for m in obj.get("Mounts", [])))
        if (obj.get("Id") != CONTAINER or obj.get("Name") != "/tadazz"
                or obj.get("Image") != IMAGE or state.get("Running") is not True
                or state.get("StartedAt") != STARTED or actual != tuple(sorted(EXPECTED_MOUNTS))
                or actual_tmpfs != self.tmpfs):
            raise ValueError("production target mismatch")

    def verify_helper(self):
        if sha(Path(__file__).read_bytes()) != self.helper_sha256:
            raise ValueError("helper pin mismatch")


class EngineAdapter:
    """Unconnected draft: only exec-create and inspect, never exec-start.

    The caller must hold the control flock and durably persist a prepared
    operation record before create. The actual source runner is disabled.
    """
    def __init__(self, socket_path="/var/run/docker.sock"):
        self.socket_path = socket_path

    def _request_json(self, method, path, body=None):
        connection = _UnixEngineConnection(self.socket_path)
        try:
            raw = None if body is None else json.dumps(body, separators=(",", ":")).encode()
            connection.request(method, "/v1.52" + path, body=raw,
                               headers={"Content-Type": "application/json"})
            response = connection.getresponse()
            data = response.read(65537)
            if response.status not in (200, 201) or len(data) > 65536:
                raise ValueError("Engine request failed or response too large")
            value = json.loads(data)
            if not isinstance(value, dict):
                raise ValueError("invalid Engine response")
            return value
        finally:
            connection.close()

    def create(self, hold, record, target, action):
        target.validate(self)
        container_id = target.container_id
        if (hold.read() != record or record.get("phase") != "prepared"
                or record.get("targetId") != container_id
                or record.get("action") != action
                or action not in {"publish", "rollback", "reconcile"}
                or not re.fullmatch(r"[0-9a-f]{64}", container_id)):
            raise ValueError("untrusted or unpersisted exec create")
        result = self._request_json(
            "POST", "/containers/" + container_id + "/exec",
            {"AttachStdin": True, "AttachStdout": True, "AttachStderr": True,
             "Tty": False, "Cmd": ["python3", "-B", "-c", INNER, action]},
        )
        updated = transition_exec_record(record, {"kind": "created", "execId": result.get("Id")})
        hold.replace(record, updated)
        return updated

    def inspect(self, exec_id, container_id):
        if not all(isinstance(x, str) and re.fullmatch(r"[0-9a-f]{64}", x)
                   for x in (exec_id, container_id)):
            raise ValueError("invalid pinned identity")
        value = self._request_json("GET", "/exec/" + exec_id + "/json")
        if (value.get("ID") != exec_id or value.get("ContainerID") != container_id
                or type(value.get("Running")) is not bool):
            raise ValueError("Engine exec identity mismatch")
        return {"execId": exec_id, "containerId": container_id,
                "running": value["Running"], "exitCode": value.get("ExitCode")}

    def start_once(self, hold, record, target, payload):
        if (hold.read() != record or record.get("phase") != "created"
                or record.get("targetId") != target.container_id
                or not isinstance(payload, bytes) or len(payload) > MAX_TAR):
            raise ValueError("untrusted exec-start request")
        target.validate(self)
        intent = transition_exec_record(record, {"kind": "persist-start-intent"})
        hold.replace(record, intent)  # No later start retry is permitted.
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(30)
        try:
            sock.connect(self.socket_path)
            body = b'{"Detach":false,"Tty":false}'
            header = ("POST /v1.52/exec/" + record["execId"] + "/start HTTP/1.1\r\n"
                      "Host: localhost\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n"
                      "Content-Type: application/json\r\nContent-Length: " + str(len(body)) + "\r\n\r\n").encode()
            sock.sendall(header + body)
            received = bytearray()
            while b"\r\n\r\n" not in received:
                block = sock.recv(1)  # Never consume the hijacked data stream.
                if not block or len(received) >= 65536:
                    raise ValueError("ambiguous Engine start acknowledgement")
                received.extend(block)
            status = bytes(received).split(b"\r\n", 1)[0].split()
            if len(status) < 2 or status[1] not in (b"101", b"200"):
                raise ValueError("Engine start not acknowledged")
            ack = transition_exec_record(intent, {"kind": "start-acknowledged", "execId": record["execId"], "positive": True})
            hold.replace(intent, ack)
            seen = self.inspect(record["execId"], target.container_id)
            running = transition_exec_record(ack, {"kind": "child-running", "execId": seen["execId"], "running": seen["running"]})
            hold.replace(ack, running)
            sock.sendall(payload)
            sock.shutdown(socket.SHUT_WR)
            chunks = bytearray()
            while True:
                block = sock.recv(65536)
                if not block:
                    break
                chunks.extend(block)
                if len(chunks) > 1024 * 1024:
                    raise ValueError("Engine response exceeds bound")
        finally:
            sock.close()
        seen = self.inspect(record["execId"], target.container_id)
        stopped = transition_exec_record(running, {"kind": "terminal-inspect", "execId": seen["execId"],
            "running": seen["running"], "exitCode": seen["exitCode"], "noOutstandingStart": True})
        hold.replace(running, stopped)
        return stopped, bytes(chunks)


def build_payload(operator, receipt_dir):
    base_raw, new_raw, added, sizes_raw, sizes = load_inputs(operator, receipt_dir)
    new = json.loads(new_raw)["files"]
    bodies = sum(sizes["candidate"]["files"][n]["bytes"] for n in added + ["index.html"])
    cap = bodies + len(base_raw) + len(new_raw) + len(sizes_raw) + 1024 * 1024
    if cap > MAX_TAR:
        raise ValueError("calculated fixture payload too large")

    class LimitedBuffer(io.BytesIO):
        def write(self, value):
            if self.tell() + len(value) > cap:
                raise ValueError("fixture tar budget exceeded")
            return super().write(value)

    result = LimitedBuffer()
    with tarfile.open(fileobj=result, mode="w") as archive:
        members = {"base.json": base_raw, "candidate.json": new_raw, "sizes.json": sizes_raw}
        for name in added + ["index.html"]:
            length = sizes["candidate"]["files"][name]["bytes"]
            data = read_regular(operator / "web" / name, MAX_FILE, length, operator)
            if sha(data) != new[name]:
                raise ValueError("payload changed after verification")
            members["payload/" + name] = data
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return result.getvalue()


def parse_engine_stream(data):
    output = {1: bytearray(), 2: bytearray()}
    cursor = 0
    while cursor < len(data):
        if len(data) - cursor < 8:
            raise ValueError("truncated Engine stream")
        tag = data[cursor]
        if tag not in output or data[cursor + 1:cursor + 4] != b"\0\0\0":
            raise ValueError("invalid Engine stream")
        size = int.from_bytes(data[cursor + 4:cursor + 8], "big")
        cursor += 8
        if size > len(data) - cursor:
            raise ValueError("truncated Engine frame")
        output[tag].extend(data[cursor:cursor + size])
        cursor += size
    return bytes(output[1]), bytes(output[2])


def classify_child_failure(observation, exit_code):
    if exit_code == 0:
        if observation.get("observation") != "complete":
            return {"kind": "unclassified", "phase": None, "operation": None, "errno": None}
        return {"kind": "none", "phase": observation.get("phase"), "operation": None, "errno": None}
    phase, operation, number = observation.get("phase"), observation.get("operation"), observation.get("errno")
    error = observation.get("error")
    chain, secondary, journal_status = observation.get("chain"), observation.get("secondary"), observation.get("failureJournal")
    if not isinstance(phase, str) or not isinstance(operation, str) or not isinstance(error, str):
        return {"kind": "unclassified", "phase": None, "operation": None, "errno": None}
    if len(phase) > 80 or len(operation) > 512 or len(error) > 80 or (number is not None and type(number) is not int):
        return {"kind": "unclassified", "phase": None, "operation": None, "errno": None}
    if (not isinstance(chain, list) or len(chain) > 9 or journal_status not in {"written", "failed", "not-attempted"}
            or (secondary is not None and not isinstance(secondary, dict))
            or len(json.dumps({"chain": chain, "secondary": secondary})) > 8192):
        return {"kind": "unclassified", "phase": phase, "operation": operation, "errno": number, "error": error}
    benign = (number == errno.EINTR and error == "InterruptedError" and phase == "directories-fenced"
              and chain == [] and secondary is None and journal_status == "written"
              and (operation == "journal:published" or operation.startswith("journal:rolled-back-")))
    kind = "benign-interrupted-journal" if benign else "storage-or-unknown"
    return {"kind": kind, "phase": phase, "operation": operation, "errno": number, "error": error,
            "chain": chain, "secondary": secondary, "failureJournal": journal_status}


def recovery_eligible(record, action):
    failure = record.get("failure")
    if record.get("phase") != "stopped" or action not in {"rollback", "reconcile"} or not isinstance(failure, dict):
        return False
    if failure.get("kind") == "none":
        return record.get("exitCode") == 0 and failure.get("phase") == "journal-fenced"
    if failure.get("kind") == "benign-interrupted-journal":
        operation = failure.get("operation")
        return (type(record.get("exitCode")) is int and record["exitCode"] != 0 and failure.get("phase") == "directories-fenced"
                and failure.get("error") == "InterruptedError" and failure.get("errno") == errno.EINTR
                and failure.get("chain") == [] and failure.get("secondary") is None
                and failure.get("failureJournal") == "written"
                and isinstance(operation, str)
                and (operation == "journal:published" or operation.startswith("journal:rolled-back-")))
    return False


def verify_hq_lease(target, action):
    control = Path(target.control)
    raw = read_regular(control / "hq-lease.json", 65536, operator=control)
    lease = json.loads(raw)
    if (not isinstance(lease, dict) or lease.get("targetId") != target.container_id
            or lease.get("image") != target.image or lease.get("started") != target.started
            or lease.get("helper") != target.helper_sha256
            or not isinstance(lease.get("nonce"), str)
            or not re.fullmatch(r"[0-9a-f]{32}", lease["nonce"])
            or not isinstance(lease.get("actions"), list) or action not in lease["actions"]):
        raise ValueError("manager lease missing or does not match")
    return sha(raw)


def _coordinate(target, action):
    if type(target) not in {FixtureTarget, ProductionTarget} or action not in {"publish", "rollback", "reconcile"}:
        raise ValueError("explicit target and action required")
    engine = EngineAdapter()
    classification = None
    filesystem_phase = None
    recovery_of = None
    identity = "unverified"
    try:
        with DurableHold(target.control, target.lock_name, target.owner_uid) as hold:
            if type(target) is ProductionTarget:
                control = Path(target.control)
                approved = read_regular(control / "approved-helper.sha256", 128, operator=control).decode("ascii").strip()
                if not re.fullmatch(r"[0-9a-f]{64}", approved):
                    raise ValueError("invalid manager-approved helper pin")
                target = replace(target, helper_sha256=approved)
            target.verify_helper()
            target.validate(engine)
            lease_hash = verify_hq_lease(target, action)
            payload = build_payload(Path(target.operator), Path(target.receipt).parent)
            prior = hold.read()
            history = []
            if prior is not None:
                if (prior.get("targetId") != target.container_id or prior.get("image") != target.image
                        or prior.get("started") != target.started or prior.get("helper") != target.helper_sha256
                        or prior.get("inputHash") != sha(payload)
                        or prior.get("operator") != target.operator or prior.get("control") != target.control
                        or prior.get("name") != target.name or prior.get("fixtureNonce") != target.nonce
                        or prior.get("lockName") != target.lock_name or prior.get("ownerUid") != target.owner_uid
                        or prior.get("leaseHash") != lease_hash
                        or prior.get("mounts") != [list(x) for x in target.mounts]
                        or prior.get("tmpfs") != [list(x) for x in target.tmpfs]):
                    raise ValueError("prior hold target or inputs differ")
                if prior.get("phase") == "started":
                    seen = engine.inspect(prior["execId"], target.container_id)
                    stopped = transition_exec_record(prior, {"kind": "terminal-inspect", "execId": seen["execId"],
                        "running": seen["running"], "exitCode": seen["exitCode"], "noOutstandingStart": True})
                    hold.replace(prior, stopped)
                    prior = stopped
                if (prior.get("phase") == "closed"):
                    hold.qualify_closed(prior)
                elif not recovery_eligible(prior, action):
                    raise ValueError("prior operation not proven stopped or disposition not recovery")
                recovery_of = None if prior.get("phase") == "closed" else prior.get("action")
                history = list(prior.get("history", [])) + [{"nonce": prior["nonce"], "action": prior["action"],
                    "execId": prior["execId"], "exitCode": prior["exitCode"], "failure": prior.get("failure"),
                    "disposition": prior.get("phase")}]
                if len(history) > 16:
                    raise ValueError("operation history bound")
            record = {"phase": "prepared", "nonce": uuid.uuid4().hex, "action": action,
                      "targetId": target.container_id, "image": target.image, "started": target.started,
                      "mounts": [list(x) for x in target.mounts], "tmpfs": [list(x) for x in target.tmpfs],
                      "name": target.name, "fixtureNonce": target.nonce, "lockName": target.lock_name,
                      "ownerUid": target.owner_uid, "helper": target.helper_sha256,
                      "operator": target.operator, "control": target.control, "inputHash": sha(payload),
                      "leaseHash": lease_hash,
                      "base": BASE_MANIFEST, "candidate": CANDIDATE_MANIFEST, "sizeReceipt": SIZE_RECEIPT,
                      "history": history}
            if prior is None:
                hold.create(record)
            else:
                hold.replace(prior, record)
            record = engine.create(hold, record, target, action)
            record, frames = engine.start_once(hold, record, target, payload)
            stdout, stderr = parse_engine_stream(frames)
            observation = json.loads(stdout if record.get("exitCode") == 0 else stderr)
            if not isinstance(observation, dict):
                raise ValueError("invalid child receipt")
            if record["exitCode"] != 0:
                failure = classify_child_failure(observation, record["exitCode"])
                classified = {**record, "failure": failure}
                hold.replace(record, classified)
                record = classified
            target.validate(engine)
            target.verify_helper()
            if verify_hq_lease(target, action) != lease_hash:
                raise ValueError("manager lease changed")
            identity = "verified"
            classification = observation.get("classification")
            filesystem_phase = observation.get("phase")
            allowed = {"publish": {"new-entry-complete"}, "rollback": {"old-entry-full-additions"},
                       "reconcile": {"new-entry-complete", "old-entry-full-additions", "old-entry-partial-additions"}}
            if (record.get("phase") != "stopped" or record.get("exitCode") != 0
                    or observation.get("observation") != "complete"
                    or observation.get("phase") != "journal-fenced"
                    or observation.get("oldIndex") != OLD_INDEX or observation.get("newIndex") != NEW_INDEX
                    or classification not in allowed[action]):
                raise ValueError("operation did not reach requested verified state")
            failure = classify_child_failure(observation, record["exitCode"])
            if failure.get("kind") != "none":
                raise ValueError("complete receipt could not be qualified")
            verified = {**record, "phase": "verified-disposition", "failure": failure, "classification": classification,
                        "identity": identity}
            hold.replace(record, verified)
            hold.complete(verified)
        return {"requestedAction": action, "recoveryOf": recovery_of, "status": "verified",
                "classification": classification, "filesystemPhase": filesystem_phase, "identity": identity}
    except Exception as error:
        return {"requestedAction": action, "recoveryOf": recovery_of, "status": "indeterminate",
                "classification": classification, "filesystemPhase": filesystem_phase,
                "identity": identity, "error": type(error).__name__}


def coordinate_fixture(target, action):
    if type(target) is not FixtureTarget:
        raise ValueError("explicit synthetic fixture target required")
    root = "/home/ubuntu/tadazz-hq-qa-20261115/"
    if (target.container_id == CONTAINER or target.name == "tadazz"
            or not target.operator.startswith(root) or not target.control.startswith(root)
            or target.operator == str(OPERATOR) or target.control == LOCK_DIR
            or not re.fullmatch(r"[a-zA-Z0-9_.-]+", target.lock_name)):
        raise ValueError("production or invalid fixture target")
    return _coordinate(target, action)


def observe_fixture(target):
    if type(target) is not FixtureTarget:
        raise ValueError("explicit synthetic fixture target required")
    engine = EngineAdapter()
    target.verify_helper()
    target.validate(engine)
    payload = build_payload(Path(target.operator), Path(target.receipt).parent)
    try:
        result = subprocess.run(["docker", "exec", "-i", target.container_id,
                                 "python3", "-B", "-c", INNER, "observe"],
                                input=payload, capture_output=True, check=False, timeout=30)
        target.validate(engine)
        observation = json.loads(result.stdout) if result.returncode == 0 else None
        return {"observation": observation, "readbackMayRaceLostExec": True,
                "identity": "verified", "exitCode": result.returncode}
    except Exception as error:
        return {"observation": None, "readbackMayRaceLostExec": True,
                "identity": "unverified", "error": type(error).__name__}


def safe_name(name):
    path = PurePosixPath(name)
    return (
        bool(name)
        and not path.is_absolute()
        and "\\" not in name
        and all(part not in ("", ".", "..") for part in name.split("/"))
        and str(path) == name
    )


def read_regular(path, limit=MAX_FILE, expected_size=None, operator=OPERATOR):
    # Resolve from / with no-follow directory/file descriptors; never follow a
    # raced symlink or cross a mount below the fixed operator directory.
    relative = path.relative_to(operator)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open("/", flags)
    try:
        for part in operator.parts[1:]:
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        device = os.fstat(fd).st_dev
        for part in relative.parts[:-1]:
            child = os.open(part, flags, dir_fd=fd)
            if os.fstat(child).st_dev != device:
                os.close(child)
                raise ValueError("operator input device crossing")
            os.close(fd)
            fd = child
        item = os.open(relative.parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            info = os.fstat(item)
            if not stat.S_ISREG(info.st_mode) or info.st_dev != device:
                raise ValueError("operator input is not a same-device regular file")
            if info.st_size > limit:
                raise ValueError("operator input exceeds size bound")
            if expected_size is not None and info.st_size != expected_size:
                raise ValueError("operator input size mismatch")
            chunks = []
            total = 0
            while True:
                chunk = os.read(item, min(1048576, limit - total + 1))
                if not chunk:
                    break
                total += len(chunk)
                if total > limit:
                    raise ValueError("operator input exceeds size bound")
                chunks.append(chunk)
            if expected_size is not None and total != expected_size:
                raise ValueError("operator input size changed")
            return b"".join(chunks)
        finally:
            os.close(item)
    finally:
        os.close(fd)


def load_inputs(operator=OPERATOR, receipt_dir=None):
    base_raw = read_regular(operator / "base-web-inventory.json", MAX_MANIFEST, operator=operator)
    new_raw = read_regular(operator / "candidate-web-inventory.json", MAX_MANIFEST, operator=operator)
    artifact_raw = read_regular(operator / "artifact.sha256", MAX_MANIFEST, operator=operator)
    receipt_dir = operator if receipt_dir is None else receipt_dir
    sizes_raw = read_regular(receipt_dir / "public-file-sizes-and-controls.json", MAX_MANIFEST, operator=receipt_dir)
    if sha(sizes_raw) != SIZE_RECEIPT:
        raise ValueError("size receipt hash mismatch")
    sizes = json.loads(sizes_raw)
    if (sha(base_raw), sha(new_raw), sha(artifact_raw)) != (
        BASE_MANIFEST,
        CANDIDATE_MANIFEST,
        ARTIFACT_MANIFEST,
    ):
        raise ValueError("operator manifest hash mismatch")
    base_doc, new_doc = json.loads(base_raw), json.loads(new_raw)
    if base_doc["special"] or new_doc["special"]:
        raise ValueError("special image entries")
    base, new = base_doc["files"], new_doc["files"]
    if len(base) != 202 or len(new) != 242:
        raise ValueError("unexpected image inventory size")
    if any(not safe_name(name) for name in set(base) | set(new)):
        raise ValueError("unsafe inventory path")
    if set(base) - set(new):
        raise ValueError("candidate removed prior web files")
    if [name for name in base if base[name] != new[name]] != ["index.html"]:
        raise ValueError("unexpected shared file change")
    added = sorted(set(new) - set(base))
    if len(added) != 40 or any(
        not name.startswith("assets/") or name.count("/") != 1 for name in added
    ):
        raise ValueError("unexpected additions")
    if base["index.html"] != OLD_INDEX or new["index.html"] != NEW_INDEX:
        raise ValueError("unexpected entry hashes")
    artifact = {}
    for line in artifact_raw.decode("utf-8").splitlines():
        digest, name = line.split("  ", 1)
        if not safe_name(name) or name in artifact:
            raise ValueError("invalid artifact manifest")
        artifact[name] = digest
    for section, expected in (("base", base), ("candidate", new), ("artifact", artifact)):
        records = sizes[section]["files"]
        if set(records) != set(expected):
            raise ValueError("size receipt inventory mismatch")
        if any(records[n]["sha256"] != digest or type(records[n]["bytes"]) is not int
               or not 0 <= records[n]["bytes"] <= MAX_FILE for n, digest in expected.items()):
            raise ValueError("size receipt record mismatch")
        if (sum(x["bytes"] for x in records.values()) != sizes[section]["total_bytes"]
                or sizes[section]["total_bytes"] > MAX_PAYLOAD):
            raise ValueError("size receipt total mismatch")
    web = operator / "web"
    actual = set()
    wanted_dirs = set()
    for name in artifact:
        parts = name.split("/")
        wanted_dirs.update("/".join(parts[:i]) for i in range(1, len(parts)))
    def walk_error(error):
        raise error
    for root, dirs, files in os.walk(web, followlinks=False, onerror=walk_error):
        for name in dirs + files:
            item = Path(root) / name
            info = os.lstat(item)
            relative = item.relative_to(web).as_posix()
            if stat.S_ISLNK(info.st_mode) or not (
                stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)
            ):
                raise ValueError("unsafe operator artifact")
            if (stat.S_ISDIR(info.st_mode) and relative not in wanted_dirs) or (
                stat.S_ISREG(info.st_mode) and relative not in artifact
            ):
                raise ValueError("unexpected operator artifact path")
        actual.update((Path(root) / name).relative_to(web).as_posix() for name in files)
    if len(artifact) != 152 or actual != set(artifact):
        raise ValueError("artifact inventory mismatch")
    for name, expected in artifact.items():
        length = sizes["artifact"]["files"][name]["bytes"]
        if sha(read_regular(web / name, expected_size=length, operator=operator)) != expected or new.get(name) != expected:
            raise ValueError("artifact bytes mismatch")
    return base_raw, new_raw, added, sizes_raw, sizes


def inspect_identity():
    output = subprocess.check_output(
        ["sudo", "-n", "docker", "inspect", "--format",
         "{{.Id}} {{.Image}} {{.State.Running}} {{.State.StartedAt}}", CONTAINER],
        text=True,
    ).strip().split()
    if output != [CONTAINER, IMAGE, "true", STARTED]:
        raise ValueError("container identity/image/start mismatch")
    mounts = json.loads(subprocess.check_output(
        ["sudo", "-n", "docker", "inspect", "--format", "{{json .Mounts}}", CONTAINER],
        text=True,
    ))
    observed = [(m.get("Type"), m.get("Destination"), m.get("Source"), m.get("RW"))
                for m in mounts]
    if sorted(observed) != sorted(EXPECTED_MOUNTS):
        raise ValueError("mount tuple differs from approved allowlist")


# Executed in the selected container with a public-only tar on stdin. It uses
# fixed paths, dirfd operations and O_NOFOLLOW; no config or environment reads.
INNER = r'''import hashlib,io,json,os,stat,sys,tarfile,time
APP="/app"; WEB="web"; STAGE=".tadazz-web-release-31b3cb0"
BASE="f79f270e5be9662e3f5b36c7de9bebb7077da387d92cfd37ddceaac7e1817ca9"
NEW="3f7b3942cca983f09a6fd15d335ac7b01895fc5c9530dd339ac0721a59a20b57"
SIZES="ff28b4363b86e3f7430ccc895872d0390c5943c6955f8f5e9003b83232ab99d9"
OLD_INDEX="81a5fbe942c74398e002a17205bba112b9e021cef416b83756aa8fd2e76fdf6e"
NEW_INDEX="9a9edaf33fbcdddc569b66fb1044c2280eb83732c958653019fb499c05681f71"
CAP=6*1024*1024
FILE_CAP=8*1024*1024
def digest(data): return hashlib.sha256(data).hexdigest()
def valid(n): return bool(n) and not n.startswith("/") and "\\" not in n and all(x not in ("",".","..") for x in n.split("/"))
payload=sys.stdin.buffer.read(CAP+1)
if len(payload)>CAP: raise ValueError("payload too large")
items={};members={}
with tarfile.open(fileobj=io.BytesIO(payload),mode="r:") as archive:
 for m in archive:
  if not m.isfile() or not valid(m.name) or m.name in members or m.size>FILE_CAP: raise ValueError("unsafe payload")
  members[m.name]=m
 if not {"base.json","candidate.json","sizes.json"}<=set(members): raise ValueError("missing manifest")
 for n in ("base.json","candidate.json","sizes.json"):
  if members[n].size>256*1024: raise ValueError("manifest bound")
  items[n]=archive.extractfile(members[n]).read()
 if digest(items["base.json"])!=BASE or digest(items["candidate.json"])!=NEW or digest(items["sizes.json"])!=SIZES: raise ValueError("manifest mismatch")
 base_doc=json.loads(items["base.json"]);new_doc=json.loads(items["candidate.json"])
 sizes=json.loads(items["sizes.json"])
 expected_payload={"payload/"+n for n in set(new_doc["files"])-set(base_doc["files"])}|{"payload/index.html"}
 if set(members)!={"base.json","candidate.json","sizes.json"}|expected_payload: raise ValueError("payload inventory")
 for n in expected_payload:
  if members[n].size!=sizes["candidate"]["files"][n[8:]]["bytes"]: raise ValueError("payload size")
  items[n]=archive.extractfile(members[n]).read()
if base_doc["special"] or new_doc["special"]: raise ValueError("special manifest entry")
base=base_doc["files"];new=new_doc["files"]
if len(base)!=202 or len(new)!=242 or any(not valid(n) for n in set(base)|set(new)): raise ValueError("inventory")
added=sorted(set(new)-set(base))
if set(base)-set(new) or [n for n in base if base[n]!=new[n]]!=["index.html"] or len(added)!=40 or any(not n.startswith("assets/") or n.count("/")!=1 for n in added): raise ValueError("unexpected delta")
if base["index.html"]!=OLD_INDEX or new["index.html"]!=NEW_INDEX: raise ValueError("entry hashes")
if set(items)!={"base.json","candidate.json","sizes.json"}|{"payload/"+n for n in added+["index.html"]}: raise ValueError("payload inventory")
for label,inventory in (("base",base),("candidate",new)):
 records=sizes[label]["files"]
 if set(records)!=set(inventory) or any(records[n]["sha256"]!=h or type(records[n]["bytes"]) is not int or not 0<=records[n]["bytes"]<=FILE_CAP for n,h in inventory.items()): raise ValueError("size receipt inventory")
 if sum(r["bytes"] for r in records.values())!=sizes[label]["total_bytes"]: raise ValueError("size total")
allowed_sizes={}
for label in ("base","candidate"):
 for n,r in sizes[label]["files"].items(): allowed_sizes.setdefault(n,set()).add(r["bytes"])
for n in added+["index.html"]:
 if digest(items["payload/"+n])!=new[n]: raise ValueError("payload hash")
flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
if os.geteuid()!=0: raise ValueError("container root required")
app=os.open(APP,flags); web=os.open(WEB,flags,dir_fd=app); dev=os.fstat(web).st_dev
if os.fstat(app).st_dev!=dev: raise ValueError("different app/web devices")
def readfd(parent,name):
 f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
 try:
  st=os.fstat(f)
  if not stat.S_ISREG(st.st_mode) or st.st_dev!=dev: raise ValueError("nonregular/device")
  if st.st_size>FILE_CAP: raise ValueError("file size bound")
  chunks=[]
  total=0
  while True:
   b=os.read(f,min(1048576,FILE_CAP-total+1))
   if not b: break
   total+=len(b)
   if total>FILE_CAP: raise ValueError("file size bound")
   chunks.append(b)
  return b"".join(chunks)
 finally: os.close(f)
def hashfd(parent,name,allowed):
 f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
 try:
  st=os.fstat(f)
  if not stat.S_ISREG(st.st_mode) or st.st_dev!=dev or st.st_size not in allowed: raise ValueError("nonregular/device/size")
  h=hashlib.sha256();total=0
  while True:
   b=os.read(f,min(1048576,FILE_CAP-total+1))
   if not b:
    if total!=st.st_size: raise ValueError("size changed")
    return h.hexdigest()
   total+=len(b)
   if total>FILE_CAP: raise ValueError("file size bound")
   h.update(b)
 finally: os.close(f)
def walk(fd,expected,wanted,prefix="",dirs=None):
 if dirs is None: dirs=set()
 result={}
 for entry in os.scandir(fd):
  n=entry.name; name=prefix+n
  if not valid(name): raise ValueError("invalid path")
  info=entry.stat(follow_symlinks=False)
  if info.st_dev!=dev or stat.S_ISLNK(info.st_mode): raise ValueError("symlink/device")
  if stat.S_ISDIR(info.st_mode):
   if name not in wanted: raise ValueError("unexpected directory")
   child=os.open(n,flags,dir_fd=fd)
   if os.fstat(child).st_dev!=dev: os.close(child);raise ValueError("device crossing")
   dirs.add(name)
   try: result.update(walk(child,expected,wanted,name+"/",dirs))
   finally: os.close(child)
  elif stat.S_ISREG(info.st_mode):
   if name not in expected: raise ValueError("unexpected file")
   result[name]=hashfd(fd,n,allowed_sizes[name])
  else: raise ValueError("special file")
 return result
def matches(fd,expected):
 dirs=set(); wanted=set()
 for name in expected:
  parts=name.split("/")
  for i in range(1,len(parts)): wanted.add("/".join(parts[:i]))
 actual=walk(fd,expected,wanted,dirs=dirs)
 return actual==expected and dirs==wanted
def dir_for(root,path,create=False):
 parts=path.split("/"); fd=os.dup(root)
 try:
  for part in parts[:-1]:
   if create:
    try: os.mkdir(part,0o700,dir_fd=fd);os.fsync(fd)
    except FileExistsError: pass
   child=os.open(part,flags,dir_fd=fd)
   if os.fstat(child).st_dev!=dev: os.close(child);raise ValueError("device crossing")
   os.close(fd);fd=child
  return fd,parts[-1]
 except: os.close(fd);raise
def get(root,path):
 fd,n=dir_for(root,path)
 try: return readfd(fd,n)
 finally: os.close(fd)
def write_new(root,path,data,mode=0o600):
 fd,n=dir_for(root,path,True)
 try:
  f=os.open(n,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode,dir_fd=fd)
  try:
   os.fchmod(f,mode)
   view=memoryview(data)
   while view:
    count=os.write(f,view)
    if count<=0: raise OSError("short write")
    view=view[count:]
   os.fsync(f)
  finally: os.close(f)
  os.fsync(fd)
 finally: os.close(fd)
def journal(stage,name,extra=None):
 global current_operation
 current_operation="journal:"+name
 body={"phase":name,"oldIndex":OLD_INDEX,"newIndex":NEW_INDEX,"baseManifest":BASE,"candidateManifest":NEW,"backendImage":"sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346","effectiveWebCandidate":"sha256:54d162faae23681b56279d85b8dfa1243c6a9fb8fd62f5bb87c91479f7f4a79d","sourceRevision":"31b3cb084efeb50dced6952498e9703cb47dc45c","appRevision":"9b221bc0edabe449cdf27bc818ae77acbc676bae","utc":time.time(),"extra":extra}
 write_new(stage,"journal-"+name+".json",(json.dumps(body,sort_keys=True)+"\n").encode())
 current_operation="post-journal"
def stage_open():
 stage=os.open(STAGE,flags,dir_fd=app)
 info=os.fstat(stage)
 if info.st_dev!=dev or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700: os.close(stage);raise ValueError("stage ownership/mode/device")
 return stage
def classify():
 wanted=set()
 for name in new:
  parts=name.split("/")
  for i in range(1,len(parts)): wanted.add("/".join(parts[:i]))
 actual=walk(web,new,wanted)
 if any(actual.get(n)!=h for n,h in base.items() if n!="index.html"): return "foreign-ambiguous"
 if any(n not in new or (n!="index.html" and h!=new[n]) for n,h in actual.items()): return "foreign-ambiguous"
 if actual.get("index.html")==OLD_INDEX:
  count=len(set(actual)&set(added))
  return "old-entry-full-additions" if count==len(added) else "old-entry-partial-additions"
 if actual.get("index.html")==NEW_INDEX and actual==new: return "new-entry-complete"
 return "foreign-ambiguous"
def verified_backup(stage):
 if digest(get(stage,"base.json"))!=BASE or digest(get(stage,"candidate.json"))!=NEW: raise ValueError("stage manifest mismatch")
 backup=os.open("backup",flags,dir_fd=stage)
 try:
  if not matches(backup,base): raise ValueError("backup mismatch")
  return get(backup,"index.html")
 finally: os.close(backup)
phase="preflight"; current_operation="preflight"; stage=None
try:
 mode=sys.argv[1]
 if mode=="observe":
  observed=classify();backup_status="unavailable"
  try:
   stage=stage_open();verified_backup(stage);backup_status="verified"
  except Exception: pass
  print(json.dumps({"observation":"readback","classification":observed,"backup":backup_status}))
 elif mode=="publish":
  if not matches(web,base): raise ValueError("live tree is not exact old inventory")
  phase="stage-create-uncertain"
  current_operation="stage-create";os.mkdir(STAGE,0o700,dir_fd=app);os.fsync(app);stage=stage_open();phase="backup"
  for n,h in base.items():
   current_operation="backup:"+n;data=get(web,n)
   if digest(data)!=h: raise ValueError("old file changed during backup")
   write_new(stage,"backup/"+n,data)
  backup=os.open("backup",flags,dir_fd=stage)
  try:
   if not matches(backup,base): raise ValueError("backup verification")
  finally: os.close(backup)
  current_operation="write-base-manifest";write_new(stage,"base.json",items["base.json"])
  current_operation="write-candidate-manifest";write_new(stage,"candidate.json",items["candidate.json"])
  for n in added+["index.html"]:
   current_operation="write-incoming:"+n;write_new(stage,"incoming/"+n,items["payload/"+n],0o644)
  journal(stage,"backup-verified");phase="assets"
  for n in added:
   srcfd,srcname=dir_for(stage,"incoming/"+n);dstfd,dstname=dir_for(web,n)
   try:
    current_operation="asset-link:"+n;os.link(srcname,dstname,src_dir_fd=srcfd,dst_dir_fd=dstfd,follow_symlinks=False)
    current_operation="asset-dir-fsync:"+n;os.fsync(dstfd)
   finally: os.close(srcfd);os.close(dstfd)
  interim=dict(new);interim["index.html"]=OLD_INDEX
  if not matches(web,interim): raise ValueError("pre-swap live inventory mismatch")
  journal(stage,"assets-verified");phase="replacement-attempted"
  srcfd,srcname=dir_for(stage,"incoming/index.html")
  try:
   current_operation="publish-replace";os.replace(srcname,"index.html",src_dir_fd=srcfd,dst_dir_fd=web);phase="visible-unfenced"
   current_operation="publish-web-fsync";os.fsync(web);current_operation="publish-source-fsync";os.fsync(srcfd);phase="directories-fenced"
  finally: os.close(srcfd)
  if not matches(web,new): raise ValueError("post-swap live inventory mismatch")
  journal(stage,"published");phase="journal-fenced"
 elif mode=="rollback":
  if classify()!="new-entry-complete": raise ValueError("live tree is not exact published inventory")
  stage=stage_open()
  old=verified_backup(stage)
  current_operation="rollback-stage-index"
  try: write_new(stage,"rollback-index.html",old,0o644)
  except FileExistsError:
   f=os.open("rollback-index.html",os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=stage)
   try:
    st=os.fstat(f)
    if (not stat.S_ISREG(st.st_mode) or st.st_dev!=dev or st.st_uid!=0 or
        stat.S_IMODE(st.st_mode)!=0o644 or st.st_nlink!=1 or st.st_size!=len(old)):
     raise ValueError("unsafe rollback staging metadata")
    h=hashlib.sha256();total=0
    while True:
     chunk=os.read(f,min(1048576,len(old)-total+1))
     if not chunk: break
     total+=len(chunk)
     if total>len(old): raise ValueError("rollback staging size changed")
     h.update(chunk)
    if total!=len(old) or h.hexdigest()!=OLD_INDEX: raise ValueError("foreign rollback staging")
    os.fsync(f)
   finally: os.close(f)
   os.fsync(stage)
  journal(stage,"rollback-ready-"+str(time.time_ns()));phase="replacement-attempted"
  current_operation="rollback-replace";os.replace("rollback-index.html","index.html",src_dir_fd=stage,dst_dir_fd=web);phase="visible-unfenced"
  current_operation="rollback-web-fsync";os.fsync(web);current_operation="rollback-source-fsync";os.fsync(stage)
  incoming=os.open("incoming",flags,dir_fd=stage)
  try: current_operation="incoming-dir-fsync";os.fsync(incoming)
  finally: os.close(incoming)
  phase="directories-fenced"
  restored=dict(new);restored["index.html"]=OLD_INDEX
  if not matches(web,restored): raise ValueError("post-rollback inventory mismatch")
  journal(stage,"rolled-back-"+str(time.time_ns()));phase="journal-fenced"
 elif mode=="reconcile":
  state=classify();stage=stage_open();verified_backup(stage)
  if state=="foreign-ambiguous": raise ValueError("foreign or ambiguous public tree")
  current_operation="reconcile-web-fsync";os.fsync(web);current_operation="reconcile-stage-fsync";os.fsync(stage)
  assets=os.open("assets",flags,dir_fd=web)
  try: current_operation="reconcile-assets-fsync";os.fsync(assets)
  finally: os.close(assets)
  incoming=os.open("incoming",flags,dir_fd=stage)
  try: current_operation="reconcile-incoming-fsync";os.fsync(incoming)
  finally: os.close(incoming)
  phase="directories-fenced"
  journal(stage,"reconciled-"+str(time.time_ns()),{"observed":state});phase="journal-fenced"
 else: raise ValueError("unknown action")
 if mode!="observe": print(json.dumps({"observation":"complete","phase":phase,"classification":classify(),"oldIndex":OLD_INDEX,"newIndex":NEW_INDEX}))
except Exception as e:
 def exception_chain(error):
  entries=[];seen=set();cursor=error.__context__
  while cursor is not None and len(entries)<8 and id(cursor) not in seen:
   seen.add(id(cursor));entries.append({"error":type(cursor).__name__,"errno":getattr(cursor,"errno",None)})
   cursor=cursor.__context__
  if cursor is not None: entries.append({"error":"truncated-or-cyclic","errno":None})
  return entries
 failure={"phase":phase,"operation":current_operation,"error":type(e).__name__,"errno":getattr(e,"errno",None),"chain":exception_chain(e)}
 secondary=None;failure_journal="not-attempted"
 if stage is not None and mode!="observe":
  try: journal(stage,"failure-"+str(time.time_ns()),failure);failure_journal="written"
  except Exception as journal_error:
   secondary={"operation":current_operation,"error":type(journal_error).__name__,"errno":getattr(journal_error,"errno",None),"chain":exception_chain(journal_error)}
   failure_journal="failed"
 print(json.dumps({"observation":"failed",**failure,"secondary":secondary,"failureJournal":failure_journal}),file=sys.stderr)
 sys.exit(1)
finally:
 if stage is not None: os.close(stage)
 os.close(web);os.close(app)
'''




class HostIndeterminate(Exception):
    pass


def run(action):
    if action not in {"publish", "rollback", "reconcile"}:
        raise ValueError("expected publish, rollback or reconcile")
    target = ProductionTarget(CONTAINER, "tadazz", "production", IMAGE, STARTED,
                              str(OPERATOR), LOCK_DIR, str(OPERATOR / "public-file-sizes-and-controls.json"),
                              LOCK_NAME, 1001, "", tuple(EXPECTED_MOUNTS), ())
    return _coordinate(target, action)


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("usage: atomic-web-publish.py publish|rollback|reconcile")
        result = run(sys.argv[1])
        print(json.dumps(result))
        if result.get("status") != "verified":
            sys.exit(1)
    except HostIndeterminate:
        sys.exit(1)
    except Exception as error:
        print(json.dumps({"status": "indeterminate", "requestedAction": sys.argv[1] if len(sys.argv) == 2 else None,
                          "classification": None, "identity": "unverified",
                          "error": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
