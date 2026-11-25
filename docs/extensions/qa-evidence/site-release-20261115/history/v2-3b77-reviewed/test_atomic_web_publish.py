"""Bounded static/manifest tests; they do not invoke the publisher or Docker.

Independent QA must additionally execute the isolated container trial described
in ATOMIC_WEB_QA.md. Run this file only from a synthetic QA copy with python -B.
"""

import ast
import importlib.util
import json
import sys
import stat
from types import SimpleNamespace
from pathlib import Path
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "atomic-web-publish.py"
SPEC = importlib.util.spec_from_file_location("atomic_web_proposal", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
FAKE_INPUTS = (b"{}", b"{}", [], b"{}", {"candidate": {"files": {"index.html": {"bytes": 4}}}})


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

    def test_nonzero_exec_still_runs_post_identity_check(self):
        class Result:
            returncode = 1
            stdout = b""
            stderr = b'{"observation":"failed","phase":"visible-unfenced"}'
        with patch.object(MODULE, "load_inputs", return_value=FAKE_INPUTS), \
             patch.object(MODULE, "read_regular", return_value=b"data"), \
             patch.object(MODULE, "inspect_identity") as inspect, \
             patch.object(MODULE.subprocess, "run", return_value=Result()), \
             patch("builtins.print") as output:
            with self.assertRaises(MODULE.HostIndeterminate):
                MODULE._run_locked("publish")
        self.assertEqual(inspect.call_count, 4)
        result = json.loads(output.call_args.args[0])
        self.assertEqual(result["status"], "indeterminate")
        self.assertEqual(result["filesystemObservation"]["phase"], "visible-unfenced")

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

    def test_lost_exec_still_reads_identity_and_reports_indeterminate(self):
        with patch.object(MODULE, "load_inputs", return_value=FAKE_INPUTS), \
             patch.object(MODULE, "read_regular", return_value=b"data"), \
             patch.object(MODULE, "inspect_identity") as inspect, \
             patch.object(MODULE.subprocess, "run", side_effect=OSError("lost")), \
             patch("builtins.print") as output:
            with self.assertRaises(MODULE.HostIndeterminate):
                MODULE._run_locked("publish")
        self.assertEqual(inspect.call_count, 4)
        result = json.loads(output.call_args.args[0])
        self.assertEqual(result["status"], "indeterminate")
        self.assertEqual(result["execError"], "OSError")

    def test_nonzero_exec_exposes_read_only_readback_without_claiming_success(self):
        failed = SimpleNamespace(returncode=1, stdout=b"", stderr=b'{"observation":"failed"}')
        observed = SimpleNamespace(returncode=0, stderr=b"", stdout=b'{"observation":"readback","classification":"new-entry-complete","backup":"verified"}')
        with patch.object(MODULE, "load_inputs", return_value=FAKE_INPUTS), \
             patch.object(MODULE, "read_regular", return_value=b"data"), \
             patch.object(MODULE, "inspect_identity"), \
             patch.object(MODULE.subprocess, "run", side_effect=[failed, observed]) as docker, \
             patch("builtins.print") as output:
            with self.assertRaises(MODULE.HostIndeterminate):
                MODULE._run_locked("publish")
        verdict = json.loads(output.call_args.args[0])
        self.assertEqual(verdict["status"], "indeterminate")
        self.assertEqual(verdict["scopedReadback"]["classification"], "new-entry-complete")
        self.assertEqual(docker.call_args_list[1].args[0][-1], "observe")

    def test_post_identity_failure_prevents_success(self):
        class Result:
            returncode = 0
            stdout = b'{"observation":"complete","phase":"journal-fenced"}'
            stderr = b""
        with patch.object(MODULE, "load_inputs", return_value=FAKE_INPUTS), \
             patch.object(MODULE, "read_regular", return_value=b"data"), \
             patch.object(MODULE, "inspect_identity", side_effect=[None, None, ValueError()]), \
             patch.object(MODULE.subprocess, "run", return_value=Result()), \
             patch("builtins.print") as output:
            with self.assertRaises(MODULE.HostIndeterminate):
                MODULE._run_locked("publish")
        self.assertEqual(json.loads(output.call_args.args[0])["identity"], "unverified")

    def test_uncertain_operation_keeps_lock_through_reconcile(self):
        events = []
        fake_fcntl = SimpleNamespace(LOCK_EX=2, LOCK_NB=4,
                                    flock=lambda fd, flags: events.append("locked"))
        directory = SimpleNamespace(st_uid=10, st_mode=stat.S_IFDIR | 0o700)
        fileinfo = SimpleNamespace(st_uid=10, st_mode=stat.S_IFREG | 0o600, st_nlink=1)
        def operation(action):
            events.append(action)
            if action == "publish":
                raise MODULE.HostIndeterminate()
        with patch.object(MODULE, "REVIEW_GATE", True), \
             patch.dict(sys.modules, {"fcntl": fake_fcntl}), \
             patch.object(MODULE.os, "O_DIRECTORY", 0, create=True), \
             patch.object(MODULE.os, "O_NOFOLLOW", 0, create=True), \
             patch.object(MODULE.os, "O_NONBLOCK", 0, create=True), \
             patch.object(MODULE.os, "geteuid", return_value=10, create=True), \
             patch.object(MODULE.os, "open", side_effect=[100, 101]), \
             patch.object(MODULE.os, "fstat", side_effect=[directory, fileinfo]), \
             patch.object(MODULE.os, "close", side_effect=lambda fd: events.append(f"close:{fd}")), \
             patch.object(MODULE, "_run_locked", side_effect=operation), \
             patch("builtins.input", return_value="reconcile"):
            MODULE.run("publish")
        self.assertEqual(events, ["locked", "publish", "reconcile", "close:101", "close:100"])


if __name__ == "__main__":
    unittest.main()
