#!/usr/bin/env python3
"""Guarded, explicit Tadazz MCP cutover on the inspected Oracle Linux host.

Default --action preflight is read-only. --action qualify-backup stops only long
enough to archive, restarts the old application, then checks the private restore.
With --qualify-candidate it boots the pinned image on that clone, without network
or ports. --action deploy requires this proof, takes a fresh consistent archive,
then replaces only that container and checks the fresh restore after startup.
Deployment NEVER restores over live data,
deletes a container/image/file, generates keys, edits a proxy, or prints secrets.
Run --self-test locally for bounded failure-path/backup tests using synthetic data.
"""

import argparse
import base64
import copy
import datetime as dt
import hashlib
import http.client
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import socket
import sqlite3
import stat
import struct
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


CONFIG_ROOT = Path("/var/lib/tadazz-release-5312660/config")
# Same runtime base qualified by stage-mcp-site.py; independent of the live rollback image.
QUALIFIED_BUILD_BASE_IMAGE = "sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346"
PUBLIC_ORIGIN = "https://tadazz.com"
# Initial consent advertises the ordered tool-scope union (server/http.ts).
MCP_SCOPES = (
    "tadazz.catalog.read", "tadazz.drafts.write", "tadazz.drafts.read",
    "tadazz.library.write", "tadazz.exports.read",
)
MCP_CHALLENGE = ('Bearer resource_metadata="' + PUBLIC_ORIGIN +
                 '/.well-known/oauth-protected-resource", scope="' + " ".join(MCP_SCOPES) + '"')
LOCAL_ORIGIN = "http://127.0.0.1:3000"
ENV_OVERRIDES = {
    "CONFIG_PATH": "/app/config",
    "SOCKET_PORT": "3001",
    "TADAZZ_MCP_SERVICE_ENABLED": "true",
    "TADAZZ_INLINE_GAME_PREVIEW_ENABLED": "true",
}
MAX_TREE_BYTES = 16 * 1024**3
MAX_FILES = 200000
MAX_LOG_BYTES = 16 * 1024**2
IMAGE_RE = re.compile(r"^sha256:[a-f0-9]{64}$")
SHA_RE = re.compile(r"^[a-f0-9]{40}$")
HEX_RE = re.compile(r"^[a-f0-9]{64}$")


class GateError(RuntimeError):
    """Only fixed, non-sensitive reason codes may reach stdout."""


def require(condition, code):
    if not condition:
        raise GateError(code)


def sha256(path):
    result = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def plain_path(path, directory=True, root_owned=False):
    path = Path(path)
    require(path.is_absolute() and path == Path(os.path.normpath(path)), "PATH_NOT_ABSOLUTE_CANONICAL")
    chain = list(reversed(path.parents)) + [path]
    for index, component in enumerate(chain):
        info = component.lstat()
        require(not stat.S_ISLNK(info.st_mode), "SYMLINK_REJECTED")
        expected_dir = directory or index < len(chain) - 1
        require(stat.S_ISDIR(info.st_mode) if expected_dir else stat.S_ISREG(info.st_mode), "PATH_TYPE_REJECTED")
    if root_owned:
        info = path.stat()
        require(info.st_uid == 0 and not info.st_mode & 0o022, "PATH_OWNER_MODE_REJECTED")
    return path


def read_json(path, limit=1024 * 1024):
    plain_path(path, directory=False)
    require(path.stat().st_size <= limit, "JSON_TOO_LARGE")
    return json.loads(path.read_bytes())


def write_private_json(path, value):
    # Unique destination, no overwrite of previous receipts or private backups.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(json.dumps(value, indent=2, sort_keys=True).encode() + b"\n")
        stream.flush()
        os.fsync(stream.fileno())


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect("/var/run/docker.sock")


def docker_bytes(method, path, body=None, limit=4 * 1024**2):
    connection = DockerConnection("localhost", timeout=45)
    encoded = None if body is None else json.dumps(body).encode()
    try:
        connection.request(method, path, body=encoded, headers={"Content-Type": "application/json"})
        response = connection.getresponse()
        content = response.read(limit + 1)
        require(len(content) <= limit, "DOCKER_RESPONSE_LIMIT")
        # Do not echo Docker error bodies: they can contain env or private paths.
        require(response.status < 400, "DOCKER_HTTP_" + str(response.status))
        return content
    finally:
        connection.close()


def docker_api(method, path, body=None):
    content = docker_bytes(method, path, body)
    return json.loads(content) if content else None


def inspect(container):
    return docker_api("GET", "/containers/" + container + "/json")


def env_map(items):
    result = {}
    for entry in items or []:
        require(isinstance(entry, str) and "=" in entry, "ENV_INVALID")
        name, value = entry.split("=", 1)
        require(name and name not in result, "ENV_DUPLICATE")
        result[name] = value
    return result


def package_probe_policy(container):
    # Docker Config.Env is immutable for this inspected container identity.
    # Accounts are mandatory here; the application's REMOTE_QA exception cannot
    # admit an account-disabled deployment or change this expected status.
    environment = env_map(container["Config"].get("Env"))
    require(environment.get("TADAZZ_ACCOUNTS_ENABLED") == "true", "PACKAGE_PROBE_ACCOUNTS_REQUIRED")
    enabled = environment.get("TADAZZ_PACKAGE_INSTALLER_ENABLED") == "true"
    return {"accountsEnabled": True, "installerEnabled": enabled,
            "expectedStatus": 401 if enabled else 404}


def package_probe_proof(policy):
    require(isinstance(policy, dict) and set(policy) == {"accountsEnabled", "installerEnabled", "expectedStatus"} and
            policy["accountsEnabled"] is True and type(policy["installerEnabled"]) is bool and
            policy["expectedStatus"] == (401 if policy["installerEnabled"] else 404), "PACKAGE_PROBE_POLICY_INVALID")
    return {**policy, "status": policy["expectedStatus"], "contentType": "application/json"}


def record_probe_failure(report, error, key="probeFailure"):
    if isinstance(error, GateError) and hasattr(error, "probe"):
        report[key] = error.probe


