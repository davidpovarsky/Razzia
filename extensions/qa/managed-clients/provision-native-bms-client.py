#!/usr/bin/env python3
"""Prepare, create once, and verify the owner's original native BMS client.

This operator is intentionally outside the application. It calls the application's
validated owner CLI; it never fabricates an account/session or writes its databases.
All stdout is metadata. Credential-bearing CLI stdout is saved only in root-private
files. An uncertain create is recovered by lookup with the same request ID, never
by another create or an automatic code rotation.

Run only after the coordinating operator admits the exact candidate/deployment.
No phase is selected by default. All plans and prerequisite receipts are SHA-pinned.
"""

import argparse
import base64
from contextlib import contextmanager
import fcntl
import hashlib
import http.client
from http.cookies import SimpleCookie
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import socket
import stat
import tarfile
import time
import urllib.error
import urllib.request
import uuid


APP_ORIGIN = "https://tadazz.com"
CONFIG_ROOT = Path("/var/lib/tadazz-release-5312660/config")
PRIVATE_ROOT = Path("/var/lib/tadazz-managed-client-provision")
LOCK = Path("/run/lock/tadazz-mcp-deploy.lock")
GAME_ID = "6369bf77-c3d4-40ee-8a67-0476434b562f"
UPLOAD = "9d9e3f4f-2995-4adb-8763-4bd7595b8b4c"
SOURCE = "041e64a214f6121b3492b736956884495147be061988ed9285b3f179b89204b0"
BUILD = "25f6b9b8bd5bd79ddcd0510471113aeb5ef67cc410f53fd05da52ffaed20245d"
THEME = "tadazz-classic"
CREATE_REQUEST = "9337d7b4-1109-414b-a505-09f215b5169b"
LAUNCH_REQUEST = "29679460-f693-48a3-a1ad-f1531daa638a"
VERIFIER_SHA = "2f91065ef027eefec8e191945a8a9836e5f8438fdb6606ca14620f47138e7b32"
HEX = re.compile(r"[a-f0-9]{64}\Z")
IMAGE = re.compile(r"sha256:[a-f0-9]{64}\Z")
REVISION = re.compile(r"[a-f0-9]{40}\Z")
CLI_PATH = "/app/socket/index.cjs"
CLI_RUNNER = r'''const {spawnSync}=require("node:child_process");
const input=Buffer.from(process.argv[1],"base64");
if(input.length>16384)process.exit(125);
const r=spawnSync(process.execPath,["/app/socket/index.cjs","--managed-client-owner"],
 {input,timeout:15000,maxBuffer:131072,env:process.env});
if(r.stdout)process.stdout.write(r.stdout);
if(r.stderr)process.stderr.write(r.stderr);
process.exitCode=r.status===null?124:r.status;'''


class GateError(Exception):
    """Stable metadata-only failure. Never include a response body or credential."""


def need(condition, code):
    if not condition:
        raise GateError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def uuid_value(value):
    try:
        return isinstance(value, str) and str(uuid.UUID(value)) == value
    except (ValueError, AttributeError):
        return False


def plain_file(path, limit=2 * 1024 * 1024, private=False, allow_empty=False):
    path = Path(path)
    need(path.resolve(strict=True) == path, "INPUT_SYMLINK")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, "INPUT_NOT_REGULAR")
        need((0 if allow_empty else 1) <= info.st_size <= limit, "INPUT_SIZE")
        if private:
            need(info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600, "INPUT_NOT_PRIVATE")
        data = stream.read(limit + 1)
        need(len(data) == info.st_size, "INPUT_CHANGED")
        return data


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private_dir(path, create=False):
    path = Path(path)
    if create and not path.exists():
        need(path.parent.resolve(strict=True) == path.parent, "PRIVATE_PARENT_SYMLINK")
        path.mkdir(mode=0o700, exist_ok=False)
        sync_dir(path.parent)
    need(path.resolve(strict=True) == path, "PRIVATE_DIRECTORY_SYMLINK")
    info = path.stat()
    need(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700,
         "PRIVATE_DIRECTORY_MODE")
    return path


def save_private(path, data):
    need(Path(path).parent.resolve(strict=True) == Path(path).parent, "OUTPUT_PARENT_SYMLINK")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    sync_dir(Path(path).parent)
    need(plain_file(path, max(len(data), 1), private=True, allow_empty=True) == data, "OUTPUT_READBACK")


def save_json(path, value):
    save_private(path, canonical(value) + b"\n")


@contextmanager
def deployment_lock():
    fd = os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == 0
             and stat.S_IMODE(info.st_mode) == 0o600, "DEPLOYMENT_LOCK_MODE")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise GateError("DEPLOYMENT_BUSY") from None
        yield
    finally:
        os.close(fd)


