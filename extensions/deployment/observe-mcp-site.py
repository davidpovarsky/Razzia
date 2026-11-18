"""Bounded read-only observation of one already deployed, pinned Tadazz release.

No credentials, response bodies, private configuration or raw logs are emitted.
This records an immediate observation window, not installed-host or long-term QA.
"""
import argparse
import datetime as dt
import importlib.util
import json
import pathlib
import re
import statistics
import time
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("guarded_release", HERE / "deploy-mcp-site.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

def observe(args):
    if not re.fullmatch(r"[a-f0-9]{64}", args.container):
        raise ValueError("Expected exact container ID")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", args.image):
        raise ValueError("Expected exact image ID")
    if not re.fullmatch(r"[a-f0-9]{64}", args.gateway):
        raise ValueError("Expected exact gateway ID")
    since = dt.datetime.fromisoformat(args.since.replace("Z", "+00:00"))
    now = dt.datetime.now(dt.timezone.utc)
    if since.tzinfo is None or not 0 <= (now - since).total_seconds() <= 86400:
        raise ValueError("Observation requires a deployment timestamp in the preceding day")
    if not 1 <= args.samples <= 10 or not 1 <= args.interval <= 60:
        raise ValueError("Bounded samples and interval required")
    report = {"kind": "post-deploy-observation", "version": 1,
              "startedAt": now.isoformat(), "container": args.container,
              "image": args.image, "gateway": args.gateway,
              "samples": [], "rawLogsEmitted": False, "customerContentEmitted": False,
              "mutationsPerformed": False, "installedHostVerified": False,
              "longTermReliabilityVerified": False}
    first_restart = None
    for index in range(args.samples):
        facts = release.inspect("tadazz")
        gateway = release.inspect("tadazz-phone-gateway")
        if facts["Id"] != args.container or facts["Image"] != args.image or not facts["State"]["Running"]:
            raise RuntimeError("Pinned release changed or stopped")
        if gateway["Id"] != args.gateway or not gateway["State"]["Running"]:
            raise RuntimeError("Pinned phone gateway changed or stopped")
        restarts = facts["RestartCount"]
        if first_restart is None:
            first_restart = restarts
        sample = {"at": dt.datetime.now(dt.timezone.utc).isoformat(),
                  "restartCount": restarts, "probes": []}
        for path, status in [
            ("/api/health", 200),
            ("/.well-known/oauth-protected-resource", 200),
            ("/.well-known/oauth-authorization-server/oauth", 200),
            ("/oauth/jwks.json", 200),
            ("/mcp", 401),
        ]:
            began = time.monotonic()
            item = {"path": path, "expectedStatus": status}
            try:
                value, response = release.json_probe(release.PUBLIC_ORIGIN, path, status)
                if path == "/api/health" and value != {"status": "ok"}:
                    raise RuntimeError("Health document mismatch")
                if path == "/.well-known/oauth-protected-resource" and value.get("resource") != release.PUBLIC_ORIGIN + "/mcp":
                    raise RuntimeError("Resource identity mismatch")
                if path == "/.well-known/oauth-authorization-server/oauth" and value.get("issuer") != release.PUBLIC_ORIGIN + "/oauth":
                    raise RuntimeError("Issuer identity mismatch")
                if path == "/mcp" and "resource_metadata=" not in response["headers"].get("www-authenticate", ""):
                    raise RuntimeError("MCP OAuth challenge missing")
                item.update(passed=True, status=response["status"], contentType=response["headers"].get("content-type", ""))
            except Exception as error:
                item.update(passed=False, errorCategory=type(error).__name__)
            item["milliseconds"] = round((time.monotonic() - began) * 1000, 2)
            sample["probes"].append(item)
        report["samples"].append(sample)
        if index + 1 < args.samples:
            time.sleep(args.interval)
    log_query = urllib.parse.urlencode({"stdout": "1", "stderr": "1", "timestamps": "1",
                                       "since": str(int(since.timestamp())), "tail": "1000"})
    try:
        raw = release.docker_bytes("GET", "/containers/" + args.container + "/logs?" + log_query, limit=1024 * 1024)
        lines = raw.decode("utf-8", errors="replace").splitlines()
        report["logObservation"] = {"available": True, "maximumBytes": 1024 * 1024,
            "maximumLinesRequested": 1000, "bytesRead": len(raw), "linesRead": len(lines),
            "errorKeywordLines": sum(bool(re.search(r"\b(error|fatal|uncaught|unhandled)\b", line, re.I)) for line in lines),
            "http5xxLines": sum(bool(re.search(r'\"\s+5[0-9]{2}\s', line)) for line in lines),
            "completeTrafficErrorRate": False, "rawLogsEmitted": False}
    except Exception as error:
        report["logObservation"] = {"available": False, "errorCategory": type(error).__name__, "rawLogsEmitted": False}
    ending = release.inspect("tadazz")
    ending_gateway = release.inspect("tadazz-phone-gateway")
    if ending["Id"] != args.container or ending["Image"] != args.image or not ending["State"]["Running"]:
        raise RuntimeError("Pinned release changed or stopped during the observation")
    if ending_gateway["Id"] != args.gateway or not ending_gateway["State"]["Running"]:
        raise RuntimeError("Pinned phone gateway changed or stopped during the observation")
    final_restarts = ending["RestartCount"]
    report["endingSnapshot"] = {"at": dt.datetime.now(dt.timezone.utc).isoformat(),
                               "restartCount": final_restarts, "releaseIdentityVerified": True,
                               "gatewayIdentityVerified": True}
    latencies = [probe["milliseconds"] for sample in report["samples"] for probe in sample["probes"]]
    report.update(finishedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                  probes=len(latencies), medianProbeMs=round(statistics.median(latencies), 2),
                  maxProbeMs=max(latencies), restartsDuringWindow=final_restarts - first_restart,
                  passed=all(probe["passed"] for sample in report["samples"] for probe in sample["probes"])
                    and final_restarts == first_restart)
    return report

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--gateway", required=True)
    parser.add_argument("--since", required=True)
    parser.add_argument("--samples", type=int, default=3)
    parser.add_argument("--interval", type=int, default=15)
    args = parser.parse_args()
    report = observe(args)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["passed"] else 1

if __name__ == "__main__":
    raise SystemExit(main())