def safe_probe_routes(value):
    require(isinstance(value, dict) and len(value) <= 128, "PROBE_DIAGNOSTIC_SCHEMA")
    result = {}
    for path, item in value.items():
        require(isinstance(path, str) and len(path) <= 2048 and
                re.fullmatch(r"(?:GET|HEAD|POST) /[A-Za-z0-9_./-]*", path), "PROBE_DIAGNOSTIC_PATH")
        require(isinstance(item, dict) and set(item) == {"status", "expectedStatus", "contentType"} and
                type(item["status"]) is int and 100 <= item["status"] <= 599 and
                type(item["expectedStatus"]) is int and 100 <= item["expectedStatus"] <= 599 and
                isinstance(item["contentType"], str) and len(item["contentType"]) <= 128 and
                (not item["contentType"] or re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+", item["contentType"])),
                "PROBE_DIAGNOSTIC_VALUE")
        result[path] = dict(item)
    return result


def replacement_payload(original, image, revision, run_id):
    payload = copy.deepcopy(original["Config"])
    previous = env_map(payload.get("Env"))
    for name in ("TMPDIR", "TEMP", "TMP"):
        value = previous.get(name)
        if value:
            require(value.startswith("/") and value != "/app/config" and not value.startswith("/app/config/"), "TEMP_INSIDE_CUSTOMER_CONFIG")
    merged = {**previous, **ENV_OVERRIDES}
    payload["Env"] = [name + "=" + value for name, value in merged.items()]
    payload["Image"] = image["Id"]
    payload["Labels"] = {
        **(payload.get("Labels") or {}),
        "org.opencontainers.image.revision": revision,
        "com.tadazz.mcp.channel": "private",
        "com.tadazz.mcp.deployment": run_id,
    }
    payload["HostConfig"] = copy.deepcopy(original["HostConfig"])
    return payload


def decode_logs(raw, tty=False):
    if tty:
        return raw.decode("utf-8", errors="replace")
    parts, offset = [], 0
    while offset < len(raw):
        require(len(raw) - offset >= 8, "LOG_FRAME_TRUNCATED")
        channel, zero, length = raw[offset], raw[offset + 1:offset + 4], struct.unpack(">I", raw[offset + 4:offset + 8])[0]
        require(channel in (1, 2) and zero == b"\x00\x00\x00", "LOG_FRAME_INVALID")
        offset += 8
        require(offset + length <= len(raw), "LOG_FRAME_TRUNCATED")
        parts.append(raw[offset:offset + length])
        offset += length
    return b"".join(parts).decode("utf-8", errors="replace")


def game_count_evidence(original):
    started = dt.datetime.fromisoformat(original["State"]["StartedAt"].replace("Z", "+00:00"))
    query = urllib.parse.urlencode({"stdout": 1, "stderr": 1, "timestamps": 1, "since": int(started.timestamp()), "tail": "all"})
    raw = docker_bytes("GET", "/containers/" + original["Id"] + "/logs?" + query, limit=MAX_LOG_BYTES)
    logs = decode_logs(raw, bool(original["Config"].get("Tty")))
    # Original native entrypoint uses this exact wording; match the timestamped
    # line from the pinned production container, not an arbitrary log substring.
    native_startup = False
    for line in logs.splitlines():
        match = re.fullmatch(r"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?(?:Z|[+-][0-9]{2}:[0-9]{2})) Server running on port 3001", line)
        if match:
            try:
                startup_at = dt.datetime.fromisoformat(match.group(1).replace("Z", "+00:00"))
            except ValueError:
                continue
            if startup_at >= started:
                native_startup = True
    require(native_startup or "Socket server is running" in logs or "Server is running" in logs or "Tadazz protected native host listening on loopback" in logs, "LOG_STARTUP_NOT_RETAINED")
    witnesses = []
    for line in logs.splitlines():
        match = re.search(r"(?:Total games:|Remaining games:)\s*(\d+)", line)
        if match:
            timestamp = line.split(" ", 1)[0]
            parsed = dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            require(parsed >= started - dt.timedelta(seconds=1), "ROOM_LOG_PRECEDES_START")
            witnesses.append((int(match.group(1)), timestamp))
    if witnesses:
        require(witnesses[-1][0] == 0, "ACTIVE_ROOMS_PRESENT")
    # Registry emits on every add/remove, not as a heartbeat. Retain age honestly;
    # a stale quiet zero is not a fresh authoritative in-process registry query.
    return {"count": 0, "source": "complete-retained-container-log-events" if witnesses else "retained-startup-empty-registry-no-subsequent-game-events",
            "lastCountAt": witnesses[-1][1] if witnesses else original["State"]["StartedAt"],
            "observedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "logBytes": len(raw),
            "checkStopRaceEliminated": False}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def request(origin, path, expected_status=200, method="GET", data=None, max_bytes=4 * 1024**2):
    require(path.startswith("/") and not path.startswith("//"), "PROBE_PATH_INVALID")
    headers = {"Host": "tadazz.com", "Accept": "*/*", "Accept-Encoding": "identity", "User-Agent": "Tadazz-guarded-release/1"}
    if data is not None:
        headers["Content-Type"] = "text/plain;charset=UTF-8"
    query = urllib.request.Request(origin + path, headers=headers, method=method, data=data)
    try:
        response = HTTP.open(query, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        probe = {"path": path.split("?", 1)[0], "method": method, "status": response.status,
                 "expectedStatus": expected_status, "contentType": content_type}
        # Keep only status metadata on a rejected response; never its body,
        # authorization headers or URL query (which may contain a capability).
        if len(content_type) > 128 or (content_type and not re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+", content_type)):
            probe["contentType"] = "invalid"
        try:
            content = response.read(max_bytes + 1)
            require(len(content) <= max_bytes, "PROBE_BODY_LIMIT")
            require(response.status == expected_status, "PROBE_STATUS_" + str(response.status) + "_EXPECTED_" + str(expected_status))
        except GateError as error:
            error.probe = probe
            raise
        return {"status": response.status, "headers": {k.lower(): v for k, v in response.headers.items()},
                "body": content, "diagnostic": probe}


def json_probe(origin, path, expected_status=200, expected=None):
    response = request(origin, path, expected_status)
    try:
        require(response["headers"].get("content-type", "").startswith("application/json"), "PROBE_NOT_JSON")
        try:
            value = json.loads(response["body"])
        except (ValueError, UnicodeError):
            raise GateError("PROBE_JSON_INVALID") from None
        if expected is not None:
            require(value == expected, "PROBE_JSON_VALUE")
    except GateError as error:
        error.probe = response["diagnostic"]
        raise
    return value, response


def base_probes(origin, package_policy):
    package_proof = package_probe_proof(package_policy)
    json_probe(origin, "/api/health", expected={"status": "ok"})
    json_probe(origin, "/api/auth/mode", expected={"accountsEnabled": True})
    json_probe(origin, "/api/billing/config", expected={"enabled": False})
    for path in ("/api/billing", "/api/quizz", "/api/results", "/api/accounts/me"):
        request(origin, path, 401)
    expected_error = "errors:auth.unauthorized" if package_policy["installerEnabled"] else "not-found"
    _, response = json_probe(origin, "/api/packages/capabilities", package_policy["expectedStatus"],
                             expected={"error": expected_error})
    actual = {**package_policy, "status": response["status"],
              "contentType": response["diagnostic"]["contentType"]}
    if actual != package_proof:
        error = GateError("PACKAGE_PROBE_RESPONSE_MISMATCH")
        error.probe = response["diagnostic"]
        raise error
    return {"packageCapabilities": actual}


def socket_probe(origin):
    query = "/ws/?EIO=4&transport=polling&t=" + uuid.uuid4().hex
    opened = request(origin, query, max_bytes=65536)["body"]
    require(opened.startswith(b"0"), "ENGINEIO_OPEN_PACKET_MISSING")
    packet = json.loads(opened[1:])
    require(isinstance(packet.get("sid"), str) and re.fullmatch(r"[A-Za-z0-9_-]{1,256}", packet["sid"]), "ENGINEIO_SID_INVALID")
    require(isinstance(packet.get("pingInterval"), int) and isinstance(packet.get("pingTimeout"), int), "ENGINEIO_TIMING_MISSING")
    # Close the synthetic transport. No namespace auth, room, player or vote.
    request(origin, query + "&sid=" + packet["sid"], method="POST", data=b"1", max_bytes=65536)


def native_preview_files(stage):
    manifest = read_json(plain_path(stage / "stage-manifest.json", directory=False))
    files = manifest.get("nativeApplicationPreview", {}).get("files")
    require(isinstance(files, list) and len(files) == 2 and
            {item.get("name") for item in files} == {"renderer.mjs", "renderer.css"},
            "NATIVE_PREVIEW_FILES_MISSING")
    for item in files:
        require(isinstance(item.get("bytes"), int) and 0 < item["bytes"] <= 10_000_000 and
                isinstance(item.get("sha256"), str) and HEX_RE.fullmatch(item["sha256"]),
                "NATIVE_PREVIEW_FILE_PIN_INVALID")
        file = plain_path(stage / "web/tadazz-application-runtime" / item["name"], directory=False)
        require(file.stat().st_size == item["bytes"] and sha256(file) == item["sha256"],
                "NATIVE_PREVIEW_PACKAGED_BYTES_CHANGED")
    return files


def native_preview_proof(files):
    return {"files": files, "inlinePreviewEnabled": True, "packagedHttpBytes": True,
            "privateRuntimeUnauthorized": True, "publicRuntimeDisabled": True,
            "authenticatedStudioRender": False}


def native_preview_probes(origin, stage):
    files = native_preview_files(stage)
    for item in files:
        response = request(origin, "/tadazz-application-runtime/" + item["name"], max_bytes=item["bytes"])
        require(len(response["body"]) == item["bytes"] and
                hashlib.sha256(response["body"]).hexdigest() == item["sha256"],
                "NATIVE_PREVIEW_HTTP_BYTES_MISMATCH")
        request(origin, "/api/extensions/preview/runtime/" + item["sha256"] + "/" + item["name"], 401)
        request(origin, "/api/extensions/preview/public-runtime/" + item["sha256"] + "/" + item["name"], 404)
    return native_preview_proof(files)


def mcp_probes(origin, stage, config, public_key_x):
    resource, _ = json_probe(origin, "/.well-known/oauth-protected-resource")
    require(resource.get("resource") == PUBLIC_ORIGIN + "/mcp" and resource.get("authorization_servers") == [PUBLIC_ORIGIN + "/oauth"], "RESOURCE_METADATA_MISMATCH")
    require(resource.get("scopes_supported") == list(MCP_SCOPES), "RESOURCE_SCOPES_MISMATCH")
    issuer, _ = json_probe(origin, "/.well-known/oauth-authorization-server/oauth")
    require(issuer.get("issuer") == PUBLIC_ORIGIN + "/oauth", "ISSUER_METADATA_MISMATCH")
    require(issuer.get("authorization_endpoint") == PUBLIC_ORIGIN + "/oauth/authorize" and issuer.get("token_endpoint") == PUBLIC_ORIGIN + "/oauth/token", "OAUTH_ENDPOINT_MISMATCH")
    require("S256" in issuer.get("code_challenge_methods_supported", []), "PKCE_S256_MISSING")
    require(issuer.get("scopes_supported") == list(MCP_SCOPES), "ISSUER_SCOPES_MISMATCH")
    jwks, _ = json_probe(origin, "/oauth/jwks.json")
    require(isinstance(jwks.get("keys"), list) and len(jwks["keys"]) == 1, "JWKS_COUNT")
    key = jwks["keys"][0]
    require(key.get("kid") == config["keyId"] and key.get("kty") == "OKP" and key.get("crv") == "Ed25519" and key.get("x") == public_key_x and "d" not in key, "JWKS_PUBLIC_KEY_MISMATCH")
    _, protected = json_probe(origin, "/mcp", 401)
    require(protected["headers"].get("www-authenticate") == MCP_CHALLENGE, "MCP_CHALLENGE_MISMATCH")
    for path in ("/studio/oauth-consent?oauth_request=release-smoke", "/studio/native-save-consent/" + "a" * 54):
        for method in ("GET", "HEAD"):
            response = request(origin, path, method=method)
            headers = response["headers"]
            require(headers.get("content-type", "").startswith("text/html"), "CONSENT_NOT_HTML")
            require(headers.get("cache-control") == "no-store" and headers.get("x-frame-options") == "DENY" and headers.get("referrer-policy") == "no-referrer", "CONSENT_SECURITY_HEADERS")
            require("frame-ancestors 'none'" in headers.get("content-security-policy", ""), "CONSENT_CSP")
            require(bool(response["body"]) if method == "GET" else not response["body"], "CONSENT_METHOD_BODY")
    index = (stage / "web/index.html").read_bytes()
    require(request(origin, "/")["body"] == index, "WEB_INDEX_ARTIFACT_MISMATCH")
    assets = sorted(set(re.findall(r'(?:src|href)=["\'](/assets/[^"\'?#]+)', index.decode("utf-8"))))
    require(0 < len(assets) <= 100, "WEB_ENTRY_ASSETS_MISSING")
    for path in assets:
        local = stage / "web" / path.lstrip("/")
        plain_path(local, directory=False)
        require(local.stat().st_size <= 8 * 1024**2, "WEB_ENTRY_ASSET_TOO_LARGE")
        require(hashlib.sha256(request(origin, path, max_bytes=8 * 1024**2)["body"]).hexdigest() == sha256(local), "WEB_ASSET_ARTIFACT_MISMATCH")
    socket_probe(origin)
    return {"oauthAndMcp": True, "consentGetHead": True, "indexAndEntryAssets": len(assets), "engineIoOpenClose": True,
            "nativeApplicationPreview": native_preview_probes(origin, stage),
            "installedHostTest": False, "authenticatedGameplayTest": False}


def wait_health(seconds=50):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            json_probe(LOCAL_ORIGIN, "/api/health", expected={"status": "ok"})
            return
        except Exception:
            time.sleep(1)
    raise GateError("STARTUP_HEALTH_TIMEOUT")


def tree_manifest(root):
    root = plain_path(root)
    result, total, count = {}, 0, 0
    root_device = root.stat().st_dev
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in sorted(dirs + files):
            path = Path(directory) / name
            info = path.lstat()
            require(info.st_dev == root_device and not stat.S_ISLNK(info.st_mode), "PRIVATE_TREE_LINK_OR_MOUNT")
            require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode), "PRIVATE_TREE_SPECIAL_FILE")
            entry = {"kind": "directory" if stat.S_ISDIR(info.st_mode) else "file", "mode": stat.S_IMODE(info.st_mode), "uid": info.st_uid, "gid": info.st_gid}
            if entry["kind"] == "file":
                require(info.st_nlink == 1, "PRIVATE_TREE_HARDLINK")
                total += info.st_size
                count += 1
                require(total <= MAX_TREE_BYTES and count <= MAX_FILES, "PRIVATE_TREE_LIMIT")
                entry.update(size=info.st_size, sha256=sha256(path))
            result[str(path.relative_to(root))] = entry
    return result, total, count


def extract_checked(archive, destination, expected):
    destination.mkdir(mode=0o700)
    seen = set()
    with tarfile.open(archive, "r:gz") as stream:
        members = stream.getmembers()
        require(len(members) == len(expected), "RESTORE_MEMBER_COUNT")
        for member in members:
            relative = PurePosixPath(member.name)
            require(not relative.is_absolute() and ".." not in relative.parts and str(relative) == member.name, "RESTORE_TRAVERSAL")
            require(member.name in expected and member.name not in seen, "RESTORE_UNEXPECTED_MEMBER")
            seen.add(member.name)
            spec = expected[member.name]
            require((member.isdir() and spec["kind"] == "directory") or (member.isfile() and spec["kind"] == "file"), "RESTORE_LINK_OR_SPECIAL")
            require(member.mode == spec["mode"] and member.uid == spec["uid"] and member.gid == spec["gid"], "RESTORE_METADATA_MISMATCH")
            target = destination.joinpath(*relative.parts)
            if member.isdir():
                target.mkdir(mode=0o700, exist_ok=False)
            else:
                require(member.size == spec["size"], "RESTORE_FILE_SIZE")
                fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
                with os.fdopen(fd, "wb") as output, stream.extractfile(member) as source:
                    shutil.copyfileobj(source, output, length=1024 * 1024)
                    output.flush()
                    os.fsync(output.fileno())
                os.chmod(target, spec["mode"])
                if hasattr(os, "chown"):
                    os.chown(target, spec["uid"], spec["gid"])
        # Parent directories retain safe extraction permissions until all writes end.
        for name in sorted(expected, key=lambda value: len(PurePosixPath(value).parts), reverse=True):
            spec = expected[name]
            if spec["kind"] == "directory":
                target = destination / name
                os.chmod(target, spec["mode"])
                if hasattr(os, "chown"):
                    os.chown(target, spec["uid"], spec["gid"])
    restored, _, _ = tree_manifest(destination)
    require(restored == expected, "RESTORE_TREE_HASH_MODE_MISMATCH")


def sqlite_restore_checks(restored, expected, proofs):
    proofs.mkdir(mode=0o700)
    checked = 0
    for name, spec in expected.items():
        if spec["kind"] != "file" or spec["size"] < 16:
            continue
        candidate = restored / name
        with candidate.open("rb") as stream:
            header = stream.read(16)
        if header != b"SQLite format 3\x00":
            continue
        # Only the restored private clone is opened. mode=ro retains WAL semantics;
        # immutable=1 would incorrectly ignore WAL and is deliberately not used.
        target = proofs / (hashlib.sha256(name.encode()).hexdigest() + ".sqlite")
        source = sqlite3.connect(candidate.as_uri() + "?mode=ro", uri=True, timeout=5)
        snapshot = sqlite3.connect(target, timeout=5)
        try:
            require(source.execute("PRAGMA quick_check").fetchall() == [("ok",)], "RESTORED_SQLITE_QUICK_CHECK")
            deadline = time.monotonic() + 60
            def progress(status, remaining, total):
                require(time.monotonic() < deadline, "RESTORED_SQLITE_BACKUP_TIMEOUT")
            source.backup(snapshot, pages=256, sleep=0.01, progress=progress)
            require(snapshot.execute("PRAGMA integrity_check").fetchall() == [("ok",)], "RESTORED_SQLITE_INTEGRITY")
        finally:
            snapshot.close()
            source.close()
        os.chmod(target, 0o600)
        checked += 1
    require(checked > 0, "NO_SQLITE_DATABASE_VERIFIED")
    return checked


def archive_private_backup(config, work):
    expected, total, count = tree_manifest(config)
    require(shutil.disk_usage(work).free >= 3 * total + 1024**3, "BACKUP_DISK_RESERVE")
    write_private_json(work / "private-file-manifest.json", expected)
    archive = work / "production-data-private.tar.gz"
    with open(archive, "xb") as raw:
        os.chmod(archive, 0o600)
        with tarfile.open(fileobj=raw, mode="w:gz", dereference=False, compresslevel=1) as stream:
            # Parent directories precede descendants; no followlinks or wildcard tar.
            for name in sorted(expected, key=lambda value: (len(PurePosixPath(value).parts), value)):
                stream.add(config / name, arcname=name, recursive=False)
        raw.flush()
        os.fsync(raw.fileno())
    require(tree_manifest(config)[0] == expected, "PRODUCTION_CHANGED_DURING_STOPPED_BACKUP")
    receipt = {"archive": str(archive), "sha256": sha256(archive), "treeSha256": hashlib.sha256(canonical(expected)).hexdigest(),
               "files": count, "bytes": total, "restoredBytesAndModesVerified": False,
               "consistency": "application-stopped; raw SQLite/WAL/SHM retained", "productionRestorePerformed": False}
    return expected, receipt


def qualify_private_archive(work, expected, receipt):
    archive = Path(receipt["archive"])
    require(sha256(archive) == receipt["sha256"], "PRIVATE_ARCHIVE_PIN_CHANGED")
    restored = work / "restore-private"
    extract_checked(archive, restored, expected)
    checked = sqlite_restore_checks(restored, expected, work / "sqlite-proof-private")
    receipt.update(restoredBytesAndModesVerified=True, sqliteDatabasesVerified=checked,
                   restoreProof="isolated extracted bytes/modes and SQLite backup/integrity")
    return receipt


def private_backup(config, work):
    expected, receipt = archive_private_backup(config, work)
    qualify_private_archive(work, expected, receipt)
    require(tree_manifest(config)[0] == expected, "PRODUCTION_CHANGED_DURING_RESTORE_PROOF")
    return receipt


def validate_config(args, config_root=CONFIG_ROOT):
    require(args.expected_config_sha256 and args.client_id and args.redirect_uri and args.expected_jwk_x, "OAUTH_RUNTIME_PINS_REQUIRED")
    require(HEX_RE.fullmatch(args.expected_config_sha256) and re.fullmatch(r"[A-Za-z0-9_-]{43}", args.expected_jwk_x), "OAUTH_RUNTIME_PIN_FORMAT")
    root = plain_path(config_root, root_owned=True)
    for parent in (root / "extensions", root / "extensions/mcp-service"):
        plain_path(parent, root_owned=True)
    file = root / "extensions/mcp-service/runtime.json"
    plain_path(file, directory=False, root_owned=True)
    info = file.stat()
    require(stat.S_IMODE(info.st_mode) == 0o600 and info.st_uid == 0 and info.st_nlink == 1, "PRIVATE_CONFIG_PERMISSIONS")
    require(2 <= info.st_size <= 65536 and sha256(file) == args.expected_config_sha256, "PRIVATE_CONFIG_PIN_MISMATCH")
    data = read_json(file, 65536)
    require(set(data) == {"version", "origin", "keyId", "signingPrivateKeyPem", "ticketEncryptionKey", "clients"}, "PRIVATE_CONFIG_SCHEMA")
    require(data["version"] == 1 and data["origin"] == PUBLIC_ORIGIN, "PRIVATE_CONFIG_ORIGIN")
    require(isinstance(data["keyId"], str) and 0 < len(data["keyId"]) <= 128, "PRIVATE_CONFIG_KEY_ID")
    require(isinstance(data["signingPrivateKeyPem"], str) and "-----BEGIN PRIVATE KEY-----" in data["signingPrivateKeyPem"], "PRIVATE_CONFIG_SIGNING_KEY")
    require(isinstance(data["ticketEncryptionKey"], str) and re.fullmatch(r"[A-Za-z0-9_-]{43}", data["ticketEncryptionKey"]), "PRIVATE_CONFIG_TICKET_KEY")
    require(len(base64.urlsafe_b64decode(data["ticketEncryptionKey"] + "=")) == 32, "PRIVATE_CONFIG_TICKET_KEY")
    clients = data["clients"]
    require(isinstance(clients, list) and 1 <= len(clients) <= 20, "PRIVATE_CONFIG_CLIENTS")
    matching = []
    for client in clients:
        require(isinstance(client, dict) and set(client) == {"clientId", "redirectUris", "scopes"}, "PRIVATE_CONFIG_CLIENT_SCHEMA")
        uris = client["redirectUris"]
        require(isinstance(uris, list) and 1 <= len(uris) <= 4, "PRIVATE_CONFIG_REDIRECTS")
        for uri in uris:
            require(isinstance(uri, str) and len(uri) <= 2048, "PRIVATE_CONFIG_REDIRECT")
            parsed = urllib.parse.urlsplit(uri)
            require(parsed.scheme == "https" and parsed.hostname and "*" not in parsed.hostname and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment, "PRIVATE_CONFIG_REDIRECT")
        if client["clientId"] == args.client_id:
            matching.append(client)
    require(len(matching) == 1 and set(matching[0]["redirectUris"]) == set(args.redirect_uri), "PRIVATE_CONFIG_EXPECTED_CLIENT_CALLBACK")
    return data


def acquire_deploy_lock():
    import fcntl
    fd = os.open("/run/lock/tadazz-mcp-deploy.lock", os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    info = os.fstat(fd)
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600, "DEPLOY_LOCK_UNSAFE")
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    return fd


def clone_boot(args, original, image, work, run_id, result):
    """Start only the private restored clone, with network NONE and no ports."""
    restored = plain_path(work / "restore-private", root_owned=True)
    validate_config(args, restored)
    native_files = native_preview_files(work.parent)
    payload = replacement_payload(original, image, args.revision, run_id)
    payload["HostConfig"] = {
        "NetworkMode": "none", "Binds": [str(restored) + ":/app/config:rw"],
        "PortBindings": {}, "RestartPolicy": {"Name": "no"}, "Memory": 1024**3,
        "NanoCpus": 1000000000, "PidsLimit": 256, "Privileged": False,
        "LogConfig": {"Type": "json-file", "Config": {"max-size": "5m", "max-file": "1"}},
    }
    name = "tadazz-mcp-restore-proof-" + run_id
    container_id = docker_api("POST", "/containers/create?name=" + name, payload)["Id"]
    result.update(container=container_id, network="none", publishedPorts=False,
                  liveConfigMounted=False, retainedStopped=False, passed=False)
    try:
        candidate = inspect(container_id)
        require(candidate["Image"] == image["Id"] and env_map(candidate["Config"]["Env"]) == env_map(payload["Env"]), "CLONE_IMAGE_ENV_CHANGED")
        require(candidate["HostConfig"]["NetworkMode"] == "none" and not candidate["HostConfig"]["PortBindings"], "CLONE_NETWORK_NOT_ISOLATED")
        mounts = candidate["Mounts"]
        require(len(mounts) == 1 and mounts[0]["Source"] == str(restored) and mounts[0]["Destination"] == "/app/config" and mounts[0]["RW"] is True, "CLONE_MOUNTS_NOT_ISOLATED")
        package_policy = package_probe_policy(candidate)
        result["packagePolicy"] = package_policy
        docker_api("POST", "/containers/" + container_id + "/start")
        # This program contains no credentials. Host/domain and public-key pins are
        # passed as JSON literals; neither private config nor customer data prints.
        program = r'''
const origin = "https://tadazz.com";
const expectedX = EXPECTED_PUBLIC_X;
const expectedScopes = EXPECTED_MCP_SCOPES, expectedChallenge = EXPECTED_MCP_CHALLENGE;
const nativeFiles = NATIVE_PREVIEW_FILES;
const packagePolicy = PACKAGE_PROBE_POLICY, routes = {};
const crypto = require("node:crypto");
let failureCode = "RESTORED_CANDIDATE_PROBE_FAILED";
const fail = (code="RESTORED_CANDIDATE_PROBE_FAILED") => { failureCode=code; throw new Error("clone probe failed"); };
function req(path, status=200, limit=1048576) {
  // Undici may replace caller Host with the loopback transport host. The raw
  // request exercises the exact production Host boundary through local Nginx.
  return new Promise((resolve,reject)=>{
    const q=require("node:http").request({host:"127.0.0.1",port:3000,path,
      headers:{Host:"tadazz.com"},timeout:2500},r=>{
      const chunks=[];let size=0;
      r.on("data",b=>{size+=b.length;if(size>limit){q.destroy();reject(Error("probe limit"));}else chunks.push(b);});
      r.on("end",()=>{routes['GET '+path.split('?')[0]]={status:r.statusCode,expectedStatus:status,
          contentType:String(r.headers['content-type']??'').split(';')[0].trim().toLowerCase()};
        if(r.statusCode!==status){reject(Error("probe status"));return;}
        const body=Buffer.concat(chunks);resolve({body,json:async()=>JSON.parse(body),
          headers:{get:name=>r.headers[name.toLowerCase()]??null}});});
      r.on("error",reject);
    });
    q.on("timeout",()=>q.destroy(Error("probe timeout")));q.on("error",reject);q.end();
  });
}
(async()=>{
  const end=Date.now()+20000; let healthy=false;
  while(Date.now()<end){try{if((await (await req("/api/health")).json()).status==="ok"){healthy=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,250));}
  if(!healthy)fail();
  if((await (await req("/api/auth/mode")).json()).accountsEnabled!==true)fail();
  if((await (await req("/api/billing/config")).json()).enabled!==false)fail();
  await req("/api/billing",401);await req("/api/accounts/me",401);
  if(packagePolicy.accountsEnabled!==true||process.env.TADAZZ_ACCOUNTS_ENABLED!=="true"||
     packagePolicy.installerEnabled!==(process.env.TADAZZ_PACKAGE_INSTALLER_ENABLED==="true")||
     packagePolicy.expectedStatus!==(packagePolicy.installerEnabled?401:404))fail();
  const capabilityResponse=await req("/api/packages/capabilities",packagePolicy.expectedStatus);
  if(!capabilityResponse.headers.get("content-type")?.startsWith("application/json"))fail();
  const capabilities=await capabilityResponse.json();
  if(capabilities?.error!==(packagePolicy.installerEnabled?"errors:auth.unauthorized":"not-found")||Object.keys(capabilities).length!==1)fail();
  const packageCapabilities={...packagePolicy,...routes['GET /api/packages/capabilities']};
  const metadata=await(await req("/.well-known/oauth-protected-resource")).json();
  if(metadata.resource!==origin+"/mcp")fail();
  if(JSON.stringify(metadata.scopes_supported)!==JSON.stringify(expectedScopes))fail("RESOURCE_SCOPES_MISMATCH");
  const jwks=await(await req("/oauth/jwks.json")).json();
  if(jwks.keys?.length!==1||jwks.keys[0].x!==expectedX||"d" in jwks.keys[0])fail();
  const mcp=await req("/mcp",401);
  if(mcp.headers.get("www-authenticate")!==expectedChallenge)fail("MCP_CHALLENGE_MISMATCH");
  const consent=await req("/studio/oauth-consent?oauth_request=isolated-restore-proof");
  if(consent.headers.get("x-frame-options")!=="DENY"||consent.headers.get("cache-control")!=="no-store")fail();
  if(process.env.TADAZZ_INLINE_GAME_PREVIEW_ENABLED!=="true")fail();
  for(const f of nativeFiles){
    const r=await req("/tadazz-application-runtime/"+f.name,200,f.bytes);
    if(r.body.length!==f.bytes||crypto.createHash("sha256").update(r.body).digest("hex")!==f.sha256)fail();
    await req("/api/extensions/preview/runtime/"+f.sha256+"/"+f.name,401);
    await req("/api/extensions/preview/public-runtime/"+f.sha256+"/"+f.name,404);
  }
  const nativeApplicationPreview={files:nativeFiles,inlinePreviewEnabled:true,packagedHttpBytes:true,privateRuntimeUnauthorized:true,publicRuntimeDisabled:true,authenticatedStudioRender:false};
  process.stdout.write(JSON.stringify({ok:true,nativeApplicationPreview,packageCapabilities,routes}));
})().catch(()=>{process.stdout.write(JSON.stringify({ok:false,routes,failureCode}));process.exitCode=1;});
'''.replace("EXPECTED_PUBLIC_X", json.dumps(args.expected_jwk_x)).replace("NATIVE_PREVIEW_FILES", json.dumps(native_files)).replace("PACKAGE_PROBE_POLICY", json.dumps(package_policy)).replace("EXPECTED_MCP_SCOPES", json.dumps(MCP_SCOPES)).replace("EXPECTED_MCP_CHALLENGE", json.dumps(MCP_CHALLENGE))
        execution = docker_api("POST", "/containers/" + container_id + "/exec", {
            "AttachStdout": True, "AttachStderr": True, "Tty": False, "Cmd": ["node", "-e", program],
        })
        output = docker_bytes("POST", "/exec/" + execution["Id"] + "/start", {"Detach": False, "Tty": False}, limit=65536)
        status = docker_api("GET", "/exec/" + execution["Id"] + "/json")
        result["probeExitCode"] = status["ExitCode"]
        try:
            proof = json.loads(decode_logs(output))
        except (ValueError, UnicodeError):
            raise GateError("RESTORED_CANDIDATE_PROBE_OUTPUT_INVALID") from None
        require(isinstance(proof, dict), "RESTORED_CANDIDATE_PROBE_OUTPUT_INVALID")
        result["routes"] = safe_probe_routes(proof.get("routes", {}))
        if "failureCode" in proof:
            require(proof["failureCode"] in ("RESTORED_CANDIDATE_PROBE_FAILED",
                                             "RESOURCE_SCOPES_MISMATCH", "MCP_CHALLENGE_MISMATCH"),
                    "RESTORED_CANDIDATE_PROBE_FAILURE_CODE_INVALID")
            result["probeFailureCode"] = proof["failureCode"]
        require(not status["Running"] and status["ExitCode"] == 0, "RESTORED_CANDIDATE_BOOT_FAILED")
        require(set(proof) == {"ok", "nativeApplicationPreview", "packageCapabilities", "routes"} and
                proof["ok"] is True and proof["nativeApplicationPreview"] == native_preview_proof(native_files) and
                proof["packageCapabilities"] == package_probe_proof(package_policy),
                "RESTORED_CANDIDATE_PROBES_FAILED")
        result["nativeApplicationPreview"] = native_preview_proof(native_files)
        result["packageCapabilities"] = package_probe_proof(package_policy)
        result["passed"] = True
    finally:
        if inspect(container_id)["State"]["Running"]:
            docker_api("POST", "/containers/" + container_id + "/stop?t=35")
        result["retainedStopped"] = not inspect(container_id)["State"]["Running"]
    return result


def validate_qualification(args, original, image):
    require(args.qualification_receipt and args.qualification_sha256, "RESTORE_BOOT_QUALIFICATION_REQUIRED")
    file = plain_path(args.qualification_receipt, directory=False, root_owned=True)
    require(stat.S_IMODE(file.stat().st_mode) == 0o600 and HEX_RE.fullmatch(args.qualification_sha256) and sha256(file) == args.qualification_sha256, "QUALIFICATION_RECEIPT_PIN")
    receipt = read_json(file)
    require(receipt.get("success") is True and receipt.get("candidateCloneBoot", {}).get("passed") is True, "CANDIDATE_RESTORE_QUALIFICATION_NOT_PASSED")
    require(receipt.get("candidateCloneBoot", {}).get("nativeApplicationPreview") ==
            native_preview_proof(native_preview_files(Path(args.release_dir))), "NATIVE_PREVIEW_RESTORE_QUALIFICATION_MISSING")
    require(receipt.get("candidateCloneBoot", {}).get("packageCapabilities") ==
            package_probe_proof(package_probe_policy(original)), "PACKAGE_POLICY_RESTORE_QUALIFICATION_MISSING")
    require(receipt.get("revision") == args.revision and receipt.get("image") == image["Id"] and receipt.get("sourceImage") == original["Image"] and receipt.get("sourceContainer") == original["Id"] and receipt.get("configSha256") == args.expected_config_sha256, "RESTORE_QUALIFICATION_IDENTITY")
    when = dt.datetime.fromisoformat(receipt["finishedAt"])
    age = (dt.datetime.now(dt.timezone.utc) - when).total_seconds()
    require(0 <= age <= 24 * 3600, "RESTORE_QUALIFICATION_EXPIRED")
    return {"sha256": args.qualification_sha256, "candidateCloneBootPassed": True, "ageSeconds": round(age)}


def qualify_backup(args, stage, original, image, others):
    lock_fd = acquire_deploy_lock()
    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    work = stage / ("backup-qualification-" + run_id)
    work.mkdir(mode=0o700)
    report = {"kind": "backup-qualification", "revision": args.revision, "image": image["Id"],
              "sourceContainer": original["Id"], "sourceImage": original["Image"], "success": False,
              "configSha256": args.expected_config_sha256, "candidateCloneBoot": {"passed": False},
              "productionDataRestored": False, "deploymentPerformed": False, "phase": "pre-stop"}
    stop_requested = False
    handlers = {}
    for sig in (signal.SIGTERM, signal.SIGINT):
        handlers[sig] = signal.signal(sig, lambda signum, frame: (_ for _ in ()).throw(GateError("OPERATOR_INTERRUPTED")))
    try:
        fresh, _, fresh_others = baseline(args)
        require(fresh["Config"] == original["Config"] and fresh["HostConfig"] == original["HostConfig"] and fresh_others == others, "PREFLIGHT_CHANGED_BEFORE_STOP")
        report["roomGate"] = game_count_evidence(fresh)
        report["phase"] = "archive"
        stop_requested = True
        stopped_at = time.monotonic()
        docker_api("POST", "/containers/" + original["Id"] + "/stop?t=35")
        require(not inspect(original["Id"])["State"]["Running"], "PRODUCTION_STOP_FAILED")
        expected, report["backup"] = archive_private_backup(CONFIG_ROOT, work)
        docker_api("POST", "/containers/" + original["Id"] + "/start")
        wait_health()
        report["oldApplicationResumed"] = True
        report["stopToHealthySeconds"] = round(time.monotonic() - stopped_at, 3)
        report["oldApplicationBaseProbes"] = base_probes(PUBLIC_ORIGIN, package_probe_policy(inspect(original["Id"])))
        report["phase"] = "offline-restore-check"
        qualify_private_archive(work, expected, report["backup"])
        if args.qualify_candidate:
            report["phase"] = "isolated-candidate-clone-boot"
            clone_boot(args, original, image, work, run_id, report["candidateCloneBoot"])
        other_containers_unchanged(others, original["Id"])
        report.update(success=True, phase="qualified", oldContainerRetained=True,
                      releaseEligible=report["candidateCloneBoot"].get("passed") is True)
    except BaseException as error:
        report["failureCode"] = str(error) if isinstance(error, GateError) else type(error).__name__
        record_probe_failure(report, error)
        if stop_requested:
            for sig in handlers:
                signal.signal(sig, signal.SIG_IGN)
            try:
                rollback_container(original, None, "unused", report)
            except BaseException as restart_error:
                report["oldApplicationResumed"] = False
                report["restartFailureCode"] = str(restart_error) if isinstance(restart_error, GateError) else type(restart_error).__name__
                record_probe_failure(report, restart_error, "restartProbeFailure")
    finally:
        report["finishedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        report["receiptPath"] = str(work / "backup-qualification-result.json")
        try:
            write_private_json(work / "backup-qualification-result.json", report)
        finally:
            print(json.dumps(report, sort_keys=True))
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
            os.close(lock_fd)
    return 0 if report["success"] else 1


def validate_stage_identity(args, manifest):
    # The build is qualified against a fixed runtime base. The independently
    # pinned live image may be a newer release and remains the rollback target.
    require(manifest.get("sourceSha") == args.revision and
            manifest.get("baseImage") == QUALIFIED_BUILD_BASE_IMAGE, "STAGE_SOURCE_BASE_MISMATCH")
    require(manifest.get("format") == "tadazz-mcp-stage" and manifest.get("version") == 2 and
            manifest.get("imageId") == args.image_sha256, "STAGE_CANDIDATE_IMAGE_MISMATCH")


def validate_stage(args):
    stage = plain_path(args.release_dir, root_owned=True)
    require(re.fullmatch(r"/home/ubuntu/tadazz-mcp-(?:candidate|release)-[a-zA-Z0-9-]+", str(stage)), "RELEASE_PATH_REJECTED")
    file = stage / "stage-manifest.json"
    plain_path(file, directory=False)
    require(sha256(file) == args.stage_manifest_sha256, "STAGE_MANIFEST_PIN_MISMATCH")
    manifest = read_json(file)
    validate_stage_identity(args, manifest)
    artifacts = manifest.get("artifacts")
    require(isinstance(artifacts, dict) and 1 <= len(artifacts) <= 10000, "STAGE_ARTIFACTS_INVALID")
    for name, expected in artifacts.items():
        relative = PurePosixPath(name)
        require(not relative.is_absolute() and ".." not in relative.parts and str(relative) == name and HEX_RE.fullmatch(expected), "STAGE_ARTIFACT_PATH")
        path = plain_path(stage.joinpath(*relative.parts), directory=False)
        require(sha256(path) == expected, "STAGE_ARTIFACT_HASH_MISMATCH")
    require(artifacts.get("socket/index.cjs") == manifest.get("backendSha256") and "web/index.html" in artifacts, "STAGE_CORE_ARTIFACT_MISSING")
    smoke_file = plain_path(stage / "synthetic-smoke-result.json", directory=False)
    require(sha256(smoke_file) == manifest.get("syntheticSmokeSha256"), "STAGE_SMOKE_PIN_MISMATCH")
    smoke = read_json(smoke_file)
    require(smoke.get("image") == args.image_sha256, "STAGE_SMOKE_IMAGE_MISMATCH")
    require(smoke.get("ok") is True and smoke.get("sourceSha") == args.revision and smoke.get("productionTouched") is False and smoke.get("customerMountUsed") is False and smoke.get("network") == "none", "SYNTHETIC_SMOKE_NOT_QUALIFIED")
    require(smoke.get("nativeApplicationPreview") == native_preview_proof(native_preview_files(stage)),
            "STAGE_NATIVE_PREVIEW_NOT_QUALIFIED")
    return stage


def baseline(args):
    original = inspect("tadazz")
    require(original["Id"] == args.expected_container and original["Image"] == args.expected_image, "PRODUCTION_IDENTITY_CHANGED")
    require(original["State"]["Running"] and not original["State"].get("Paused") and not original["State"].get("Restarting"), "PRODUCTION_NOT_STABLE_RUNNING")
    require(original["Config"].get("User") in (None, "", "0", "root"), "PRODUCTION_UID_NOT_ROOT")
    mounts = original["Mounts"]
    require(len(mounts) == 1 and mounts[0]["Type"] == "bind" and mounts[0]["Source"] == str(CONFIG_ROOT) and mounts[0]["Destination"] == "/app/config" and mounts[0]["RW"] is True, "PRODUCTION_MOUNTS_CHANGED")
    host = original["HostConfig"]
    require(host["NetworkMode"] == "bridge" and host["PortBindings"] == {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "3000"}]} and not host.get("Privileged") and not host.get("AutoRemove"), "PRODUCTION_NETWORK_OR_HOST_CONFIG")
    image = docker_api("GET", "/images/" + urllib.parse.quote(args.image, safe="") + "/json")
    require(image["Id"] == args.image_sha256 and (image["Config"].get("Labels") or {}).get("org.opencontainers.image.revision") == args.revision, "CANDIDATE_IMAGE_PIN_MISMATCH")
    for key in ("Cmd", "Entrypoint", "WorkingDir"):
        require(image["Config"].get(key) == original["Config"].get(key), "CANDIDATE_LAUNCH_CONTRACT_CHANGED")
    require(image["Config"].get("User") in (None, "", "0", "root"), "CANDIDATE_UID_NOT_ROOT")
    running = docker_api("GET", "/containers/json?all=0")
    require(len(running) == args.expected_running_count, "RUNNING_CONTAINER_COUNT_CHANGED")
    others = {}
    for entry in running:
        if entry["Id"] == original["Id"]:
            continue
        other = inspect(entry["Id"])
        for mount in other.get("Mounts", []):
            if mount.get("Type") == "bind":
                source = Path(mount["Source"]).resolve()
                require(source != CONFIG_ROOT and source not in CONFIG_ROOT.parents and CONFIG_ROOT not in source.parents, "OTHER_CONTAINER_CUSTOMER_MOUNT")
        others[other["Id"]] = (other["Image"], other["State"]["StartedAt"])
    gateway = inspect("tadazz-phone-gateway")
    require(gateway["Id"] == args.expected_gateway and gateway["Id"] in others and gateway["State"]["Running"], "GATEWAY_IDENTITY_CHANGED")
    return original, image, others


