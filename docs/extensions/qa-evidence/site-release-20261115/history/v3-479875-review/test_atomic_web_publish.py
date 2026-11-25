"""Bounded static/manifest tests; they do not invoke the publisher or Docker.

Independent QA must additionally execute the isolated container trial described
in ATOMIC_WEB_QA.md. Run this file only from a synthetic QA copy with python -B.
"""

import ast
import importlib.util
import json
import os
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "atomic-web-publish.py"
SPEC = importlib.util.spec_from_file_location("atomic_web_proposal", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StaticPublicationContract(unittest.TestCase):
    def test_both_python_programs_parse(self):
        ast.parse(SOURCE.read_text(encoding="utf-8"))
        ast.parse(MODULE.INNER)

    def test_path_parser_rejects_escape_and_ambiguous_names(self):
        for value in ("", "/x", "../x", "a/../x", "a//x", "a/./x", "a\\b"):
            with self.subTest(value=value):
                self.assertFalse(MODULE.safe_name(value))
        self.assertTrue(MODULE.safe_name("assets/public-file.js"))

    def test_pinned_inventories_have_only_the_authorized_delta(self):
        old_raw = (HERE / "base-web-inventory.json").read_bytes()
        new_raw = (HERE / "candidate-web-inventory.json").read_bytes()
        self.assertEqual(MODULE.sha(old_raw), MODULE.BASE_MANIFEST)
        self.assertEqual(MODULE.sha(new_raw), MODULE.CANDIDATE_MANIFEST)
        old, new = json.loads(old_raw), json.loads(new_raw)
        self.assertEqual(old["special"], [])
        self.assertEqual(new["special"], [])
        old, new = old["files"], new["files"]
        self.assertEqual((len(old), len(new)), (202, 242))
        self.assertEqual(set(old) - set(new), set())
        self.assertEqual([k for k in old if old[k] != new[k]], ["index.html"])
        self.assertEqual(len(set(new) - set(old)), 40)
        self.assertTrue(all(k.startswith("assets/") and k.count("/") == 1
                            for k in set(new) - set(old)))
        self.assertEqual(old["index.html"], MODULE.OLD_INDEX)
        self.assertEqual(new["index.html"], MODULE.NEW_INDEX)

    def test_measured_receipt_matches_pinned_inventories_and_payload_budget(self):
        raw = (HERE / "public-file-sizes-and-controls.json").read_bytes()
        self.assertEqual(MODULE.sha(raw), MODULE.SIZE_RECEIPT)
        receipt = json.loads(raw)
        old = json.loads((HERE / "base-web-inventory.json").read_bytes())["files"]
        new = json.loads((HERE / "candidate-web-inventory.json").read_bytes())["files"]
        artifact = dict(line.split("  ", 1)[::-1] for line in (HERE / "artifact.sha256").read_text().splitlines())
        for section, expected in (("base", old), ("candidate", new), ("artifact", artifact)):
            records = receipt[section]["files"]
            self.assertEqual(set(records), set(expected))
            self.assertEqual({n: r["sha256"] for n, r in records.items()}, expected)
            self.assertEqual(sum(r["bytes"] for r in records.values()), receipt[section]["total_bytes"])
            self.assertLessEqual(max(r["bytes"] for r in records.values()), MODULE.MAX_FILE)
        names = sorted(set(new) - set(old)) + ["index.html"]
        self.assertEqual(len(names), 41)
        self.assertEqual(sum(receipt["candidate"]["files"][n]["bytes"] for n in names), 3315539)


    def test_mount_allowlist_rejects_extra_mount_without_printing_it(self):
        identity = f"{MODULE.CONTAINER} {MODULE.IMAGE} true {MODULE.STARTED}"
        mounts = [{"Type": "bind", "Destination": "/app/config",
                   "Source": "/var/lib/tadazz-release-5312660/config", "RW": True},
                  {"Type": "bind", "Destination": "/app/web", "Source": "/foreign", "RW": True}]
        with patch.object(MODULE.subprocess, "check_output", side_effect=[identity, json.dumps(mounts)]):
            with self.assertRaisesRegex(ValueError, "mount tuple"):
                MODULE.inspect_identity()

    def test_review_gate_denies_all_production_actions(self):
        for action in ("publish", "rollback", "reconcile"):
            with self.subTest(action=action), self.assertRaisesRegex(ValueError, "review gate"):
                MODULE.run(action)

    def test_legacy_wrapper_gate_denies_every_cooperating_action(self):
        wrapper_path = HERE / "legacy-control-wrapper.py"
        spec = importlib.util.spec_from_file_location("legacy_review_wrapper", wrapper_path)
        wrapper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(wrapper)
        for action in ("legacy-20261110", "legacy-20261112", "manual-start", "manual-stop", "manual-restart"):
            with self.subTest(action=action), self.assertRaisesRegex(ValueError, "review gate"):
                wrapper.main([action])

    def test_fixture_coordinator_never_defaults_to_production(self):
        for target in (None, MODULE.CONTAINER, {}):
            with self.subTest(target=target), self.assertRaisesRegex(ValueError, "synthetic"):
                MODULE.coordinate_fixture(target, "publish")
        self.assertFalse(hasattr(MODULE, "_run_locked"))

    def test_exec_state_requires_started_ack_and_matching_stopped_child(self):
        child = "a" * 64
        record = {"phase": "prepared", "nonce": "synthetic"}
        with self.assertRaises(ValueError):
            MODULE.transition_exec_record(record, {"kind": "terminal-inspect", "execId": child, "running": False, "exitCode": 0, "noOutstandingStart": True})
        record = MODULE.transition_exec_record(record, {"kind": "created", "execId": child})
        record = MODULE.transition_exec_record(record, {"kind": "persist-start-intent"})
        for evidence in (
            {"kind": "terminal-inspect", "execId": child, "running": False, "exitCode": 0, "noOutstandingStart": True},
            {"kind": "start-acknowledged", "execId": child, "positive": False},
            {"kind": "start-acknowledged", "execId": "b" * 64, "positive": True},
        ):
            with self.subTest(evidence=evidence), self.assertRaises(ValueError):
                MODULE.transition_exec_record(record, evidence)
        record = MODULE.transition_exec_record(record, {"kind": "start-acknowledged", "execId": child, "positive": True})
        with self.assertRaises(ValueError):
            MODULE.transition_exec_record(record, {"kind": "terminal-inspect", "execId": child, "running": False, "exitCode": 0, "noOutstandingStart": True})
        record = MODULE.transition_exec_record(record, {"kind": "child-running", "execId": child, "running": True})
        for evidence in (
            {"kind": "terminal-inspect", "execId": child, "running": False, "exitCode": 0, "noOutstandingStart": False},
            {"kind": "terminal-inspect", "execId": "b" * 64, "running": False, "exitCode": 0, "noOutstandingStart": True},
            {"kind": "terminal-inspect", "execId": child, "running": True, "exitCode": 0, "noOutstandingStart": True},
        ):
            with self.subTest(evidence=evidence), self.assertRaises(ValueError):
                MODULE.transition_exec_record(record, evidence)
        stopped = MODULE.transition_exec_record(record, {"kind": "terminal-inspect", "execId": child, "running": False, "exitCode": 1, "noOutstandingStart": True})
        self.assertEqual((stopped["phase"], stopped["exitCode"]), ("stopped", 1))

    @unittest.skipUnless(os.name == "posix", "requires POSIX flock")
    def test_durable_hold_persists_and_conflicting_lock_denies(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / "lock"
            lock.touch(mode=0o600)
            with MODULE.DurableHold(directory, "lock") as hold:
                hold.create({"phase": "prepared", "nonce": "test"})
                with self.assertRaises(BlockingIOError):
                    with MODULE.DurableHold(directory, "lock"):
                        pass
                old = hold.read()
                hold.replace(old, {**old, "phase": "created"})
            with MODULE.DurableHold(directory, "lock") as reopened:
                self.assertEqual(reopened.read()["phase"], "created")
                (Path(directory) / ".operation-hold-orphan").touch(mode=0o600)
                with self.assertRaisesRegex(ValueError, "unfinished"):
                    reopened.read()






if __name__ == "__main__":
    unittest.main()
