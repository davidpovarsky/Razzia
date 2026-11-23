#!/usr/bin/env python3
"""Isolated same-binary Caddy privacy witness; never loads/reloads live config."""

import argparse
import hashlib
import json
import os
import pathlib
import pwd
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--run-as", default="ubuntu")
    args = parser.parse_args()
    root = pathlib.Path(args.evidence_dir)
    require(root.is_absolute() and not root.exists(), "FRESH_ABSOLUTE_EVIDENCE_DIR_REQUIRED")
    account = pwd.getpwnam(args.run_as)
    require(account.pw_uid != 0, "UNPRIVILEGED_FIXTURE_USER_REQUIRED")
    binary = pathlib.Path(shutil.which("caddy") or "/usr/bin/caddy").resolve(strict=True)
    before = digest(binary)
    version = subprocess.run([str(binary), "version"], check=True, capture_output=True, text=True, timeout=5).stdout.strip()
    root.mkdir(mode=0o700)
    os.chown(root, account.pw_uid, account.pw_gid)
    records = []
    marker = "synthetic-qa-download-capability"
    referer = "synthetic-qa-private-referer"
    filter_config = {"format": "filter", "wrap": {"format": "json"}, "fields": {
        "request>uri": {"filter": "delete"},
        "request>headers>Referer": {"filter": "delete"},
    }}

    def drop_privileges():
        os.setgroups([])
        os.setgid(account.pw_gid)
        os.setuid(account.pw_uid)

    for filtered in (False, True):
        label = "filtered" if filtered else "default"
        case = root / label
        case.mkdir(mode=0o700)
        os.chown(case, account.pw_uid, account.pw_gid)
        # A bound, non-listening socket holds an otherwise unused upstream port
        # and produces connection refusal, without reaching any real service.
        unavailable = socket.socket()
        unavailable.bind(("127.0.0.1", 0))
        upstream_port = unavailable.getsockname()[1]
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        listener.close()
        config = {
            "admin": {"disabled": True, "config": {"persist": False}},
            "storage": {"module": "file_system", "root": str(case / "storage")},
            "apps": {"http": {"servers": {"qa": {
                "listen": ["127.0.0.1:" + str(port)],
                "automatic_https": {"disable": True},
                "routes": [{"handle": [{"handler": "reverse_proxy", "upstreams": [{"dial": "127.0.0.1:" + str(upstream_port)}]}]}],
            }}}},
        }
        if filtered:
            config["logging"] = {"logs": {"default": {"encoder": filter_config}}}
        config_path = case / "fixture.json"
        config_path.write_text(json.dumps(config), encoding="utf8")
        config_path.chmod(0o600)
        os.chown(config_path, account.pw_uid, account.pw_gid)
        environment = {"PATH": "/usr/bin:/bin", "HOME": str(case), "XDG_DATA_HOME": str(case / "data"), "XDG_CONFIG_HOME": str(case / "config"), "GOMAXPROCS": "1"}
        checked = subprocess.run([str(binary), "validate", "--config", str(config_path)], cwd=case, env=environment, preexec_fn=drop_privileges, capture_output=True, timeout=10)
        (case / "validate.log").write_bytes(checked.stdout + checked.stderr)
        (case / "validate.log").chmod(0o600)
        require(checked.returncode == 0, label + "_CONFIG_INVALID")
        log_path = case / "runtime.log"
        log_fd = os.open(log_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        process = None
        try:
            with os.fdopen(log_fd, "wb") as log:
                process = subprocess.Popen([str(binary), "run", "--config", str(config_path)], cwd=case, env=environment, preexec_fn=drop_privileges, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                status = None
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    require(process.poll() is None, label + "_FIXTURE_EXITED")
                    request = urllib.request.Request("http://127.0.0.1:" + str(port) + "/oauth/downloads/" + marker, headers={"Referer": "https://example.invalid/" + referer})
                    try:
                        with urllib.request.urlopen(request, timeout=1) as response:
                            status = response.status
                    except urllib.error.HTTPError as error:
                        status = error.code
                        error.close()
                    except urllib.error.URLError:
                        time.sleep(0.025)
                        continue
                    break
                require(status == 502, label + "_EXPECTED_SYNTHETIC_UPSTREAM_REFUSAL")
        finally:
            unavailable.close()
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        raw = log_path.read_text(encoding="utf8")
        rows = []
        for line in raw.splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("logger", "").startswith("http.log.error"):
                rows.append(row)
        require(len(rows) == 1, label + "_EXACTLY_ONE_ERROR_RECORD_REQUIRED")
        error = rows[0]
        require(error.get("status") == 502 and error.get("level") == "error" and bool(error.get("msg")), label + "_ERROR_OBSERVABILITY_LOST")
        if filtered:
            require(marker not in raw and referer not in raw, "FILTERED_CAPABILITY_OR_REFERER_LEAKED")
            require("uri" not in error.get("request", {}) and "Referer" not in error.get("request", {}).get("headers", {}), "FILTERED_FIELDS_REMAIN")
        else:
            require(marker in error.get("request", {}).get("uri", "") and referer in json.dumps(error.get("request", {}).get("headers", {})), "DEFAULT_LEAK_WITNESS_MISSING")
        records.append({"case": label, "passed": True, "httpStatus": 502, "errorRecordRetained": True, "capabilityAndRefererAbsent": filtered, "configSha256": digest(config_path), "runtimeLogSha256": digest(log_path)})
    require(digest(binary) == before, "CADDY_BINARY_CHANGED")
    receipt = {"version": 1, "passed": True, "scope": "isolated-loopback-synthetic-upstream-error-only", "productionConfigurationChanged": False, "productionLogsRead": False, "binary": str(binary), "binarySha256": before, "binaryVersion": version, "fixtureUid": account.pw_uid, "cases": records, "requiredEncoder": filter_config}
    receipt_path = root / "receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf8")
    receipt_path.chmod(0o600)
    print(json.dumps({"passed": True, "receipt": str(receipt_path), "receiptSha256": digest(receipt_path), "binaryVersion": version, "defaultRuntimeUriLeakProven": True, "filteredRuntimeUriAndRefererAbsent": True, "errorRecordRetained": True}))


if __name__ == "__main__":
    main()
