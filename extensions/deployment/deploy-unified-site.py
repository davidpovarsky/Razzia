"""Explicit operator cutover; run as root on the inspected Oracle host only.

The image must already have passed isolated candidate checks. Credentials stay
inside Docker's API/memory. A stopped rollback container and private data backup
are retained. No data restore is automated, to avoid overwriting customer writes.
"""

import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import time
import urllib.error
import urllib.request


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect("/var/run/docker.sock")


def docker_api(method, path, body=None):
    connection = DockerConnection("localhost", timeout=60)
    encoded = None if body is None else json.dumps(body).encode()
    connection.request(method, path, body=encoded,
                       headers={"Content-Type": "application/json"})
    response = connection.getresponse()
    result = response.read()
    connection.close()
    if response.status >= 400:
        # Never echo a request body containing environment variables.
        raise RuntimeError(f"Docker {method} {path}: HTTP {response.status}")
    return json.loads(result) if result else None


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)


def inspect(name):
    return docker_api("GET", f"/containers/{name}/json")


def probe(url, status=200, expected=None):
    try:
        with urllib.request.urlopen(url, timeout=12) as response:
            actual, content = response.status, response.read()
    except urllib.error.HTTPError as response:
        actual, content = response.code, response.read()
    if actual != status:
        raise RuntimeError(f"Probe {url}: {actual}, expected {status}")
    if expected is not None and json.loads(content) != expected:
        raise RuntimeError(f"Probe {url}: unexpected JSON")
    return content


def wait_health():
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            probe("http://127.0.0.1:3000/api/health", expected={"status": "ok"})
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError("Replacement did not become healthy")


def last_game_count():
    logs = command("docker", "logs", "--tail", "5000", "tadazz")
    counts = re.findall(r"(?:Total games:|Remaining games:)\s*(\d+)", logs)
    if not counts:
        # An untouched fresh process has no registry until the first game.
        if "Socket server is running" in logs or "Server is running" in logs:
            return 0
        raise RuntimeError("Could not establish current game count from logs")
    return int(counts[-1])


def digest(filename):
    result = hashlib.sha256()
    with open(filename, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def asset_manifest(root):
    # Do not export filenames or private content. Compare tenant payloads in RAM.
    return {str(path.relative_to(root)): digest(path)
            for path in root.rglob("*") if path.is_file()
            and path.suffix.lower() not in {".sqlite", ".sqlite-wal", ".sqlite-shm"}
            and not any(part.endswith(("-wal", "-shm")) for part in path.parts)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--expected-container", required=True)
    parser.add_argument("--expected-image", required=True)
    parser.add_argument("--release-dir", required=True)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()
    os.umask(0o077)
    release = Path(args.release_dir).resolve(strict=True)
    if not str(release).startswith("/home/ubuntu/tadazz-unified-site-"):
        raise RuntimeError("Unexpected release directory")
    suffix = args.revision[:7]
    backup_name = "tadazz-pre-unified-site-" + suffix
    failed_name = "tadazz-failed-unified-site-" + suffix
    report_path = release / "deployment-result.json"
    if report_path.exists():
        raise RuntimeError("A deployment result already exists; inspect before retry")
    original = inspect("tadazz")
    gateway = inspect("tadazz-phone-gateway")
    if original["Id"] != args.expected_container or original["Image"] != args.expected_image:
        raise RuntimeError("Production changed since inspection")
    if not original["State"]["Running"] or last_game_count() != 0:
        raise RuntimeError("Application not running or active rooms found; no cutover")
    mounts = original["Mounts"]
    if len(mounts) != 1 or mounts[0]["Destination"] != "/app/config":
        raise RuntimeError("Unexpected production mount layout")
    config_dir = Path(mounts[0]["Source"]).resolve(strict=True)
    if config_dir != Path("/var/lib/tadazz-release-5312660/config"):
        raise RuntimeError("Unexpected production data directory")
    image = docker_api("GET", f"/images/{args.image}/json")
    if image["Config"]["Labels"].get("org.opencontainers.image.revision") != args.revision:
        raise RuntimeError("Image revision differs from approved artifact")
    health_before = probe("https://tadazz.com/api/health", expected={"status": "ok"})
    probe("https://tadazz.com/api/auth/mode", expected={"accountsEnabled": True})
    probe("https://tadazz.com/api/billing/config", expected={"enabled": False})
    payload = dict(original["Config"])
    payload["Image"] = image["Id"]
    payload["Labels"] = {**(payload.get("Labels") or {}),
                         "org.opencontainers.image.revision": args.revision,
                         "com.tadazz.site.enabled": "true"}
    payload["HostConfig"] = original["HostConfig"]
    stopped = renamed = created = False
    report = {"revision": args.revision, "image": image["Id"],
              "previousImage": original["Image"], "previousContainer": original["Id"],
              "rollbackContainer": backup_name, "activeGamesBefore": 0,
              "gatewayContainerUnchanged": False, "success": False}
    try:
        docker_api("POST", "/containers/tadazz/stop?t=20")
        stopped = True
        before_assets = asset_manifest(config_dir)
        backup = release / "production-data-private.tar.gz"
        command("tar", "-czf", str(backup), "-C", str(config_dir.parent), config_dir.name)
        report["privateBackupSha256"] = digest(backup)
        report["privateBackupPath"] = str(backup)
        docker_api("POST", f"/containers/tadazz/rename?name={backup_name}")
        renamed = True
        created_container = docker_api("POST", "/containers/create?name=tadazz", payload)
        created = True
        docker_api("POST", "/containers/tadazz/start")
        wait_health()
        current = inspect("tadazz")
        if current["Config"]["Env"] != original["Config"]["Env"]:
            raise RuntimeError("Runtime environment changed")
        if current["Mounts"] != original["Mounts"]:
            raise RuntimeError("Production mounts changed")
        if current["HostConfig"] != original["HostConfig"]:
            raise RuntimeError("Host configuration changed")
        if asset_manifest(config_dir) != before_assets:
            raise RuntimeError("Production file payload changed unexpectedly")
        probe("https://tadazz.com/api/health", expected={"status": "ok"})
        probe("https://tadazz.com/api/auth/mode", expected={"accountsEnabled": True})
        probe("https://tadazz.com/api/billing/config", expected={"enabled": False})
        for endpoint in ["/api/quizz", "/api/results", "/api/accounts/me",
                         "/api/packages/capabilities"]:
            probe("https://tadazz.com" + endpoint, status=401)
        index = (release / "web/index.html").read_bytes()
        if probe("https://tadazz.com/") != index:
            raise RuntimeError("Public HTML does not match artifact")
        if inspect("tadazz-phone-gateway")["Id"] != gateway["Id"]:
            raise RuntimeError("Telephone gateway changed")
        report.update(success=True, container=created_container["Id"],
                      privatePayloadFilesUnchanged=len(before_assets),
                      environmentUnchanged=True, mountsUnchanged=True,
                      hostConfigurationUnchanged=True, gatewayContainerUnchanged=True,
                      preflightHealth=json.loads(health_before))
    except Exception as error:
        report["failure"] = str(error)
        if created:
            docker_api("POST", "/containers/tadazz/stop?t=10")
            docker_api("POST", f"/containers/tadazz/rename?name={failed_name}")
        if renamed:
            docker_api("POST", f"/containers/{backup_name}/rename?name=tadazz")
        if stopped:
            docker_api("POST", "/containers/tadazz/start")
            wait_health()
        report["rolledBack"] = True
        raise
    finally:
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))


if __name__ == "__main__":
    main()
