#!/usr/bin/env python3
"""Synthetic operator regressions: no Docker, network, credentials or production access."""
import argparse
import copy
import contextlib
import datetime as dt
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("deploy_operator", Path(__file__).with_name("deploy-mcp-site.py"))
OP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OP)
ORIGIN = "https://www.tadazz.com"
REVISION = "f" * 40
RUNTIME_REVISION = "9" * 40
RUNTIME_ID = "c" * 64
RUNTIME_IMAGE = "sha256:" + "d" * 64


def args(enabled=True):
    return argparse.Namespace(
        package_runtime_origin=ORIGIN if enabled else None,
        expected_package_runtime_container=RUNTIME_ID if enabled else None,
        expected_package_runtime_image=RUNTIME_IMAGE if enabled else None,
        expected_package_runtime_revision=RUNTIME_REVISION if enabled else None,
        revision=REVISION, image="tadazz:synthetic-candidate", image_sha256="sha256:" + "e" * 64,
        expected_container="a" * 64, expected_image="sha256:" + "b" * 64,
        expected_gateway="1" * 64, expected_running_count=3,
        expected_config_sha256="2" * 64, qualification_receipt=None, qualification_sha256=None,
    )


def original():
    return {
        "Id": "a" * 64, "Image": "sha256:" + "b" * 64, "Name": "/tadazz",
        "Config": {"Env": ["TADAZZ_ACCOUNTS_ENABLED=true", "TADAZZ_PACKAGE_INSTALLER_ENABLED=true",
                           "TADAZZ_PACKAGE_RUNTIME_ENABLED=false", "KEEP=synthetic-retained"],
                   "User": "0", "Labels": {}, "Cmd": ["synthetic-app"], "Entrypoint": [], "WorkingDir": "/app"},
        "HostConfig": {"NetworkMode": "bridge", "PortBindings": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "3000"}]}},
        "Mounts": [{"Type": "bind", "Source": str(OP.CONFIG_ROOT), "Destination": "/app/config", "RW": True}],
        "State": {"Running": True, "StartedAt": "2026-01-01T00:00:00Z"},
    }


def runtime():
    config = {
        "User": "0:0", "WorkingDir": "/app/runtime", "Entrypoint": list(OP.PACKAGE_RUNTIME_ENTRYPOINT), "Cmd": [],
        "Env": ["PATH=/usr/bin", "TADAZZ_PACKAGE_STORE=/runtime-store",
                "TADAZZ_PACKAGE_PARENT_ORIGIN=" + OP.PUBLIC_ORIGIN,
                "TADAZZ_PACKAGE_RUNTIME_ORIGIN=" + ORIGIN, "TADAZZ_PACKAGE_RUNTIME_PORT=3192"],
        "Labels": {"org.opencontainers.image.revision": RUNTIME_REVISION, **{name: "4" * 64 for name in OP.PACKAGE_RUNTIME_LABELS}},
    }
    container = {
        "Id": RUNTIME_ID, "Image": RUNTIME_IMAGE, "Name": "/tadazz-package-runtime", "Config": copy.deepcopy(config),
        "State": {"Running": True, "StartedAt": "2026-01-02T00:00:00Z"},
        "HostConfig": {"ReadonlyRootfs": True, "CapDrop": ["ALL"], "SecurityOpt": ["no-new-privileges"],
                       "IpcMode": "private", "NetworkMode": "bridge",
                       "PortBindings": {"3192/tcp": [{"HostIp": "127.0.0.1", "HostPort": "3192"}]},
                       "Memory": 256 * 1024**2, "MemorySwap": 256 * 1024**2,
                       "NanoCpus": 500000000, "PidsLimit": 64},
        "Mounts": [
            {"Type": "bind", "Source": str(OP.CONFIG_ROOT / "extensions/packages"), "Destination": "/runtime-store", "RW": False, "Propagation": "rprivate"},
            {"Type": "bind", "Source": str(OP.PACKAGE_RUNTIME_SECRET), "Destination": "/run/secrets/runtime-capability", "RW": False, "Propagation": "rprivate"},
        ],
    }
    return container, {"Id": RUNTIME_IMAGE, "Config": config}


