"""Explicit operator cutover; run as root on the inspected Oracle host only.

The image must already have passed isolated candidate checks. Credentials stay
inside Docker's API/memory. A stopped rollback container and private data backup
are retained. No data restore is automated, to avoid overwriting customer writes.
"""

import argparse
import datetime as dt
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


def probe_billing_disabled():
    # Public configuration may include additional readiness/catalog metadata.
    # The release invariant is an explicit JSON false, never a missing or
    # merely falsy value, so activation cannot slip through this guard.
    billing = json.loads(probe("https://tadazz.com/api/billing/config"))
    if not isinstance(billing, dict) or billing.get("enabled") is not False:
        raise RuntimeError("Billing must remain explicitly disabled")
    return billing


def wait_health():
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            probe("http://127.0.0.1:3000/api/health", expected={"status": "ok"})
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError("Replacement did not become healthy")


def _docker_log_time(value):
    # Docker emits UTC RFC3339Nano. datetime alone truncates sub-microsecond
    # precision, so retain its fractional nanoseconds as an integer.
    match = re.fullmatch(
        r"(?P<seconds>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})"
        r"(?:\.(?P<fraction>\d{1,9}))?Z", value)
    if not match:
        raise RuntimeError("Registry log timestamp is invalid")
    try:
        seconds = dt.datetime.fromisoformat(match["seconds"] + "+00:00")
    except ValueError as error:
        raise RuntimeError("Registry log timestamp is invalid") from error
    nanoseconds = int((match["fraction"] or "").ljust(9, "0"))
    return seconds, nanoseconds


def _registry_count_evidence(original):
    # Pin the immutable inspected container and retain its complete timestamped
    # process lifetime. A quiet registry has no periodic count heartbeat.
    started = _docker_log_time(original["State"]["StartedAt"])
    logs = command("docker", "logs", "--timestamps", "--since",
                   original["State"]["StartedAt"], "--tail", "all", original["Id"])
    legacy_markers = {"Socket server is running", "Server is running",
                      "Server running on port 3001"}
    native_listener = "Tadazz protected native host listening on loopback"
    cleanup_marker = "Game cleanup task started"
    retained = set()
    witnesses = []
    for line in logs.splitlines():
        timestamp, _, message = line.partition(" ")
        marker = message in legacy_markers | {native_listener, cleanup_marker}
        count = re.search(r"(?:Total games:|Remaining games:)\s*(\d+)", message)
        if not marker and not count:
            continue
        observed = _docker_log_time(timestamp)
        if observed < started:
            raise RuntimeError("Registry log precedes the inspected container start")
        if marker:
            retained.add(message)
        if count:
            witnesses.append((observed, int(count.group(1)), timestamp, len(witnesses)))
    legacy_started = bool(retained & legacy_markers)
    native_started = native_listener in retained
    if not legacy_started and not native_started:
        raise RuntimeError(
            "Could not establish current game count: startup log is not retained")
    if not witnesses and not legacy_started:
        # Native registry starts empty only after cleanup initialization and a
        # successful listener. Rotation/unknown drivers cannot prove a complete
        # no-event lifetime, even if a single startup-like line remains.
        if (cleanup_marker not in retained or
                original.get("HostConfig", {}).get("LogConfig") !=
                {"Type": "json-file", "Config": {}}):
            raise RuntimeError(
                "Could not establish current game count from complete native startup")
    latest = max(witnesses, key=lambda item: (item[0], item[3])) if witnesses else None
    return {
        "count": latest[1] if latest else 0,
        "source": ("complete-retained-container-log-events" if latest else
                   "retained-startup-empty-registry-no-subsequent-game-events"),
        "lastCountAt": latest[2] if latest else original["State"]["StartedAt"],
        "observedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "container": original["Id"],
        "logBytes": len(logs.encode("utf-8")),
        "logSha256": hashlib.sha256(logs.encode("utf-8")).hexdigest(),
        "checkStopRaceEliminated": False,
    }


def last_game_count(container=None):
    container = inspect("tadazz") if container is None else container
    return _registry_count_evidence(container)["count"]


def game_count_evidence(original):
    evidence = _registry_count_evidence(original)
    if evidence["count"] != 0:
        raise RuntimeError("Active rooms found; no cutover")
    return evidence