def other_containers_unchanged(others, current_id):
    running = docker_api("GET", "/containers/json?all=0")
    require({entry["Id"] for entry in running} == set(others) | {current_id}, "OTHER_RUNNING_CONTAINERS_CHANGED")
    for container_id, expected in others.items():
        current = inspect(container_id)
        require(current["State"]["Running"] and (current["Image"], current["State"]["StartedAt"]) == expected, "OTHER_CONTAINER_RESTARTED")


def verify_replacement(original, replacement, payload):
    require(replacement["Image"] == payload["Image"], "REPLACEMENT_IMAGE_CHANGED")
    require(env_map(replacement["Config"].get("Env")) == env_map(payload["Env"]), "REPLACEMENT_ENV_CHANGED")
    require(replacement["Mounts"] == original["Mounts"], "REPLACEMENT_MOUNTS_CHANGED")
    require(replacement["HostConfig"] == original["HostConfig"], "REPLACEMENT_HOST_CONFIG_CHANGED")


def rollback_container(original, replacement_id, failed_name, report):
    # Rollback is container-only. The current config volume is always preserved.
    if replacement_id:
        replacement = inspect(replacement_id)
        if replacement["State"]["Running"]:
            docker_api("POST", "/containers/" + replacement_id + "/stop?t=20")
        if replacement["Name"] == "/tadazz":
            docker_api("POST", "/containers/" + replacement_id + "/rename?name=" + failed_name)
    old = inspect(original["Id"])
    require(old["Image"] == original["Image"], "ROLLBACK_IMAGE_CHANGED")
    if old["Name"] != "/tadazz":
        docker_api("POST", "/containers/" + original["Id"] + "/rename?name=tadazz")
    if not old["State"]["Running"]:
        docker_api("POST", "/containers/" + original["Id"] + "/start")
    wait_health()
    resumed = inspect("tadazz")
    require(resumed["Id"] == original["Id"], "ROLLBACK_IDENTITY_MISMATCH")
    report["rollbackBaseProbes"] = base_probes(PUBLIC_ORIGIN, package_probe_policy(resumed))
    report.update(rolledBack=True, rollbackDataRestored=False, currentCustomerWritesPreserved=True)


