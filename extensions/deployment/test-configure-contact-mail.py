#!/usr/bin/env python3
"""Synthetic same-image maintenance failures; no Docker, network or credentials."""
import argparse
import contextlib
import copy
import importlib.util
import json
import hashlib
import io
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("contact_maintenance", Path(__file__).with_name("configure-contact-mail.py"))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
TO = "hello@tadazz.com"
BEFORE = b"# keep\nRESEND_API_KEY=synthetic\nTADAZZ_AUTH_EMAIL_FROM=accounts@example.invalid\nKEEP=unchanged\n"


def original():
    return {"Id": "a" * 64, "Name": "/tadazz", "Image": "sha256:" + "b" * 64,
            "Config": {"Env": ["RESEND_API_KEY=synthetic", "TADAZZ_AUTH_EMAIL_FROM=accounts@example.invalid",
                               "TADAZZ_ACCOUNTS_ENABLED=true", "TADAZZ_PACKAGE_INSTALLER_ENABLED=false", "KEEP=unchanged"],
                       "Image": "old-tag", "Cmd": ["original-entry"], "Labels": {"revision": "retained"}},
            "HostConfig": {"NetworkMode": "bridge", "PortBindings": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "3000"}]}},
            "Mounts": [{"Type": "bind", "Source": str(M.OP.CONFIG_ROOT), "Destination": "/app/config", "RW": True}],
            "State": {"Running": True, "StartedAt": "2026-01-01T00:00:00Z"}}


class Fixture:
    def __init__(self):
        self.old = original()
        self.states = {self.old["Id"]: copy.deepcopy(self.old)}
        self.events, self.environment = [], BEFORE
        self.clone_error = self.live_error = self.persist_error = None
        self.second_room_error = False
        self.rooms = 0

    def inspect(self, identity):
        for item in self.states.values():
            if identity == item["Id"] or "/" + identity == item["Name"]:
                return copy.deepcopy(item)
        raise RuntimeError("synthetic container absent")

    def docker(self, method, path, payload=None):
        self.events.append((method, path))
        if path.startswith("/containers/create?name="):
            identity = "c" * 64
            config = copy.deepcopy(payload)
            host = config.pop("HostConfig")
            self.states[identity] = {"Id": identity, "Name": "/" + path.split("=", 1)[1], "Image": config["Image"],
                                     "Config": config, "HostConfig": host, "Mounts": copy.deepcopy(self.old["Mounts"]),
                                     "State": {"Running": False, "StartedAt": "2026-01-02T00:00:00Z"}}
            return {"Id": identity}
        parts = path.split("/")
        identity, operation = parts[2], parts[3]
        item = self.states[identity]
        if operation.startswith("stop"):
            item["State"]["Running"] = False
        elif operation == "start":
            item["State"]["Running"] = True
        elif operation.startswith("rename?name="):
            item["Name"] = "/" + operation.split("=", 1)[1]
        else:
            raise AssertionError(path)

    def room(self, unused):
        self.rooms += 1
        self.events.append(("room", self.rooms))
        if self.second_room_error and self.rooms == 2:
            raise M.OP.GateError("ACTIVE_ROOMS_PRESENT")
        return {"count": 0, "synthetic": True}

    def clone(self, *unused):
        self.events.append(("clone", "verified" if not self.clone_error else "failed"))
        if self.clone_error:
            raise self.clone_error
        return {"synthetic": True, "messageSent": False}

    def live(self):
        self.events.append(("live", "probe"))
        if self.live_error:
            raise self.live_error
        return {"synthetic": True, "messageSent": False}

    def persist(self, expected, desired):
        self.events.append(("persist", "compare-and-replace"))
        M.OP.require(self.environment == expected, "CONTACT_ENV_CHANGED")
        self.environment = desired
        if self.persist_error:
            error, self.persist_error = self.persist_error, None
            raise error

    @contextlib.contextmanager
    def install(self):
        with contextlib.ExitStack() as stack:
            patches = [
                patch.object(M.OP, "inspect", side_effect=self.inspect),
                patch.object(M.OP, "docker_api", side_effect=self.docker),
                patch.object(M.OP, "game_count_evidence", side_effect=self.room),
                patch.object(M.OP, "archive_private_backup", side_effect=lambda *a: ({"synthetic": True}, {"synthetic": True})),
                patch.object(M.OP, "qualify_private_archive", side_effect=lambda *a: self.events.append(("restore", "verified"))),
                patch.object(M.OP, "wait_health", side_effect=lambda: self.events.append(("health", "healthy"))),
                patch.object(M.OP, "base_probes", return_value={"synthetic": True}),
                patch.object(M.OP, "other_containers_unchanged", side_effect=lambda *a: self.events.append(("others", "unchanged"))),
                patch.object(M, "baseline", side_effect=lambda a: (self.inspect(self.old["Id"]), {}, self.environment)),
                patch.object(M, "qualify_clone", side_effect=self.clone),
                patch.object(M, "verify_live", side_effect=self.live),
                patch.object(M, "private_env", side_effect=lambda: self.environment),
                patch.object(M, "replace_private_env", side_effect=self.persist),
                patch.object(M.signal, "signal"),
            ]
            for item in patches:
                stack.enter_context(item)
            yield

    def run(self, work):
        return M.apply(argparse.Namespace(contact_email_to=TO), work, self.old, {}, BEFORE)