def pre_stop_game_evidence(original):
    # Refresh after public/image probes, immediately before the stop request.
    # This narrows the check/stop race; it does not claim an atomic room lock.
    latest = inspect("tadazz")
    if (latest["Id"] != original["Id"] or latest["Image"] != original["Image"] or
            not latest["State"]["Running"]):
        raise RuntimeError("Production identity or running state changed; no cutover")
    return game_count_evidence(latest)

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


def pricing_environment(original, filename):
    """Publish reviewed prices while retaining disabled billing and all other env."""
    if filename is None:
        return original
    path = Path(filename)
    info = path.lstat()
    if path.is_symlink() or not path.is_file() or info.st_mode & 0o077:
        raise RuntimeError("Pricing environment file must be a private regular file")
    values = json.loads(path.read_text())
    expected = {"TADAZZ_BILLING_ENABLED", "TADAZZ_PRICING_PUBLISHED",
                "PADDLE_ENVIRONMENT", "PADDLE_API_KEY", "PADDLE_CLIENT_TOKEN",
                "PADDLE_WEBHOOK_SECRET", "TADAZZ_BILLING_CATALOG_PATH"}
    if not isinstance(values, dict) or set(values) != expected or any(
        not isinstance(value, str) or not value or "\n" in value or "\r" in value
        for value in values.values()
    ):
        raise RuntimeError("Unexpected pricing environment keys or values")
    if (values["TADAZZ_BILLING_ENABLED"] != "false" or
            values["TADAZZ_PRICING_PUBLISHED"] != "true" or
            values["PADDLE_ENVIRONMENT"] != "live" or
            values["TADAZZ_BILLING_CATALOG_PATH"] != "/app/config/billing-live-catalog.json" or
            not values["PADDLE_API_KEY"].startswith("pdl_live_apikey_") or
            not re.fullmatch(r"live_[A-Za-z0-9]{27}", values["PADDLE_CLIENT_TOKEN"])):
        raise RuntimeError("Pricing publication must keep live billing disabled")
    retained = [item for item in original if item.split("=", 1)[0] not in expected]
    return retained + [key + "=" + value for key, value in values.items()]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--expected-container", required=True)
    parser.add_argument("--expected-image", required=True)
    parser.add_argument("--release-dir", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--pricing-environment-file")
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
    if not original["State"]["Running"]:
        raise RuntimeError("Application not running; no cutover")
    room_evidence = game_count_evidence(original)
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
    probe_billing_disabled()
    payload = dict(original["Config"])
    payload["Env"] = pricing_environment(original["Config"]["Env"], args.pricing_environment_file)
    payload["Image"] = image["Id"]
    payload["Labels"] = {**(payload.get("Labels") or {}),
                         "org.opencontainers.image.revision": args.revision,
                         "com.tadazz.site.enabled": "true"}
    payload["HostConfig"] = original["HostConfig"]
    stopped = renamed = created = False
    report = {"revision": args.revision, "image": image["Id"],
              "previousImage": original["Image"], "previousContainer": original["Id"],
              "rollbackContainer": backup_name, "activeGamesBefore": room_evidence["count"],
              "activeGamesEvidence": room_evidence,
              "gatewayContainerUnchanged": False, "success": False}
    report["preStopActiveGamesEvidence"] = pre_stop_game_evidence(original)
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
        if current["Config"]["Env"] != payload["Env"]:
            raise RuntimeError("Runtime environment changed")
        if current["Mounts"] != original["Mounts"]:
            raise RuntimeError("Production mounts changed")
        if current["HostConfig"] != original["HostConfig"]:
            raise RuntimeError("Host configuration changed")
        if asset_manifest(config_dir) != before_assets:
            raise RuntimeError("Production file payload changed unexpectedly")
        probe("https://tadazz.com/api/health", expected={"status": "ok"})
        probe("https://tadazz.com/api/auth/mode", expected={"accountsEnabled": True})
        probe_billing_disabled()
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
                      environmentUnchanged=args.pricing_environment_file is None,
                      pricingPublicationConfigured=args.pricing_environment_file is not None,
                      mountsUnchanged=True,
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