def deploy(args, stage, config, original, image, others):
    lock_fd = acquire_deploy_lock()
    qualification = validate_qualification(args, original, image)
    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    work = stage / ("deployment-" + run_id)
    work.mkdir(mode=0o700)
    backup_name = "tadazz-pre-mcp-" + args.revision[:12] + "-" + run_id
    failed_name = "tadazz-failed-mcp-" + args.revision[:12] + "-" + run_id
    payload = replacement_payload(original, image, args.revision, run_id)
    report = {"version": 1, "revision": args.revision, "image": image["Id"], "previousImage": original["Image"],
              "previousContainer": original["Id"], "rollbackContainer": backup_name, "success": False,
              "customerContentPrinted": False, "dataRestorePerformed": False, "phase": "pre-stop",
              "priorRestoreBootQualification": qualification}
    replacement_id, stop_requested = None, False
    handlers = {}
    for sig in (signal.SIGTERM, signal.SIGINT):
        handlers[sig] = signal.signal(sig, lambda signum, frame: (_ for _ in ()).throw(GateError("OPERATOR_INTERRUPTED")))
    try:
        # Re-read mutable identity/config and all running-container invariants under lock.
        fresh, fresh_image, fresh_others = baseline(args)
        require(fresh["Config"] == original["Config"] and fresh["HostConfig"] == original["HostConfig"] and fresh_others == others and fresh_image["Id"] == image["Id"], "PREFLIGHT_CHANGED_BEFORE_STOP")
        validate_config(args)
        report["roomGate"] = game_count_evidence(fresh)
        report["phase"] = "stop-and-backup"
        stop_requested = True
        docker_api("POST", "/containers/" + original["Id"] + "/stop?t=35")
        require(not inspect(original["Id"])["State"]["Running"], "PRODUCTION_STOP_FAILED")
        expected, report["backup"] = archive_private_backup(CONFIG_ROOT, work)
        validate_config(args)
        report["phase"] = "create-replacement"
        docker_api("POST", "/containers/" + original["Id"] + "/rename?name=" + backup_name)
        try:
            created = docker_api("POST", "/containers/create?name=tadazz", payload)
            replacement_id = created["Id"]
        except Exception:
            # A lost Docker response may hide a successful create. Identify only
            # this run's label, never stop/rename an unrelated same-name container.
            try:
                possible = inspect("tadazz")
                if (possible["Config"].get("Labels") or {}).get("com.tadazz.mcp.deployment") == run_id:
                    replacement_id = possible["Id"]
            except Exception:
                pass
            raise
        report["replacementContainer"] = replacement_id
        verify_replacement(original, inspect(replacement_id), payload)
        report["phase"] = "startup-and-smoke"
        docker_api("POST", "/containers/" + replacement_id + "/start")
        wait_health()
        verify_replacement(original, inspect(replacement_id), payload)
        package_policy = package_probe_policy(inspect(replacement_id))
        for origin, label in ((LOCAL_ORIGIN, "loopback"), (PUBLIC_ORIGIN, "publicHttps")):
            report[label] = {"baseProbes": base_probes(origin, package_policy)}
            report[label].update(mcp_probes(origin, stage, config, args.expected_jwk_x))
        report["phase"] = "fresh-private-restore-check-after-startup"
        qualify_private_archive(work, expected, report["backup"])
        validate_config(args)
        other_containers_unchanged(others, replacement_id)
        report.update(success=True, phase="verified", environmentPreservedExcept=sorted(ENV_OVERRIDES),
                      hostConfigurationUnchanged=True, mountsUnchanged=True, otherContainersUnchanged=True,
                      previousContainerRetainedStopped=not inspect(original["Id"])["State"]["Running"],
                      installedChatGptVerified=False, installedClaudeVerified=False)
    except BaseException as error:
        report["failureCode"] = str(error) if isinstance(error, GateError) else type(error).__name__
        record_probe_failure(report, error)
        if stop_requested:
            for sig in handlers:
                signal.signal(sig, signal.SIG_IGN)
            try:
                rollback_container(original, replacement_id, failed_name, report)
                other_containers_unchanged(others, original["Id"])
            except BaseException as rollback_error:
                report["rolledBack"] = False
                report["rollbackFailureCode"] = str(rollback_error) if isinstance(rollback_error, GateError) else type(rollback_error).__name__
                record_probe_failure(report, rollback_error, "rollbackProbeFailure")
        else:
            report["productionChanged"] = False
    finally:
        report["finishedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        try:
            write_private_json(work / "deployment-result.json", report)
        finally:
            print(json.dumps(report, sort_keys=True))
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
            os.close(lock_fd)
    return 0 if report["success"] else 1


def game_count_self_tests():
    """Only synthetic framed log bytes; never contact Docker or a live service."""
    checks = []
    original = {"Id": "a" * 64, "Config": {"Tty": False},
                "State": {"StartedAt": "2026-11-12T03:38:48.157101207Z"}}
    startup = "2026-11-12T03:38:49.826768702Z Server running on port 3001\n"
    zero = "2026-11-12T12:01:30.941422185Z Removed 1 empty game(s). Remaining games: 0\n"
    positive = "2026-11-12T12:02:30.941422185Z Game synthetic added. Total games: 1\n"
    saved_reader = globals()["docker_bytes"]

    def framed(value):
        payload = value.encode()
        return b"\x01\x00\x00\x00" + struct.pack(">I", len(payload)) + payload

    def probe(raw, expected_failure=None):
        def only_logs(method, path, body=None, limit=None):
            parsed = urllib.parse.urlsplit(path)
            query = urllib.parse.parse_qs(parsed.query)
            require(method == "GET" and body is None and
                    parsed.path == "/containers/" + original["Id"] + "/logs" and
                    query == {"stdout": ["1"], "stderr": ["1"], "timestamps": ["1"],
                              "since": [str(int(dt.datetime.fromisoformat(original["State"]["StartedAt"].replace("Z", "+00:00")).timestamp()))],
                              "tail": ["all"]} and limit == MAX_LOG_BYTES,
                    "SELFTEST_ROOM_LOG_REQUEST_CHANGED")
            return raw
        globals()["docker_bytes"] = only_logs
        try:
            result = game_count_evidence(original)
        except GateError as error:
            require(expected_failure == str(error), "SELFTEST_ROOM_GATE_WRONG_FAILURE")
            return None
        require(expected_failure is None, "SELFTEST_ROOM_GATE_ACCEPTED_UNSAFE_LOG")
        return result

    try:
        result = probe(framed(startup + zero))
        require(result["count"] == 0 and
                result["source"] == "complete-retained-container-log-events" and
                result["lastCountAt"] == zero.split(" ", 1)[0] and
                result["checkStopRaceEliminated"] is False,
                "SELFTEST_NATIVE_STARTUP_ZERO")
        checks.append("native-exact-startup-complete-log-zero-preserves-age-and-race-limit")
        result = probe(framed(startup))
        require(result["source"] == "retained-startup-empty-registry-no-subsequent-game-events" and
                result["count"] == 0, "SELFTEST_NATIVE_STARTUP_EMPTY")
        checks.append("native-startup-only-retains-existing-empty-registry-rule")
        probe(framed(zero), "LOG_STARTUP_NOT_RETAINED")
        checks.append("room-zero-without-startup-rejected")
        for false_marker in (startup.replace("port 3001", "port 3000"),
                             startup.replace(" Server running", " Untrusted prefix Server running")):
            probe(framed(false_marker + zero), "LOG_STARTUP_NOT_RETAINED")
        checks.append("unmatched-or-embedded-native-startup-rejected")
        for invalid_startup in ("garbage Server running on port 3001\n",
                                "2026-99-99T03:38:49Z Server running on port 3001\n"):
            probe(framed(invalid_startup), "LOG_STARTUP_NOT_RETAINED")
        checks.append("native-startup-invalid-timestamp-only-rejected")
        probe(framed(startup.replace("2026-11-12T03:38:49", "2026-11-11T03:38:49")),
              "LOG_STARTUP_NOT_RETAINED")
        checks.append("native-startup-before-current-container-only-rejected")
        probe(framed(startup + zero + positive), "ACTIVE_ROOMS_PRESENT")
        checks.append("room-nonzero-after-native-startup-rejected")
        probe(framed(startup + zero)[:-1], "LOG_FRAME_TRUNCATED")
        checks.append("truncated-room-log-frame-rejected")
        probe(framed(startup + zero.replace("2026-11-12T12:01:30", "2026-11-11T12:01:30")),
              "ROOM_LOG_PRECEDES_START")
        checks.append("room-count-before-current-start-rejected")
        for legacy in ("Socket server is running", "Server is running",
                       "Tadazz protected native host listening on loopback"):
            result = probe(framed("2026-11-12T03:38:49.826768702Z " + legacy + "\n" + zero))
            require(result["count"] == 0, "SELFTEST_LEGACY_STARTUP_REJECTED")
        checks.append("existing-startup-recognizers-preserved")
    finally:
        globals()["docker_bytes"] = saved_reader
    return checks


def deployment_identity_self_tests():
    """Synthetic stage and Docker facts exercise independent build/live pins."""
    checks = []
    args = argparse.Namespace(revision="b" * 40, image="tadazz:mcp-selftest",
                              image_sha256="sha256:" + "c" * 64,
                              expected_image="sha256:" + "d" * 64,
                              expected_container="e" * 64,
                              expected_gateway="f" * 64, expected_running_count=2)
    manifest = {"sourceSha": args.revision, "baseImage": QUALIFIED_BUILD_BASE_IMAGE,
                "format": "tadazz-mcp-stage", "version": 2, "imageId": args.image_sha256}

    def rejected(operation, expected):
        try:
            operation()
        except GateError as error:
            require(str(error) == expected, "SELFTEST_DEPLOY_IDENTITY_WRONG_FAILURE")
            return
        raise GateError("SELFTEST_DEPLOY_IDENTITY_ACCEPTED_CHANGED_PIN")

    require(args.expected_image != QUALIFIED_BUILD_BASE_IMAGE, "SELFTEST_DISTINCT_IMAGE_FIXTURE")
    validate_stage_identity(args, manifest)
    checks.append("qualified-build-base-independent-of-newer-live-rollback-image")
    for field, value in (("baseImage", args.expected_image), ("baseImage", "sha256:" + "a" * 64),
                         ("sourceSha", "a" * 40)):
        changed = {**manifest, field: value}
        rejected(lambda: validate_stage_identity(args, changed), "STAGE_SOURCE_BASE_MISMATCH")
    checks.append("unqualified-base-rejected-even-when-it-matches-live-image")
    checks.append("stage-source-revision-pin-preserved")
    for field, value in (("format", "foreign-stage"), ("version", 1), ("imageId", args.expected_image)):
        changed = {**manifest, field: value}
        rejected(lambda: validate_stage_identity(args, changed), "STAGE_CANDIDATE_IMAGE_MISMATCH")
    checks.append("stage-format-version-candidate-image-pins-preserved")

    launch = {"User": "root", "Cmd": ["supervisord", "-c", "/etc/supervisord.conf"],
              "Entrypoint": None, "WorkingDir": "/"}
    original = {"Id": args.expected_container, "Image": args.expected_image,
                "State": {"Running": True, "StartedAt": "synthetic-start"}, "Config": copy.deepcopy(launch),
                "Mounts": [{"Type": "bind", "Source": str(CONFIG_ROOT), "Destination": "/app/config", "RW": True}],
                "HostConfig": {"NetworkMode": "bridge", "PortBindings": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "3000"}]}}}
    gateway = {"Id": args.expected_gateway, "Image": "gateway-image", "Mounts": [],
               "State": {"Running": True, "StartedAt": "synthetic-gateway-start"}}
    candidate = {"Id": args.image_sha256,
                 "Config": {**copy.deepcopy(launch), "Labels": {"org.opencontainers.image.revision": args.revision}}}
    saved = {key: globals()[key] for key in ("inspect", "docker_api")}

    def synthetic_inspect(name):
        if name in ("tadazz", original["Id"]):
            return copy.deepcopy(original)
        if name in ("tadazz-phone-gateway", gateway["Id"]):
            return copy.deepcopy(gateway)
        raise GateError("SELFTEST_DEPLOY_IDENTITY_UNEXPECTED_CONTAINER")

    def synthetic_docker(method, path, body=None):
        require(method == "GET" and body is None, "SELFTEST_DEPLOY_IDENTITY_DOCKER_MUTATION")
        if path == "/images/" + urllib.parse.quote(args.image, safe="") + "/json":
            return copy.deepcopy(candidate)
        if path == "/containers/json?all=0":
            return [{"Id": original["Id"]}, {"Id": gateway["Id"]}]
        raise GateError("SELFTEST_DEPLOY_IDENTITY_UNEXPECTED_DOCKER_READ")

    try:
        globals().update(inspect=synthetic_inspect, docker_api=synthetic_docker)
        current, built, others = baseline(args)
        require(current["Image"] == args.expected_image and built["Id"] == args.image_sha256 and
                set(others) == {args.expected_gateway}, "SELFTEST_DEPLOY_IDENTITY_BASELINE")
        checks.append("different-live-image-retained-as-exact-baseline")
        for field, value, failure in (
                ("expected_image", QUALIFIED_BUILD_BASE_IMAGE, "PRODUCTION_IDENTITY_CHANGED"),
                ("expected_container", "a" * 64, "PRODUCTION_IDENTITY_CHANGED"),
                ("image_sha256", "sha256:" + "a" * 64, "CANDIDATE_IMAGE_PIN_MISMATCH"),
                ("expected_gateway", "a" * 64, "GATEWAY_IDENTITY_CHANGED"),
                ("expected_running_count", 3, "RUNNING_CONTAINER_COUNT_CHANGED")):
            changed_args = copy.copy(args)
            setattr(changed_args, field, value)
            rejected(lambda: baseline(changed_args), failure)
        checks.append("live-container-image-candidate-gateway-count-pins-preserved")
        original["Mounts"][0]["Source"] = "/synthetic-unapproved-config"
        rejected(lambda: baseline(args), "PRODUCTION_MOUNTS_CHANGED")
        original["Mounts"][0]["Source"] = str(CONFIG_ROOT)
        checks.append("live-config-mount-gate-preserved")
        candidate["Config"]["Cmd"] = ["unapproved-entrypoint"]
        rejected(lambda: baseline(args), "CANDIDATE_LAUNCH_CONTRACT_CHANGED")
        checks.append("candidate-launch-contract-gate-preserved")
    finally:
        globals().update(saved)
    return checks