class RuntimeOperatorTests(unittest.TestCase):
    def filesystem(self, mode=0o600, links=1):
        def inspect_path(path, directory=True, root_owned=False):
            self.assertTrue(root_owned)
            if directory:
                self.assertEqual(path, OP.CONFIG_ROOT / "extensions/packages")
                return path
            self.assertEqual(path, OP.PACKAGE_RUNTIME_SECRET)
            return types.SimpleNamespace(stat=lambda: types.SimpleNamespace(st_mode=stat.S_IFREG | mode, st_nlink=links, st_size=64))
        return inspect_path

    def test_default_preserves_off_policy_and_optional_flag_changes_only_three_runtime_values(self):
        old = original()
        before = copy.deepcopy(old)
        off = OP.replacement_payload(old, {"Id": "candidate"}, REVISION, "run")
        on = OP.replacement_payload(old, {"Id": "candidate"}, REVISION, "run", ORIGIN)
        self.assertEqual(old, before)
        self.assertEqual(OP.package_runtime_policy(old), {"enabled": False, "origin": None, "parentOrigin": None})
        self.assertEqual(OP.package_runtime_policy({"Config": off}), OP.package_runtime_policy(old))
        self.assertEqual(OP.package_runtime_policy({"Config": on}), {"enabled": True, "origin": ORIGIN, "parentOrigin": OP.PUBLIC_ORIGIN})
        self.assertEqual({k for k in OP.env_map(on["Env"]) if OP.env_map(on["Env"])[k] != OP.env_map(off["Env"]).get(k)},
                         {"TADAZZ_PACKAGE_RUNTIME_ENABLED", "TADAZZ_PACKAGE_RUNTIME_ORIGIN", "TADAZZ_PACKAGE_PARENT_ORIGIN"})
        self.assertEqual(on["HostConfig"], old["HostConfig"])
        with patch.object(OP, "inspect", side_effect=AssertionError("default attempted Docker")), patch.object(OP, "request", side_effect=AssertionError("default attempted network")):
            self.assertIsNone(OP.package_runtime_probes(args(False)))

    def test_origin_requires_canonical_distinct_https(self):
        self.assertEqual(OP.package_runtime_origin(ORIGIN), ORIGIN)
        for bad in (None, "", "http://www.tadazz.com", OP.PUBLIC_ORIGIN, ORIGIN + "/", ORIGIN + "/render",
                    ORIGIN + "?x=1", ORIGIN + "#x", "https://user@www.tadazz.com", "https://user:secret@www.tadazz.com",
                    "https://www.tadazz.com:443", "https://www.tadazz.com:0", "https://www.tadazz.com:65536",
                    "https://WWW.tadazz.com", "https://www.tadazz.com.", " https://www.tadazz.com", "https://www%2etadazz.com"):
            with self.subTest(origin=bad), self.assertRaisesRegex(OP.GateError, "PACKAGE_RUNTIME_ORIGIN_INVALID"):
                OP.package_runtime_origin(bad)

    def test_explicit_pins_and_installer_are_required(self):
        for field in ("expected_package_runtime_container", "expected_package_runtime_image", "expected_package_runtime_revision"):
            options = args()
            setattr(options, field, None)
            with self.subTest(field=field), self.assertRaisesRegex(OP.GateError, "PINS_REQUIRED"):
                OP.package_runtime_options(options)
        options = args(False)
        options.expected_package_runtime_container = RUNTIME_ID
        with self.assertRaisesRegex(OP.GateError, "PINS_WITHOUT_ORIGIN"):
            OP.package_runtime_options(options)
        for revision in ("f" * 39, "F" * 40, "g" * 40, "f" * 41, None, 40):
            options = args()
            options.expected_package_runtime_revision = revision
            with self.subTest(revision=revision), self.assertRaisesRegex(OP.GateError, "PINS_REQUIRED"):
                OP.package_runtime_options(options)
        for field in ("TADAZZ_ACCOUNTS_ENABLED", "TADAZZ_PACKAGE_INSTALLER_ENABLED"):
            old = original()
            old["Config"]["Env"] = [x for x in old["Config"]["Env"] if not x.startswith(field + "=")]
            with self.subTest(field=field), self.assertRaisesRegex(OP.GateError, "REQUIRES_ACCOUNTS_INSTALLER"):
                OP.desired_package_container(old, ORIGIN)

    def test_only_exact_read_only_runtime_topology_is_accepted(self):
        container, image = runtime()
        def docker(method, path):
            self.assertEqual((method, path), ("GET", "/images/" + RUNTIME_IMAGE + "/json"))
            return copy.deepcopy(image)
        with patch.object(OP, "docker_api", side_effect=docker), patch.object(OP, "plain_path", side_effect=self.filesystem()):
            self.assertEqual(OP.validate_package_runtime_container(args(), container), OP.package_runtime_identity(args()))
            cases = [
                ("Id", "wrong"), ("Image", "sha256:" + "0" * 64), ("Name", "/other"),
                ("State.Running", False), ("State.Paused", True), ("Config.User", "1000"),
                ("Config.Entrypoint", ["sh", "-c", "node bootstrap"]), ("Config.WorkingDir", "/tmp"),
                ("Config.Env", container["Config"]["Env"] + ["JWT_SECRET=synthetic-forbidden"]),
                ("Config.Env", container["Config"]["Env"] + ["NODE_OPTIONS=--inspect=0.0.0.0"]),
                ("HostConfig.ReadonlyRootfs", False), ("HostConfig.Privileged", True),
                ("HostConfig.CapDrop", []), ("HostConfig.CapAdd", ["SYS_ADMIN"]),
                ("HostConfig.SecurityOpt", []), ("HostConfig.NetworkMode", "host"),
                ("HostConfig.PortBindings", {"3192/tcp": [{"HostIp": "0.0.0.0", "HostPort": "3192"}]}),
                ("HostConfig.Tmpfs", {"/tmp": "rw"}), ("HostConfig.PidMode", "host"),
                ("HostConfig.Devices", [{"PathOnHost": "/dev/mem"}]), ("HostConfig.Memory", 0),
                ("HostConfig.MemorySwap", -1), ("HostConfig.NanoCpus", 0), ("HostConfig.PidsLimit", 0),
            ]
            for field, value in cases:
                changed = copy.deepcopy(container)
                node = changed
                parts = field.split(".")
                for part in parts[:-1]:
                    node = node[part]
                node[parts[-1]] = value
                with self.subTest(field=field), self.assertRaises(OP.GateError):
                    OP.validate_package_runtime_container(args(), changed)
            for field, value in (("RW", True), ("Source", str(OP.CONFIG_ROOT)), ("Destination", "/app/config"), ("Propagation", "rshared")):
                changed = copy.deepcopy(container)
                changed["Mounts"][0][field] = value
                with self.subTest(mount=field), self.assertRaisesRegex(OP.GateError, "MOUNTS_CHANGED"):
                    OP.validate_package_runtime_container(args(), changed)
            changed = copy.deepcopy(container)
            changed["Mounts"].append({"Type": "bind", "Source": "/var/run/docker.sock", "Destination": "/var/run/docker.sock", "RW": False})
            with self.assertRaisesRegex(OP.GateError, "MOUNTS_CHANGED"):
                OP.validate_package_runtime_container(args(), changed)
        for mode, links in ((0o644, 1), (0o600, 2)):
            with patch.object(OP, "docker_api", return_value=image), patch.object(OP, "plain_path", side_effect=self.filesystem(mode, links)), self.assertRaisesRegex(OP.GateError, "SECRET_PERMISSIONS"):
                OP.validate_package_runtime_container(args(), container)

    def baseline_fixture(self, options):
        app = original()
        sandbox, runtime_image = runtime()
        gateway = {"Id": options.expected_gateway, "Image": "gateway", "State": {"Running": True, "StartedAt": "2026-01-01T00:00:00Z"}, "Mounts": []}
        app_image = {"Id": options.image_sha256, "Config": copy.deepcopy(app["Config"])}
        app_image["Config"]["Labels"] = {"org.opencontainers.image.revision": REVISION}
        containers = {app["Id"]: app, sandbox["Id"]: sandbox, gateway["Id"]: gateway}
        def inspect(name):
            return copy.deepcopy(containers[{"tadazz": app["Id"], "tadazz-phone-gateway": gateway["Id"]}.get(name, name)])
        def docker(method, path):
            self.assertEqual(method, "GET")
            if path == "/containers/json?all=0":
                return [{"Id": key} for key in containers]
            if path == "/images/" + RUNTIME_IMAGE + "/json":
                return copy.deepcopy(runtime_image)
            self.assertEqual(path, "/images/" + OP.urllib.parse.quote(options.image, safe="") + "/json")
            return copy.deepcopy(app_image)
        return containers, inspect, docker

    def test_baseline_mount_exception_is_opt_in_pinned_and_retains_count_and_other_mount_gates(self):
        options = args()
        containers, inspect, docker = self.baseline_fixture(options)
        with patch.object(OP, "inspect", side_effect=inspect), patch.object(OP, "docker_api", side_effect=docker), patch.object(OP, "plain_path", side_effect=self.filesystem()):
            _, _, others = OP.baseline(options)
            OP.other_containers_unchanged(others, options.expected_container, options)
            with self.assertRaisesRegex(OP.GateError, "OTHER_CONTAINER_CUSTOMER_MOUNT"):
                OP.baseline(args(False))
            bad_count = args()
            bad_count.expected_running_count = 2
            with self.assertRaisesRegex(OP.GateError, "RUNNING_CONTAINER_COUNT_CHANGED"):
                OP.baseline(bad_count)
            containers[options.expected_gateway]["Mounts"] = [{"Type": "bind", "Source": str(OP.CONFIG_ROOT / "other-private"), "RW": False}]
            with self.assertRaisesRegex(OP.GateError, "OTHER_CONTAINER_CUSTOMER_MOUNT"):
                OP.baseline(options)
            containers[options.expected_gateway]["Mounts"] = []
            containers[RUNTIME_ID]["Mounts"][0]["RW"] = True
            with self.assertRaisesRegex(OP.GateError, "MOUNTS_CHANGED"):
                OP.other_containers_unchanged(others, options.expected_container, options)

    def test_live_probe_requires_external_health_and_both_empty_denials_with_security_headers(self):
        calls = []
        headers = {"cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
                   "permissions-policy": "camera=(), microphone=(), geolocation=(), autoplay=()"}
        def request(origin, path, status, **kwargs):
            self.assertEqual(kwargs, {"max_bytes": 1024, "host": "www.tadazz.com"})
            calls.append((origin, path, status))
            return {"headers": {**headers, **({"content-type": "application/json"} if status == 200 else {})},
                    "body": b'{"status":"ok"}' if status == 200 else b"",
                    "diagnostic": {"path": path.split("?")[0], "method": "GET", "status": status, "expectedStatus": status, "contentType": "application/json" if status == 200 else ""}}
        with patch.object(OP, "inspect", return_value={}), patch.object(OP, "validate_package_runtime_container"), patch.object(OP, "request", side_effect=request):
            self.assertEqual(OP.package_runtime_probes(args()), OP.package_runtime_expected_proof(args()))
            self.assertEqual(calls, [(origin, path, status) for origin in ("http://127.0.0.1:3192", ORIGIN)
                                    for path, status in (("/health", 200), ("/render", 403), ("/render?ticket=invalid", 403))])
            for field, value in (("set-cookie", "synthetic=not-allowed"), ("location", OP.PUBLIC_ORIGIN), ("access-control-allow-origin", "*"),
                                 ("cache-control", "public"), ("referrer-policy", "unsafe-url"), ("permissions-policy", "camera=()")):
                old = headers.get(field)
                headers[field] = value
                with self.subTest(header=field), self.assertRaisesRegex(OP.GateError, "SECURITY_HEADERS"):
                    OP.package_runtime_probes(args())
                if old is None:
                    del headers[field]
                else:
                    headers[field] = old

    def test_request_keeps_https_host_and_rejects_redirect_without_following(self):
        class Response:
            status = 302
            headers = {"content-type": "text/html", "location": OP.PUBLIC_ORIGIN}
            def __enter__(self): return self
            def __exit__(self, *unused): pass
            def read(self, limit): return b"redirect"
        calls = []
        def open_request(query, timeout):
            calls.append((query.full_url, query.get_header("Host"), timeout))
            return Response()
        with patch.object(OP, "HTTP", types.SimpleNamespace(open=open_request)), self.assertRaisesRegex(OP.GateError, "PROBE_STATUS_302_EXPECTED_200"):
            OP.request(ORIGIN, "/health", host="www.tadazz.com")
        self.assertEqual(calls, [(ORIGIN + "/health", "www.tadazz.com", 10)])
        self.assertIsNone(OP.NoRedirect().redirect_request(None, None, 302, "", {}, OP.PUBLIC_ORIGIN))

    def test_qualification_binds_desired_runtime_policy_operator_hash_and_runtime_pins(self):
        options = args()
        old = original()
        image = {"Id": options.image_sha256}
        desired = OP.desired_package_container(old, ORIGIN)
        with tempfile.TemporaryDirectory(prefix="runtime-operator-qualification-synthetic-") as directory:
            options.release_dir = directory
            file = Path(directory) / "synthetic-receipt.json"
            options.qualification_receipt = str(file)
            receipt = {"success": True, "revision": REVISION, "image": image["Id"], "sourceImage": old["Image"], "sourceContainer": old["Id"],
                       "configSha256": options.expected_config_sha256, "finishedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                       "packageRuntime": OP.package_runtime_expected_proof(options),
                       "candidateCloneBoot": {"passed": True, "nativeApplicationPreview": {"synthetic": True},
                                              "packageCapabilities": OP.package_probe_proof(OP.package_probe_policy(desired)),
                                              "packageRuntimePolicy": OP.package_runtime_policy(desired)}}
            def write(value):
                file.write_text(json.dumps(value))
                file.chmod(0o600)
                options.qualification_sha256 = OP.sha256(file)
            with patch.object(OP, "plain_path", side_effect=lambda path, **unused: Path(path)), patch.object(OP, "native_preview_files", return_value=[]), patch.object(OP, "native_preview_proof", side_effect=lambda files, enabled: {"synthetic": enabled}):
                write(receipt)
                self.assertTrue(OP.validate_qualification(options, old, image)["candidateCloneBootPassed"])
                for field, value in (("packageRuntimePolicy", OP.package_runtime_policy(old)), ("packageRuntimePolicy", None)):
                    changed = copy.deepcopy(receipt)
                    changed["candidateCloneBoot"][field] = value
                    write(changed)
                    with self.assertRaisesRegex(OP.GateError, "PACKAGE_RUNTIME_RESTORE_QUALIFICATION_MISSING"):
                        OP.validate_qualification(options, old, image)
                for field in ("image", "container", "sourceRevision", "operatorSha256"):
                    changed = copy.deepcopy(receipt)
                    changed["packageRuntime"][field] = "different"
                    write(changed)
                    with self.subTest(field=field), self.assertRaisesRegex(OP.GateError, "PACKAGE_RUNTIME_RESTORE_QUALIFICATION_MISSING"):
                        OP.validate_qualification(options, old, image)
                write(receipt)
                options.package_runtime_origin = options.expected_package_runtime_container = options.expected_package_runtime_image = None
                options.expected_package_runtime_revision = None
                with self.assertRaisesRegex(OP.GateError, "PACKAGE_RUNTIME_RESTORE_QUALIFICATION_UNEXPECTED"):
                    OP.validate_qualification(options, old, image)
                receipt.pop("packageRuntime")
                receipt["candidateCloneBoot"].pop("packageRuntimePolicy")
                write(receipt)
                self.assertTrue(OP.validate_qualification(options, old, image)["candidateCloneBootPassed"])

    def test_runtime_revision_is_independent_but_exact_on_both_image_and_container(self):
        options = args()
        self.assertNotEqual(options.revision, options.expected_package_runtime_revision)
        container, image = runtime()
        with patch.object(OP, "docker_api", return_value=image), patch.object(OP, "plain_path", side_effect=self.filesystem()):
            proof = OP.validate_package_runtime_container(options, container)
            self.assertEqual(proof["sourceRevision"], RUNTIME_REVISION)
            for target in (image, container):
                labels = target["Config"]["Labels"]
                labels["org.opencontainers.image.revision"] = REVISION
                with self.assertRaisesRegex(OP.GateError, "SOURCE_PIN_MISMATCH"):
                    OP.validate_package_runtime_container(options, container)
                labels["org.opencontainers.image.revision"] = RUNTIME_REVISION
            for label in OP.PACKAGE_RUNTIME_LABELS:
                container["Config"]["Labels"][label] = "5" * 64
                with self.subTest(label=label), self.assertRaisesRegex(OP.GateError, "SOURCE_PIN_MISMATCH"):
                    OP.validate_package_runtime_container(options, container)
                container["Config"]["Labels"][label] = image["Config"]["Labels"][label]

    def test_rollback_restores_original_off_container_and_probes_original_policy(self):
        old = original()
        old["Name"] = "/retained-old"
        old["State"]["Running"] = False
        states = {old["Id"]: old, "replacement": {"Id": "replacement", "Name": "/tadazz", "State": {"Running": True}}}
        seen = []
        def inspect(name):
            return copy.deepcopy(next(s for s in states.values() if s["Name"] == "/tadazz") if name == "tadazz" else states[name])
        def docker(method, path, body=None):
            self.assertEqual(method, "POST")
            self.assertIsNone(body)
            state = states[path.split("/")[2]]
            if "/stop?" in path: state["State"]["Running"] = False
            elif "/rename?name=" in path: state["Name"] = "/" + path.split("name=", 1)[1]
            elif path.endswith("/start"): state["State"]["Running"] = True
            else: self.fail("Unexpected Docker mutation")
        with patch.object(OP, "inspect", side_effect=inspect), patch.object(OP, "docker_api", side_effect=docker), patch.object(OP, "wait_health"), patch.object(OP, "base_probes", side_effect=lambda origin, policy: seen.append((origin, policy, OP.package_runtime_policy(inspect("tadazz"))))):
            report = {}
            OP.rollback_container(old, "replacement", "retained-failed", report)
        self.assertTrue(report["rolledBack"])
        self.assertFalse(report["rollbackDataRestored"])
        self.assertEqual(seen, [(OP.PUBLIC_ORIGIN, OP.package_probe_policy(old), {"enabled": False, "origin": None, "parentOrigin": None})])
        self.assertFalse(states["replacement"]["State"]["Running"])

    def test_failed_runtime_readiness_prevents_any_application_stop(self):
        options = args()
        old = original()
        image = {"Id": options.image_sha256}
        with tempfile.TemporaryDirectory(prefix="runtime-operator-no-stop-synthetic-") as directory:
            stage = Path(directory)
            descriptor = os.open(stage / "synthetic-lock", os.O_CREAT | os.O_RDWR, 0o600)
            output = io.StringIO()
            with patch.object(OP, "acquire_deploy_lock", return_value=descriptor), \
                 patch.object(OP, "validate_qualification", return_value={"syntheticUnitFixture": True}), \
                 patch.object(OP, "baseline", return_value=(old, image, {})), \
                 patch.object(OP, "validate_config"), \
                 patch.object(OP, "game_count_evidence", return_value={"syntheticZeroRooms": True}), \
                 patch.object(OP, "package_runtime_probes", side_effect=OP.GateError("SYNTHETIC_RUNTIME_UNAVAILABLE")), \
                 patch.object(OP, "docker_api") as docker, contextlib.redirect_stdout(output):
                result = OP.deploy(options, stage, {}, old, image, {})
            self.assertEqual(result, 1)
            docker.assert_not_called()
            report = json.loads(output.getvalue())
            self.assertFalse(report["success"])
            self.assertFalse(report["productionChanged"])
            self.assertEqual(report["phase"], "pre-stop")
            self.assertEqual(report["failureCode"], "SYNTHETIC_RUNTIME_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