class MaintenanceTests(unittest.TestCase):
    def test_exact_image_and_only_one_environment_value_change(self):
        old = original()
        snapshot = copy.deepcopy(old)
        payload = M.payload_for(old, TO)
        self.assertEqual(old, snapshot)
        self.assertEqual(payload["Image"], old["Image"])
        self.assertEqual(payload["HostConfig"], old["HostConfig"])
        expected = copy.deepcopy(old["Config"])
        expected["Image"], expected["HostConfig"] = old["Image"], old["HostConfig"]
        expected["Env"] += ["TADAZZ_CONTACT_EMAIL_TO=" + TO]
        self.assertEqual(payload, expected)

    def test_persistent_environment_preserves_other_bytes_and_rejects_duplicate_destination(self):
        self.assertEqual(M.environment_bytes(BEFORE, TO), BEFORE + b"TADAZZ_CONTACT_EMAIL_TO=hello@tadazz.com\n")
        data = b"#a\r\nKEEP=a=b\r\nTADAZZ_CONTACT_EMAIL_TO=old@example.com\r\nTAIL=value"
        self.assertEqual(M.environment_bytes(data, TO),
                         b"#a\r\nKEEP=a=b\r\nTADAZZ_CONTACT_EMAIL_TO=hello@tadazz.com\r\nTAIL=value")
        with self.assertRaisesRegex(M.OP.GateError, "CONTACT_ENV_DUPLICATE"):
            M.environment_bytes(b"TADAZZ_CONTACT_EMAIL_TO=a@a.com\n TADAZZ_CONTACT_EMAIL_TO=b@b.com\n", TO)

    def test_atomic_persistence_is_private_and_compares_before_replacing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.env"
            path.write_bytes(BEFORE)
            path.chmod(0o600)
            with patch.object(M, "ENV_FILE", path), patch.object(M.OP, "plain_path", side_effect=lambda p, **kw: Path(p)):
                after = M.environment_bytes(BEFORE, TO)
                M.replace_private_env(BEFORE, after)
                self.assertEqual(path.read_bytes(), after)
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                with self.assertRaisesRegex(M.OP.GateError, "CONTACT_ENV_CHANGED"):
                    M.replace_private_env(BEFORE, b"must-not-write")
                self.assertEqual(path.read_bytes(), after)

    def test_success_requires_restore_clone_then_second_room_gate_and_public_checks_before_persist(self):
        fixture = Fixture()
        with tempfile.TemporaryDirectory() as directory, fixture.install():
            report = fixture.run(Path(directory))
            self.assertTrue(report["success"])
            self.assertFalse(report["codeDeployed"])
            self.assertFalse(report["customerDataRestored"])
            self.assertTrue(fixture.inspect("tadazz")["State"]["Running"])
            self.assertFalse(fixture.inspect(fixture.old["Id"])["State"]["Running"])
            self.assertEqual(fixture.environment, M.environment_bytes(BEFORE, TO))
            order = fixture.events
            self.assertLess(order.index(("restore", "verified")), order.index(("clone", "verified")))
            self.assertLess(order.index(("clone", "verified")), order.index(("room", 2)))
            self.assertLess(order.index(("live", "probe")), order.index(("persist", "compare-and-replace")))
            receipt = json.loads((Path(directory) / "contact-configuration-result.json").read_text())
            self.assertTrue(receipt["success"])

    def test_clone_failure_or_new_active_room_prevents_replacement_and_preserves_original(self):
        for phase in ("clone", "second-room"):
            fixture = Fixture()
            fixture.clone_error = M.OP.GateError("CONTACT_CLONE_PROOF_FAILED") if phase == "clone" else None
            fixture.second_room_error = phase == "second-room"
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as directory, fixture.install():
                with self.assertRaises(M.OP.GateError):
                    fixture.run(Path(directory))
                self.assertEqual(fixture.inspect("tadazz")["Id"], fixture.old["Id"])
                self.assertTrue(fixture.inspect("tadazz")["State"]["Running"])
                self.assertEqual(fixture.environment, BEFORE)
                self.assertFalse(any(event[0] == "POST" and "/create?" in event[1] for event in fixture.events))

    def test_live_failure_and_partial_atomic_persist_failure_restore_retained_container_and_env(self):
        for phase in ("live", "persist"):
            fixture = Fixture()
            fixture.live_error = M.OP.GateError("CONTACT_PUBLIC_PROBE_FAILED") if phase == "live" else None
            fixture.persist_error = OSError("synthetic fsync failure after atomic replace") if phase == "persist" else None
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as directory, fixture.install():
                with self.assertRaises((M.OP.GateError, OSError)):
                    fixture.run(Path(directory))
                self.assertEqual(fixture.inspect("tadazz")["Id"], fixture.old["Id"])
                self.assertTrue(fixture.inspect("tadazz")["State"]["Running"])
                self.assertEqual(fixture.environment, BEFORE)
                self.assertFalse(fixture.inspect("c" * 64)["State"]["Running"])
                receipt = json.loads((Path(directory) / "contact-configuration-result.json").read_text())
                self.assertTrue(receipt["rolledBack"])
                self.assertFalse(receipt["rollbackDataRestored"])

    def test_preflight_is_read_only_and_capacity_failure_prevents_any_stop(self):
        args = ["configure-contact-mail.py", "--expected-container", "a" * 64,
                "--expected-image", "sha256:" + "b" * 64, "--expected-others-sha256", "c" * 64,
                "--expected-env-sha256", "d" * 64, "--contact-email-to", TO,
                "--work-dir", "/home/ubuntu/tadazz-contact-maintenance-synthetic-uncreated"]
        for enough in (True, False):
            fixture = Fixture()
            with self.subTest(enough=enough), fixture.install(), patch("sys.argv", args), \
                 patch.object(M.os, "geteuid", return_value=0), patch.object(M.os, "umask"), \
                 patch.object(M.os, "close"), patch.object(M.OP, "acquire_deploy_lock", return_value=99999), \
                 patch.object(M.OP, "tree_manifest", return_value=({}, 100, 1)), \
                 patch.object(M.OP.shutil, "disk_usage", return_value=type("Disk", (), {"free": 1024**3 + (300 if enough else 299)})()), \
                 patch("sys.stdout", new_callable=io.StringIO) as output:
                if enough:
                    M.main()
                    self.assertFalse(json.loads(output.getvalue())["productionChanged"])
                else:
                    with self.assertRaisesRegex(M.OP.GateError, "^BACKUP_DISK_RESERVE$"):
                        M.main()
                self.assertFalse(any(event[0] == "POST" for event in fixture.events))

    def test_live_baseline_rejects_changed_image_mount_other_process_or_environment_file(self):
        old = original()
        args = argparse.Namespace(expected_container=old["Id"], expected_image=old["Image"],
                                  expected_others_sha256=hashlib.sha256(M.OP.canonical({})).hexdigest(),
                                  expected_env_sha256=hashlib.sha256(BEFORE).hexdigest())
        with patch.object(M.OP, "inspect", return_value=old), \
             patch.object(M.OP, "docker_api", return_value=[{"Id": old["Id"]}]) as docker, \
             patch.object(M, "private_env", return_value=BEFORE):
            self.assertEqual(M.baseline(args)[1], {})
            for field, error in (("expected_image", "CONTACT_CONTAINER_CHANGED"),
                                 ("expected_others_sha256", "CONTACT_OTHER_CONTAINERS_CHANGED"),
                                 ("expected_env_sha256", "CONTACT_ENV_PIN_CHANGED")):
                changed = copy.deepcopy(args)
                setattr(changed, field, "different")
                with self.subTest(field=field), self.assertRaisesRegex(M.OP.GateError, "^" + error + "$"):
                    M.baseline(changed)
            old["Mounts"][0]["Source"] = "/other/customer-data"
            with self.assertRaisesRegex(M.OP.GateError, "^CONTACT_CONFIG_MOUNT_CHANGED$"):
                M.baseline(args)
            self.assertTrue(all(call.args[0] == "GET" for call in docker.call_args_list))

    def test_clone_is_network_isolated_and_rejects_false_config_proof(self):
        old = original()
        payload = M.payload_for(old, TO)
        proof = {"healthy": True, "accountsEnabled": True, "contactAvailable": True, "noStore": True, "messageSent": False}
        for passed in (True, False):
            running, calls = [False], []
            with self.subTest(passed=passed), tempfile.TemporaryDirectory() as directory:
                work = Path(directory)
                restored = work / "restore-private"
                restored.mkdir()
                def inspect(identity):
                    return {"Image": old["Image"], "Config": payload,
                            "HostConfig": {"NetworkMode": "none", "PortBindings": {}},
                            "Mounts": [{"Source": str(restored), "Destination": "/app/config", "RW": True}],
                            "State": {"Running": running[0]}}
                def docker(method, path, body=None):
                    calls.append((method, path, body))
                    if "/create?" in path:
                        self.assertEqual(body["HostConfig"]["NetworkMode"], "none")
                        self.assertEqual(body["HostConfig"]["PortBindings"], {})
                        self.assertEqual(body["Image"], old["Image"])
                        return {"Id": "clone"}
                    if path.endswith("/start"):
                        running[0] = True
                    elif "/stop?" in path:
                        running[0] = False
                    elif path.endswith("/exec"):
                        return {"Id": "exec"}
                    elif path.endswith("/json"):
                        return {"Running": False, "ExitCode": 0 if passed else 1}
                encoded = json.dumps(proof if passed else {"failed": True}).encode()
                framed = struct.pack(">BxxxI", 1, len(encoded)) + encoded
                with patch.object(M.OP, "plain_path", side_effect=lambda p, **kw: Path(p)), \
                     patch.object(M.OP, "inspect", side_effect=inspect), patch.object(M.OP, "docker_api", side_effect=docker), \
                     patch.object(M.OP, "docker_bytes", return_value=framed):
                    if passed:
                        self.assertTrue(M.qualify_clone(old, payload, work, "synthetic")["contactAvailable"])
                    else:
                        with self.assertRaisesRegex(M.OP.GateError, "CONTACT_CLONE_PROOF_FAILED"):
                            M.qualify_clone(old, payload, work, "synthetic")
                self.assertFalse(running[0])
                self.assertTrue(any("/stop?" in path for _, path, _ in calls))


if __name__ == "__main__":
    unittest.main()