def self_test():
    """Synthetic, no Docker/network/customer access; retained only in temp dir."""
    checks = game_count_self_tests() + deployment_identity_self_tests()
    original = {"Config": {"Env": ["SECRET=private-value", "SOCKET_PORT=9999", "PATH=/bin"], "Labels": {"existing": "yes"}}, "HostConfig": {"NetworkMode": "bridge"}}
    payload = replacement_payload(original, {"Id": "sha256:" + "a" * 64}, "b" * 40, "test")
    require(env_map(payload["Env"]) == {"SECRET": "private-value", "PATH": "/bin", **ENV_OVERRIDES}, "SELFTEST_ENV_PRESERVATION")
    require(original["Config"]["Env"][1] == "SOCKET_PORT=9999", "SELFTEST_ORIGINAL_MUTATED")
    checks.append("env-preserved-with-only-four-overrides")
    try:
        env_map(["X=a", "X=b"])
        raise AssertionError("duplicate accepted")
    except GateError:
        checks.append("duplicate-env-rejected")
    try:
        replacement_payload({"Config": {"Env": ["TMPDIR=/app/config/tmp"]}, "HostConfig": {}}, {"Id": "test"}, "test", "test")
        raise AssertionError("unsafe temp accepted")
    except GateError:
        checks.append("customer-temp-rejected")
    with tempfile.TemporaryDirectory(prefix="tadazz-deploy-selftest-") as temp:
        root = Path(temp)
        source, work = root / "config", root / "proof"
        source.mkdir(mode=0o700)
        work.mkdir(mode=0o700)
        (source / "nested").mkdir(mode=0o750)
        (source / "nested" / "synthetic.txt").write_text("synthetic-owned-data\n")
        db = sqlite3.connect(source / "synthetic.sqlite")
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("CREATE TABLE sample(value TEXT)")
        db.execute("INSERT INTO sample VALUES ('synthetic-only')")
        db.commit()
        # Live WAL in an otherwise quiescent synthetic database verifies replay
        # semantics of the restored clone (no immutable=1 shortcut).
        receipt = private_backup(source, work)
        require(receipt["sqliteDatabasesVerified"] == 1 and receipt["restoredBytesAndModesVerified"], "SELFTEST_BACKUP")
        db.close()
        checks.append("private-archive-restore-hashes-modes-sqlite-wal")
        # A readable tar with same-sized tampered payload must not pass restore.
        bad = root / "tampered.tar.gz"
        expected = {"owned.txt": {"kind": "file", "mode": 0o600, "uid": os.getuid(), "gid": os.getgid(),
                                  "size": 4, "sha256": hashlib.sha256(b"good").hexdigest()}}
        with tarfile.open(bad, "w:gz") as stream:
            member = tarfile.TarInfo("owned.txt")
            member.size, member.mode, member.uid, member.gid = 4, 0o600, os.getuid(), os.getgid()
            stream.addfile(member, io.BytesIO(b"evil"))
        try:
            extract_checked(bad, root / "bad-restore", expected)
            raise AssertionError("tampered restore accepted")
        except GateError as error:
            require(str(error) == "RESTORE_TREE_HASH_MODE_MISMATCH", "SELFTEST_WRONG_TAMPER_FAILURE")
            checks.append("same-size-tampered-restore-rejected")
        if hasattr(os, "symlink"):
            os.symlink(source / "nested/synthetic.txt", source / "forbidden-link")
            try:
                tree_manifest(source)
                raise AssertionError("symlink accepted")
            except GateError:
                checks.append("private-tree-symlink-rejected")
    # Fault after new startup: restore the old container, retain the failed one,
    # and make no data-restore/delete API request. Also cover failure before create.
    saved = {key: globals()[key] for key in ("inspect", "docker_api", "wait_health", "base_probes")}
    try:
        for replacement in ("new", None):
            state = {"old": {"Id": "old", "Image": "old-image", "Name": "/old-retained" if replacement else "/tadazz", "State": {"Running": False},
                             "Config": {"Env": ["TADAZZ_ACCOUNTS_ENABLED=true"]}}}
            if replacement:
                state["new"] = {"Id": "new", "Image": "new-image", "Name": "/tadazz", "State": {"Running": True}}
            calls = []
            def fake_inspect(name):
                if name == "tadazz":
                    return copy.deepcopy(next(item for item in state.values() if item["Name"] == "/tadazz"))
                return copy.deepcopy(state[name])
            def fake_docker(method, path, body=None):
                calls.append((method, path))
                require(method == "POST" and body is None, "SELFTEST_UNEXPECTED_DOCKER_MUTATION")
                container_id = path.split("/")[2]
                if "/stop?" in path:
                    state[container_id]["State"]["Running"] = False
                elif "/start" in path:
                    state[container_id]["State"]["Running"] = True
                elif "/rename?name=" in path:
                    state[container_id]["Name"] = "/" + path.split("name=", 1)[1]
                else:
                    raise GateError("SELFTEST_UNEXPECTED_DOCKER_MUTATION")
            globals().update(inspect=fake_inspect, docker_api=fake_docker, wait_health=lambda: None, base_probes=lambda origin, policy: None)
            report = {}
            rollback_container({"Id": "old", "Image": "old-image"}, replacement, "failed-retained", report)
            require(state["old"]["State"]["Running"] and state["old"]["Name"] == "/tadazz" and report["rolledBack"] and not report["rollbackDataRestored"], "SELFTEST_ROLLBACK_FAILED")
            if replacement:
                require(not state["new"]["State"]["Running"] and state["new"]["Name"] == "/failed-retained", "SELFTEST_FAILED_CANDIDATE_NOT_RETAINED")
        checks.append("rollback-before-and-after-create-preserves-live-data-and-containers")
    finally:
        globals().update(saved)
    print(json.dumps({"selfTest": "PASS", "checks": checks, "productionTouched": False}))
    return 0