class DockerConnection(http.client.HTTPConnection):
    # Same local daemon transport used by the existing qualified app operator.
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect("/var/run/docker.sock")


def docker_bytes(method, path, body=None, limit=8 * 1024 * 1024, timeout=25):
    connection = DockerConnection("localhost", timeout=timeout)
    try:
        connection.request(method, path, None if body is None else canonical(body),
                           {"Content-Type": "application/json"})
        response = connection.getresponse()
        data = response.read(limit + 1)
        need(response.status < 400, "DOCKER_HTTP_" + str(response.status))
        need(len(data) <= limit, "DOCKER_RESPONSE_SIZE")
        return data
    finally:
        connection.close()


def docker_api(method, path, body=None, **kwargs):
    data = docker_bytes(method, path, body, **kwargs)
    return json.loads(data) if data else None


def demux(raw):
    """Docker's bounded stdout/stderr framing; no TTY or merged output."""
    streams = {1: bytearray(), 2: bytearray()}
    offset = 0
    while offset < len(raw):
        need(len(raw) - offset >= 8, "DOCKER_STREAM_HEADER")
        header = raw[offset:offset + 8]
        size = int.from_bytes(header[4:], "big")
        need(header[0] in streams and header[1:4] == b"\0\0\0", "DOCKER_STREAM_KIND")
        offset += 8
        need(size <= 131072 and offset + size <= len(raw), "DOCKER_STREAM_LENGTH")
        streams[header[0]].extend(raw[offset:offset + size])
        offset += size
    return bytes(streams[1]), bytes(streams[2])


def archive_backend(container):
    raw = docker_bytes("GET", f"/containers/{container}/archive?path={CLI_PATH}")
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:*") as archive:
        members = archive.getmembers()
        need(len(members) == 1 and members[0].name == "index.cjs" and members[0].isfile()
             and 0 < members[0].size < 8 * 1024 * 1024, "COMPILED_ARTIFACT_ARCHIVE")
        stream = archive.extractfile(members[0])
        need(stream is not None, "COMPILED_ARTIFACT_MISSING")
        data = stream.read(8 * 1024 * 1024)
        need(len(data) == members[0].size, "COMPILED_ARTIFACT_SIZE")
        return digest(data)


def image_identity(plan):
    image = docker_api("GET", "/images/" + plan["imageId"] + "/json")
    need(image["Id"] == plan["imageId"] and
         (image["Config"].get("Labels") or {}).get("org.opencontainers.image.revision") == plan["revision"],
         "CANDIDATE_IMAGE_IDENTITY")


def live_identity(plan):
    actual = docker_api("GET", "/containers/" + plan["liveContainerId"] + "/json")
    need(actual["Id"] == plan["liveContainerId"] and actual["Image"] == plan["imageId"]
         and actual["State"]["Running"] and not actual["State"]["Restarting"], "LIVE_APP_CHANGED")
    need((actual["Config"].get("Labels") or {}).get("org.opencontainers.image.revision") == plan["revision"],
         "LIVE_APP_REVISION")
    binds = [m for m in actual["Mounts"] if m["Type"] == "bind"]
    need(len(binds) == 1 and binds[0]["Source"] == str(CONFIG_ROOT)
         and binds[0]["Destination"] == "/app/config" and binds[0]["RW"] is True, "LIVE_CONFIG_BINDING")
    environment = {}
    for item in actual["Config"].get("Env") or []:
        key, value = item.split("=", 1)
        need(key not in environment, "LIVE_ENV_DUPLICATE")
        environment[key] = value
    need(environment.get("CONFIG_PATH") == "/app/config" and
         environment.get("TADAZZ_ACCOUNTS_ENABLED") == "true", "LIVE_FEATURE_BINDING")
    return {"container": actual["Id"], "image": actual["Image"], "revision": plan["revision"],
            "startedAt": actual["State"]["StartedAt"], "environmentDigest": digest(canonical(environment))}


def cli_exec(plan, evidence, label, command):
    # The wrapper's argv contains only the owner command, never a client code or
    # session token. Its child uses the same validated compiled stdin CLI.
    input_data = canonical(command)
    need(len(input_data) <= 16384 and "code" not in command, "CLI_INPUT_BOUNDARY")
    execution = docker_api("POST", "/containers/" + plan["liveContainerId"] + "/exec", {
        "AttachStdout": True, "AttachStderr": True, "AttachStdin": False, "Tty": False,
        "Cmd": ["node", "-e", CLI_RUNNER, base64.b64encode(input_data).decode()],
    })
    need(HEX.fullmatch(execution["Id"]), "CLI_EXEC_ID")
    save_json(evidence / (label + ".exec.json"), {"id": execution["Id"]})
    raw = docker_bytes("POST", "/exec/" + execution["Id"] + "/start",
                       {"Detach": False, "Tty": False}, limit=262144, timeout=25)
    stdout, stderr = demux(raw)
    save_private(evidence / (label + ".stdout.private"), stdout)
    save_private(evidence / (label + ".stderr.private"), stderr)
    result = docker_api("GET", "/exec/" + execution["Id"] + "/json")
    need(not result["Running"], "CLI_STILL_RUNNING_RECONCILE")
    need(result["ExitCode"] in (0, 1), "CLI_UNCERTAIN_RECONCILE")
    need(len(stdout.splitlines()) == 1, "CLI_RESPONSE_NOT_SINGLE_JSON")
    value = json.loads(stdout)
    need(isinstance(value, dict) and type(value.get("ok")) is bool, "CLI_RESPONSE_SCHEMA")
    need((result["ExitCode"] == 0) == value["ok"], "CLI_RESPONSE_EXIT_MISMATCH")
    return value


def verifier_module():
    path = Path(__file__).resolve().with_name("verify-native-current-bms.py")
    need(digest(plain_file(path)) == VERIFIER_SHA, "BMS_VERIFIER_PIN")
    spec = importlib.util.spec_from_file_location("verified_native_bms", path)
    need(spec is not None and spec.loader is not None, "BMS_VERIFIER_IMPORT")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def exact_bms(plan):
    verifier = verifier_module()
    current = plan.get("currentNativeGame")
    pin = plan.get("currentNativeSnapshotSha256")
    return verifier.read_verified(str(CONFIG_ROOT), GAME_ID, current, pin)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ClientHttp:
    """New, memory-only, canonical-origin cookies; never an owner credential."""
    def __init__(self):
        self.cookies = {}
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, path, expected=200, method="GET", value=None, raw=None, maximum=2 * 1024 * 1024, timeout=30):
        need(path.startswith("/") and not path.startswith("//"), "HTTP_PATH")
        headers = {"Origin": APP_ORIGIN, "X-Tadazz-Session": "managed-client", "Accept": "application/json"}
        matching = {key: item[0] for key, item in self.cookies.items()
                    if path.split("?", 1)[0] == item[1] or
                    path.split("?", 1)[0].startswith(item[1].rstrip("/") + "/")}
        if matching:
            headers["Cookie"] = "; ".join(f"{key}={value}" for key, value in matching.items())
        body = canonical(value) if value is not None else raw
        if body is not None:
            headers["Content-Type"] = "application/json" if value is not None else "text/plain;charset=UTF-8"
        request = urllib.request.Request(APP_ORIGIN + path, data=body, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            need(response.status == expected, "APP_HTTP_" + str(response.status))
            data = response.read(maximum + 1)
            need(len(data) <= maximum, "APP_RESPONSE_SIZE")
            for header in response.headers.get_all("Set-Cookie", []):
                parsed = SimpleCookie()
                parsed.load(header)
                for key, morsel in parsed.items():
                    need(key in {"tdz_client_auth", "tdz_room", "tdz_media_auth"}, "UNEXPECTED_CLIENT_COOKIE")
                    need(not morsel["domain"] and morsel["path"] in {"/", "/media"}, "COOKIE_SCOPE")
                    if morsel["max-age"] == "0" or not morsel.value:
                        self.cookies.pop(key, None)
                        continue
                    need(key != "tdz_media_auth", "OWNER_COOKIE_FORBIDDEN")
                    need(bool(morsel["httponly"]) and bool(morsel["secure"]), "COOKIE_FLAGS")
                    need(re.fullmatch(r"[A-Za-z0-9._-]{1,4096}", morsel.value), "COOKIE_VALUE")
                    need(key != "tdz_client_auth" or morsel["samesite"].lower() == "lax", "CLIENT_COOKIE_SAMESITE")
                    self.cookies[key] = (morsel.value, morsel["path"])
            return data, response.headers

    def json(self, path, **kwargs):
        data, _ = self.request(path, **kwargs)
        return json.loads(data)


class NativePolling:
    """Native Engine.IO v4 polling; extends the qualified operator's handshake."""
    def __init__(self, client):
        self.client = client
        self.path = None
        self.pending = []
        self.ready = False

    def open(self):
        need(self.path is None, "ENGINEIO_ALREADY_OPENED")
        query = "/ws/?EIO=4&transport=polling&t=" + uuid.uuid4().hex
        opened, _ = self.client.request(query, maximum=65536)
        need(opened.startswith(b"0"), "ENGINEIO_OPEN")
        packet = json.loads(opened[1:])
        need(re.fullmatch(r"[A-Za-z0-9_-]{1,256}", packet.get("sid", "")), "ENGINEIO_SID")
        self.path = query + "&sid=" + packet["sid"]
        self.post('40{"managedClient":true}')
        self.await_packet(lambda item: item.startswith("40"))
        self.ready = True

    def post(self, value):
        data, _ = self.client.request(self.path, method="POST", raw=value.encode(), maximum=65536)
        need(data == b"ok", "ENGINEIO_POST")

    def await_packet(self, predicate):
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            for index, packet in enumerate(self.pending):
                if predicate(packet):
                    return self.pending.pop(index)
            raw, _ = self.client.request(self.path, timeout=min(30, max(1, deadline - time.monotonic())))
            for packet in raw.decode().split("\x1e"):
                if packet == "2":
                    self.post("3")
                elif packet == "6":
                    continue
                else:
                    need(not packet.startswith(("1", "41", "44")), "NATIVE_SOCKET_REJECTED")
                    self.pending.append(packet)
            need(len(self.pending) <= 100, "NATIVE_PACKET_BUDGET")
        raise GateError("NATIVE_EVENT_TIMEOUT")

    def emit(self, event, room):
        need(event in {"manager:reconnect", "manager:leave"} and uuid_value(room), "NATIVE_ACTION_SCOPE")
        self.post("42" + json.dumps([event, {"gameId": room}], separators=(",", ":")))

    def event(self, name):
        def matches(packet):
            if not packet.startswith("42"):
                return False
            value = json.loads(packet[2:])
            return isinstance(value, list) and len(value) >= 2 and value[0] == name
        return json.loads(self.await_packet(matches)[2:])[1]

    def close(self):
        if self.path:
            try:
                self.post("1")
            except Exception:
                # No retry. The authenticated test room is separately reconciled.
                pass
        self.ready = False


def cleanup_owned_room(plan, evidence, client, transport, room, initial_identity):
    """One bounded reconnect/leave of the already-recorded, unstarted test room.

    Never launches a room, changes an assignment, creates a client or rotates a
    code. Its independent receipt is written before the test session is retired.
    """
    outcome = {"gameId": room, "nativeReconnect": False, "nativeLeaveSent": False,
               "nativeLeaveAcknowledged": False, "missingAfterLeave": False,
               "usedFreshTransport": False, "closed": False, "reconciliationRequired": True}
    try:
        need(live_identity(plan) == initial_identity, "APP_CHANGED_BEFORE_ROOM_CLOSE")
        if transport is None or not transport.ready:
            if transport is not None:
                transport.close()
            transport = NativePolling(client)
            outcome["usedFreshTransport"] = True
            transport.open()
        # Reconnect proves the current principal still owns this precise room.
        # The same socket may safely reconnect; no game-start command is sent.
        transport.emit("manager:reconnect", room)
        connected = transport.event("manager:successReconnect")
        need(connected.get("gameId") == room and connected.get("players") == [] and
             connected.get("status", {}).get("name") == "SHOW_ROOM", "CLEANUP_ROOM_BINDING")
        outcome["nativeReconnect"] = True
        transport.emit("manager:leave", room)
        outcome["nativeLeaveSent"] = True
        need(transport.event("game:reset") == "errors:game.managerDisconnected", "ROOM_LEAVE_ACK")
        outcome["nativeLeaveAcknowledged"] = True
        client.request(f"/api/games/{room}/display-media", expected=404)
        outcome["missingAfterLeave"] = True
        outcome["closed"] = True
        outcome["reconciliationRequired"] = False
    except Exception as error:
        outcome["error"] = str(error) if isinstance(error, GateError) else "OWNED_ROOM_CLEANUP_FAILED"
        outcome["errorType"] = type(error).__name__
    finally:
        if transport is not None:
            transport.close()
        save_json(evidence / "owned-test-room-cleanup.json", outcome)
    return outcome


def public_artifact_probe(path, expected):
    """Canonical static bytes on a separate cookie-free, no-proxy transport."""
    need(isinstance(path, str) and path.startswith("/") and not path.startswith("//"), "PUBLIC_ARTIFACT_PATH")
    verifier = verifier_module()
    if expected.get("artifactPath") == "packages/web/dist/index.html":
        need(re.fullmatch(r"/party/manager/[a-f0-9-]{36}\?client=1", path)
             and uuid_value(path.split("/")[3].split("?", 1)[0]), "NATIVE_ENTRY_URL_SCOPE")
        verifier.validate_artifact(expected, entry=True)
    else:
        verifier.validate_artifact(expected)
        need(path == expected["url"], "PUBLIC_ARTIFACT_URL_PIN")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(APP_ORIGIN + path, headers={"Accept": expected["mime"]})
    with opener.open(request, timeout=30) as response:
        body = response.read(expected["bytes"] + 1)
        content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        need(response.status == 200 and len(body) == expected["bytes"]
             and digest(body) == expected["sha256"] and content_type == expected["mime"],
             "NATIVE_PUBLIC_ARTIFACT_HTTP_BYTES_CHANGED")
    return {"bytesVerified": True, "sha256": expected["sha256"], "cookiesSent": False}


def compiled_qualification(plan, evidence):
    image_identity(plan)
    name = "tadazz-managed-client-cli-" + uuid.uuid4().hex[:10]
    payload = {
        "Image": plan["imageId"], "Entrypoint": ["node"],
        "Cmd": ["-e", CLI_RUNNER, base64.b64encode(b"{}").decode()],
        "Env": ["NODE_ENV=production", "CONFIG_PATH=/app/config", "TADAZZ_ACCOUNTS_ENABLED=true",
                "JWT_SECRET=synthetic-cli-qualification-secret-at-least-32-characters",
                "RESEND_API_KEY=synthetic-no-network", "TADAZZ_AUTH_EMAIL_FROM=synthetic@example.invalid"],
        "WorkingDir": "/tmp", "Labels": {"com.tadazz.qa": "managed-client-compiled-cli"},
        "HostConfig": {"NetworkMode": "none", "ReadonlyRootfs": True, "CapDrop": ["ALL"],
                       "SecurityOpt": ["no-new-privileges"], "Memory": 805306368, "MemorySwap": 805306368,
                       "NanoCpus": 1000000000, "PidsLimit": 96,
                       "Tmpfs": {"/app/config": "rw,nosuid,nodev,noexec,size=33554432",
                                 "/tmp": "rw,nosuid,nodev,noexec,size=33554432"}},
    }
    created = docker_api("POST", "/containers/create?name=" + name, payload)
    container = created["Id"]
    need(HEX.fullmatch(container), "QUALIFICATION_CONTAINER_ID")
    save_json(evidence / "compiled-container.json", {"id": container, "name": name})
    try:
        actual = docker_api("GET", "/containers/" + container + "/json")
        need(actual["Image"] == plan["imageId"] and actual["HostConfig"]["NetworkMode"] == "none"
             and actual["HostConfig"]["ReadonlyRootfs"] and not actual["HostConfig"].get("PortBindings")
             and not any(item["Type"] == "bind" for item in actual["Mounts"]), "QUALIFICATION_ISOLATION")
        need(archive_backend(container) == plan["backendSha256"], "COMPILED_ARTIFACT_PIN")
        docker_api("POST", "/containers/" + container + "/start")
        exited = docker_api("POST", "/containers/" + container + "/wait?condition=not-running", timeout=25)
        raw = docker_bytes("GET", "/containers/" + container + "/logs?stdout=1&stderr=1", limit=262144)
        stdout, stderr = demux(raw)
        save_private(evidence / "compiled.stdout.log", stdout)
        save_private(evidence / "compiled.stderr.log", stderr)
        need(exited["StatusCode"] == 1 and len(stdout.splitlines()) == 1 and
             json.loads(stdout) == {"ok": False, "error": "client-invalid-request"}, "COMPILED_CLI_DISPATCH")
    finally:
        actual = docker_api("GET", "/containers/" + container + "/json")
        if actual["State"]["Running"]:
            docker_api("POST", "/containers/" + container + "/stop?t=5", timeout=10)
    actual = docker_api("GET", "/containers/" + container + "/json")
    need(not actual["State"]["Running"] and not actual["State"]["OOMKilled"], "QUALIFICATION_NOT_STOPPED")
    proof = {"ok": True, "revision": plan["revision"], "imageId": plan["imageId"],
             "backendSha256": plan["backendSha256"], "operatorSha256": digest(Path(__file__).read_bytes()),
             "invalidRequestDispatch": True, "exitedWithoutListener": True, "network": "none",
             "customerStorageAccessed": False, "compiledContainer": container,
             "stoppedAt": actual["State"]["FinishedAt"], "oomKilled": False}
    save_json(evidence / "compiled-proof.json", proof)
    return {"ok": True, "phase": "qualify-compiled", "proof": str(evidence / "compiled-proof.json"),
            "proofSha256": digest(plain_file(evidence / "compiled-proof.json", private=True))}


def validate_client(value, name):
    client = value.get("client")
    need(isinstance(client, dict) and uuid_value(client.get("id")) and client.get("name") == name
         and client.get("enabled") is True and client.get("gameIds") == [GAME_ID], "CLI_CLIENT_BINDING")
    return client


def verify_client(plan, evidence, credential, definition, projection, selection, initial_identity):
    client = ClientHttp()
    transport = None
    room = None
    closed = False
    failure = None
    proof = {}
    try:
        session = client.json("/api/client-access/session", method="POST", value={"code": credential["code"]})
        need(session.get("kind") == "managed-client" and session.get("role") == "manager"
             and session.get("client", {}).get("id") == credential["clientId"] and "code" not in session
             and "token" not in session and "tdz_client_auth" in client.cookies, "CLIENT_LOGIN_BINDING")
        library = client.json("/api/client-access/games")
        games = library.get("games")
        need(isinstance(games, list) and len(games) == 1 and games[0].get("id") == GAME_ID
             and games[0].get("themeId") == THEME and games[0].get("customTheme") is False
             and games[0].get("available") is True and games[0].get("questionCount") == 23, "CLIENT_LIBRARY_SCOPE")
        for path in ("/api/managed-clients", "/api/quizz", "/api/accounts/me"):
            client.request(path, expected=401)
        need(live_identity(plan) == initial_identity, "APP_CHANGED_BEFORE_TEST_LAUNCH")
        save_json(evidence / "launch-intent.json", {"requestId": plan["launchRequestId"], "quizId": GAME_ID})
        launched = client.json("/api/client-access/games/" + GAME_ID + "/launch", method="POST", expected=201,
                               value={"requestId": plan["launchRequestId"]})
        need(uuid_value(launched.get("gameId")) and launched.get("hostUrl") ==
             "/party/manager/" + launched["gameId"], "CLIENT_LAUNCH_SCHEMA")
        room = launched["gameId"]
        save_json(evidence / "owned-test-room.json", {"gameId": room, "requestId": plan["launchRequestId"],
                                                     "clientId": credential["clientId"], "startedQuiz": False})
        transport = NativePolling(client)
        transport.open()
        transport.emit("manager:reconnect", room)
        connected = transport.event("manager:successReconnect")
        need(connected.get("gameId") == room and connected.get("players") == [] and
             connected.get("status", {}).get("name") == "SHOW_ROOM", "NATIVE_MANAGER_BINDING")
        snapshot = transport.event("extensions:state")
        need(snapshot.get("gameId") == room and snapshot.get("v") == 1, "NATIVE_STATE_BINDING")
        extras = snapshot.get("extras", {})
        verifier = verifier_module()
        current = plan["currentNativeGame"]
        need(definition == current["builtinDefinition"]
             and digest(canonical(definition)) == current["builtinDefinitionCanonicalSha256"], "BUILTIN_DEFINITION_CHANGED")
        actual_projection = verifier.manager_projection(extras)
        need(actual_projection == projection and
             digest(canonical(actual_projection)) == current["acceptedManagerProjectionSha256"] and
             extras.get("defaults", {}).get("showTheme") == selection, "NATIVE_CONFIGURATION_CHANGED")
        entry = public_artifact_probe(launched["hostUrl"] + "?client=1", current["nativeEntryHtml"])
        media = {asset["url"]: public_artifact_probe(asset["url"], asset) for asset in current["nativeMedia"]}
        proof = {"freshHttpOnlySession": True, "onlyAssignedNativeGame": True,
                 "ownerApisDenied": True, "nativeManagerReconnect": True,
                 "builtinThemeSelectionPreserved": True, "customTheme": False,
                 "nativeManagerConfigurationVerified": True,
                 "acceptedManagerProjectionSha256": current["acceptedManagerProjectionSha256"],
                 "nativeEntryHttpBytesVerified": True, "nativeEntryHtml": entry,
                 "nativeMediaHttpBytesVerified": True, "nativeMedia": media,
                 "currentNativeSnapshotSha256": plan["currentNativeSnapshotSha256"],
                 "questionDocumentSha256": current["questionDocumentSha256"],
                 "acceptedNativeQuestionsSha256": current["acceptedNativeQuestionsSha256"],
                 "proofKind": "accepted-configuration-pinned-source-and-HTTP-bytes",
                 "observedPlaybackClaimed": False, "visualRenderingClaimed": False,
                 "quizStarted": False, "resultsCreated": False}

    except Exception as error:
        failure = error
    finally:
        if room:
            cleanup = cleanup_owned_room(plan, evidence, client, transport, room, initial_identity)
            closed = cleanup["closed"]
            if not closed and failure is None:
                failure = GateError("OWNED_TEST_ROOM_REQUIRES_RECONCILIATION")
        elif transport is not None:
            transport.close()
        try:
            if "tdz_client_auth" in client.cookies:
                result = client.json("/api/client-access/session", method="DELETE")
                need(result == {"status": "signed-out"}, "TEST_SESSION_RETIREMENT")
                proof["onlyTestSessionRetired"] = True
        except Exception:
            if failure is None:
                failure = GateError("TEST_SESSION_REQUIRES_RECONCILIATION")
        client.cookies.clear()
    if failure is not None:
        raise failure
    need(room is not None and closed, "OWNED_TEST_ROOM_NOT_CLOSED")
    proof["ownedUnstartedRoomClosed"] = True
    return proof


def provision(plan, evidence, compiled_hash):
    need(not (evidence / "create-intent.json").exists(), "CREATE_ALREADY_ATTEMPTED_USE_RECOVER")
    raw = plain_file(evidence / "compiled-proof.json", private=True)
    need(HEX.fullmatch(compiled_hash or "") and digest(raw) == compiled_hash, "COMPILED_PROOF_PIN")
    compiled = json.loads(raw)
    need(compiled.get("ok") is True and compiled.get("exitedWithoutListener") is True and
         compiled.get("customerStorageAccessed") is False and
         all(compiled.get(key) == plan[key] for key in ("revision", "imageId", "backendSha256")) and
         compiled.get("operatorSha256") == digest(Path(__file__).read_bytes()), "COMPILED_PROOF_IDENTITY")
    image_identity(plan)
    initial = live_identity(plan)
    need(archive_backend(plan["liveContainerId"]) == plan["backendSha256"], "LIVE_COMPILED_ARTIFACT_PIN")
    owner, definition, projection, selection, bms = exact_bms(plan)
    save_json(evidence / "live-plan.private.json", plan)
    save_json(evidence / "create-intent.json", {"requestId": plan["createRequestId"], "quizId": GAME_ID,
                                               "upload": UPLOAD, "source": SOURCE,
                                               "currentNativeSnapshotSha256": plan["currentNativeSnapshotSha256"],
                                               "liveIdentity": initial})
    command = {"operation": "create", "ownerId": owner, "quizId": GAME_ID,
               "name": plan["clientName"], "requestId": plan["createRequestId"]}
    value = cli_exec(plan, evidence, "create", command)
    need(value.get("ok") is True, "CREATE_NOT_CONFIRMED_USE_RECOVER")
    client = validate_client(value, plan["clientName"])
    need(re.fullmatch(r"[0-9]{6}", value.get("code", "")), "CLIENT_CODE_FORMAT")
    credential = {"clientId": client["id"], "name": client["name"], "code": value["code"],
                  "entryUrl": APP_ORIGIN + "/client", "gameId": GAME_ID, "requestId": plan["createRequestId"]}
    save_json(evidence / "owner-code.private.json", credential)
    need(live_identity(plan) == initial, "APP_CHANGED_AFTER_CREATE")
    proof = verify_client(plan, evidence, credential, definition, projection, selection, initial)
    need(live_identity(plan) == initial, "APP_CHANGED_AFTER_VERIFICATION")
    _, _, _, _, after_bms = exact_bms(plan)
    need(after_bms == bms, "BMS_CHANGED_DURING_VERIFICATION")
    receipt = {"schemaVersion": 3, "variant": "original-native-builtin-game", "ok": True, "phase": "provision", "revision": plan["revision"], "imageId": plan["imageId"],
               "clientId": client["id"], "assignedGameId": GAME_ID, "entryUrl": APP_ORIGIN + "/client",
               "codePrinted": False, "credentialPath": str(evidence / "owner-code.private.json"),
               "ownerDerivedFromExactUpload": True, "createdThroughValidatedCli": True,
               "bmsNativeSnapshotUnchanged": True,
               "currentNativeSnapshotSha256": plan["currentNativeSnapshotSha256"], "verification": proof}
    save_json(evidence / "provision-receipt.json", receipt)
    return receipt


def recover(plan, evidence):
    intent = json.loads(plain_file(evidence / "create-intent.json", private=True))
    need(intent["requestId"] == plan["createRequestId"] and intent["quizId"] == GAME_ID and
         intent.get("currentNativeSnapshotSha256") == plan.get("currentNativeSnapshotSha256") and
         HEX.fullmatch(plan.get("currentNativeSnapshotSha256") or ""),
         "RECOVERY_REQUEST_MISMATCH")
    need(live_identity(plan) == intent["liveIdentity"], "RECOVERY_APP_CHANGED_RECONCILE")
    if (evidence / "create.exec.json").exists():
        execution = json.loads(plain_file(evidence / "create.exec.json", private=True))
        need(not docker_api("GET", "/exec/" + execution["id"] + "/json")["Running"],
             "CREATE_STILL_RUNNING_RECONCILE")
    owner, _, _, _, _ = exact_bms(plan)
    label = "recovery-" + uuid.uuid4().hex[:10]
    result = cli_exec(plan, evidence, label, {"operation": "lookup", "ownerId": owner,
        "quizId": GAME_ID, "requestId": plan["createRequestId"]})
    need(result.get("ok") is True and "code" not in result, "RECOVERY_LOOKUP_FAILED")
    found = result.get("client")
    if found is not None:
        validate_client(result, plan["clientName"])
    retained = (evidence / "owner-code.private.json").exists()
    if found is not None and not retained and (evidence / "create.stdout.private").exists():
        # Recover only bytes already captured from that exact CLI invocation.
        # The service is never asked to redisclose a code and no code is rotated.
        captured = json.loads(plain_file(evidence / "create.stdout.private", private=True))
        need(captured.get("ok") is True and validate_client(captured, plan["clientName"])["id"] == found["id"]
             and re.fullmatch(r"[0-9]{6}", captured.get("code", "")), "RECOVERY_CAPTURE_BINDING")
        save_json(evidence / "owner-code.private.json", {
            "clientId": found["id"], "name": found["name"], "code": captured["code"],
            "entryUrl": APP_ORIGIN + "/client", "gameId": GAME_ID, "requestId": plan["createRequestId"],
        })
        retained = True
    if retained:
        value = json.loads(plain_file(evidence / "owner-code.private.json", private=True))
        need(found is not None and value["clientId"] == found["id"] and
             value["requestId"] == plan["createRequestId"] and re.fullmatch(r"[0-9]{6}", value["code"]),
             "RECOVERY_CREDENTIAL_BINDING")
    summary = {"ok": True, "phase": "recover", "clientFound": found is not None,
               "credentialCaptured": retained, "createRetried": False, "codeRotated": False,
               "requiresOwnerRecovery": found is not None and not retained,
               "reconciliationRequired": True, "verificationRetried": False}
    if (evidence / "owned-test-room.json").exists():
        recorded = json.loads(plain_file(evidence / "owned-test-room.json", private=True))
        need(recorded.get("requestId") == plan["launchRequestId"] and
             found is not None and recorded.get("clientId") == found["id"] and
             uuid_value(recorded.get("gameId")), "RECOVERY_TEST_ROOM_BINDING")
        summary["ownedTestRoomRecorded"] = True
        if (evidence / "owned-test-room-cleanup.json").exists():
            cleanup = json.loads(plain_file(evidence / "owned-test-room-cleanup.json", private=True))
            need(cleanup.get("gameId") == recorded["gameId"], "RECOVERY_CLEANUP_ROOM_BINDING")
            summary["ownedTestRoomCleanupConfirmed"] = cleanup.get("closed") is True
        else:
            summary["ownedTestRoomCleanupConfirmed"] = False
        summary["ownedTestRoomReconciliationRequired"] = not summary["ownedTestRoomCleanupConfirmed"]
    save_json(evidence / (label + ".receipt.json"), summary)
    return summary


def read_plan(path, pin, phase):
    raw = plain_file(path, private=True)
    need(HEX.fullmatch(pin or "") and digest(raw) == pin, "PLAN_PIN")
    plan = json.loads(raw)
    need(plan.get("schemaVersion") == 3 and plan.get("variant") == "original-native-builtin-game" and REVISION.fullmatch(plan.get("revision") or "") and
         IMAGE.fullmatch(plan.get("imageId") or "") and HEX.fullmatch(plan.get("backendSha256") or ""),
         "CANDIDATE_PLAN_INCOMPLETE")
    need(plan.get("appOrigin") == APP_ORIGIN and plan.get("configRoot") == str(CONFIG_ROOT), "PLAN_SCOPE")
    need(plan.get("createRequestId") == CREATE_REQUEST and plan.get("launchRequestId") == LAUNCH_REQUEST and isinstance(plan.get("clientName"), str)
         and 1 <= len(plan["clientName"]) <= 120, "PLAN_REQUEST_IDENTITY")
    if phase != "qualify-compiled":
        need(HEX.fullmatch(plan.get("liveContainerId") or ""), "LIVE_PLAN_INCOMPLETE")
    verifier_module().validate_current_evidence(plan.get("currentNativeGame"), plan.get("currentNativeSnapshotSha256"))
    need(plan["currentNativeGame"]["sourceRevision"] == plan["revision"], "NATIVE_SOURCE_REVISION")
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", required=True, choices=("qualify-compiled", "provision", "recover"))
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--compiled-proof-sha256")
    args = parser.parse_args()
    need(os.geteuid() == 0, "ROOT_REQUIRED")
    os.umask(0o077)
    plan = read_plan(args.plan, args.plan_sha256, args.phase)
    private_dir(PRIVATE_ROOT, create=True)
    evidence = PRIVATE_ROOT / plan["createRequestId"]
    private_dir(evidence, create=args.phase == "qualify-compiled")
    with deployment_lock():
        if args.phase == "qualify-compiled":
            need(not (evidence / "compiled-container.json").exists(), "QUALIFICATION_EXISTS_RECONCILE")
            result = compiled_qualification(plan, evidence)
        elif args.phase == "provision":
            result = provision(plan, evidence, args.compiled_proof_sha256)
        else:
            result = recover(plan, evidence)
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except GateError as error:
        print(json.dumps({"ok": False, "error": str(error), "reconciliationRequired": True,
                          "codePrinted": False}))
        raise SystemExit(1)
    except Exception as error:
        # Response bodies, subprocess details, customer paths and credentials must
        # never be included in shared logs or a traceback.
        print(json.dumps({"ok": False, "error": "OWNER_PROVISION_FAILED", "errorType": type(error).__name__,
                          "reconciliationRequired": True, "codePrinted": False}))
        raise SystemExit(1)