def main():
    if sys.argv[1:] == ["--self-test"]:
        return self_test()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--action", choices=("preflight", "qualify-backup", "deploy"), default="preflight")
    parser.add_argument("--image", required=True)
    parser.add_argument("--image-sha256", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--expected-container", required=True)
    parser.add_argument("--expected-image", required=True)
    parser.add_argument("--expected-gateway", required=True)
    parser.add_argument("--expected-running-count", type=int, default=7)
    parser.add_argument("--release-dir", required=True)
    parser.add_argument("--stage-manifest-sha256", required=True)
    parser.add_argument("--expected-config-sha256")
    parser.add_argument("--expected-jwk-x", help="Public Ed25519 JWK x derived when the persistent signing key is generated; never the private key")
    parser.add_argument("--client-id")
    parser.add_argument("--redirect-uri", action="append")
    parser.add_argument("--qualify-candidate", action="store_true", help="In qualify-backup mode only, boot the candidate on restored private data with no network/ports")
    parser.add_argument("--qualification-receipt", help="Pinned successful candidate-on-restored-data receipt required for deploy")
    parser.add_argument("--qualification-sha256")
    args = parser.parse_args()
    os.umask(0o077)
    require(sys.platform == "linux" and os.geteuid() == 0, "LINUX_ROOT_REQUIRED")
    require(SHA_RE.fullmatch(args.revision) and IMAGE_RE.fullmatch(args.image_sha256) and IMAGE_RE.fullmatch(args.expected_image), "SHA_ARGUMENT_INVALID")
    require(all(HEX_RE.fullmatch(value) for value in (args.expected_container, args.expected_gateway, args.stage_manifest_sha256)), "PIN_ARGUMENT_INVALID")
    require(2 <= args.expected_running_count <= 50, "RUNNING_COUNT_INVALID")
    require(not args.qualify_candidate or args.action == "qualify-backup", "QUALIFY_FLAG_WRONG_ACTION")
    stage = validate_stage(args)
    config = validate_config(args) if args.action != "qualify-backup" or args.qualify_candidate else None
    original, image, others = baseline(args)
    replacement_payload(original, image, args.revision, "preflight")
    room = game_count_evidence(original)
    package_policy = package_probe_policy(original)
    base_results = {"loopback": base_probes(LOCAL_ORIGIN, package_policy),
                    "publicHttps": base_probes(PUBLIC_ORIGIN, package_policy)}
    if args.action == "qualify-backup":
        return qualify_backup(args, stage, original, image, others)
    if args.action == "preflight":
        print(json.dumps({"preflight": "PASS", "revision": args.revision, "image": image["Id"],
                          "productionChanged": False, "roomGate": room, "runningContainers": len(others) + 1,
                          "configPinnedAndPrivate": True, "candidateStagePinned": True,
                          "baseProbes": base_results,
                          "backupRestoreProof": "performed-only-after-stop-in-deploy", "installedHostVerified": False}))
        return 0
    return deploy(args, stage, config, original, image, others)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        # Never emit raw tracebacks from customer file/SQLite/Docker exceptions.
        failure = {"success": False, "failureCode": str(error) if isinstance(error, GateError) else type(error).__name__}
        record_probe_failure(failure, error)
        print(json.dumps(failure))
        sys.exit(1)
