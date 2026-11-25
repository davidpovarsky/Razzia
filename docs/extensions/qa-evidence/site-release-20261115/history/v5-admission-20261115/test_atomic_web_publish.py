"""Bounded static/manifest tests; they do not invoke the publisher or Docker.

Independent QA must additionally execute the isolated container trial described
in ATOMIC_WEB_QA.md. Run this file only from a synthetic QA copy with python -B.
"""

import ast
import importlib.util
import json
import errno
import os
import tempfile
import io
import sys
from types import SimpleNamespace
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

    def test_storage_error_is_distinct_from_interrupted_final_journal(self):
        base = {"observation": "failed", "phase": "directories-fenced", "operation": "journal:published",
                "chain": [], "secondary": None, "failureJournal": "written"}
        interrupted = MODULE.classify_child_failure({**base, "error": "InterruptedError", "errno": errno.EINTR}, 1)
        eio = MODULE.classify_child_failure({**base, "error": "OSError", "errno": errno.EIO}, 1)
        wrong_phase = MODULE.classify_child_failure({**base, "phase": "backup", "error": "InterruptedError", "errno": errno.EINTR}, 1)
        chained = MODULE.classify_child_failure({**base, "error": "InterruptedError", "errno": errno.EINTR,
                                                  "chain": [{"error": "OSError", "errno": errno.EIO}]}, 1)
        self.assertEqual(interrupted["kind"], "benign-interrupted-journal")
        self.assertEqual((eio["kind"], eio["errno"]), ("storage-or-unknown", errno.EIO))
        self.assertEqual(wrong_phase["kind"], "storage-or-unknown")
        self.assertEqual(chained["kind"], "storage-or-unknown")
        self.assertEqual(MODULE.classify_child_failure({}, 1)["kind"], "unclassified")
        for failure in (eio, wrong_phase, {"kind": "unclassified"}, None):
            with self.subTest(failure=failure):
                self.assertFalse(MODULE.recovery_eligible({"phase": "stopped", "exitCode": 1, "failure": failure}, "reconcile"))
        self.assertTrue(MODULE.recovery_eligible({"phase": "stopped", "exitCode": 1, "failure": interrupted}, "reconcile"))
        self.assertFalse(MODULE.recovery_eligible({"phase": "stopped", "exitCode": 1, "failure": interrupted}, "publish"))

    def test_actual_child_exception_handler_preserves_secondary_eio(self):
        tree = ast.parse(MODULE.INNER)
        main_try = next(n for n in tree.body if isinstance(n, ast.Try) and n.handlers
                        and isinstance(n.handlers[0].type, ast.Name) and n.handlers[0].type.id == "Exception")
        handler = main_try.handlers[0]
        witness = ast.Try(body=[ast.Raise(exc=ast.Call(func=ast.Name(id="InterruptedError", ctx=ast.Load()),
                              args=[ast.Constant(errno.EINTR), ast.Constant("injected")], keywords=[]), cause=None)],
                          handlers=[handler], orelse=[], finalbody=[])
        compiled = compile(ast.fix_missing_locations(ast.Module(body=[witness], type_ignores=[])), "<inner-handler>", "exec")
        stderr = io.StringIO()
        def journal_failure(*_):
            raise OSError(errno.EIO, "injected")
        def stop(code):
            raise SystemExit(code)
        namespace = {"phase": "directories-fenced", "current_operation": "journal:published",
                     "stage": object(), "mode": "publish", "journal": journal_failure,
                     "time": SimpleNamespace(time_ns=lambda: 1), "json": json,
                     "sys": SimpleNamespace(stderr=stderr, exit=stop)}
        with self.assertRaises(SystemExit):
            exec(compiled, namespace)
        observation = json.loads(stderr.getvalue())
        self.assertEqual(observation["errno"], errno.EINTR)
        self.assertEqual(observation["secondary"]["errno"], errno.EIO)
        failure = MODULE.classify_child_failure(observation, 1)
        self.assertEqual(failure["kind"], "storage-or-unknown")
        for action in ("rollback", "reconcile"):
            self.assertFalse(MODULE.recovery_eligible({"phase": "stopped", "exitCode": 1, "failure": failure}, action))
        if os.name == "posix":
            with tempfile.TemporaryDirectory() as directory:
                (Path(directory) / "lock").touch(mode=0o600)
                target = MODULE.FixtureTarget("a" * 64, "tadazz-atomic-qa-test", "b" * 32,
                    MODULE.IMAGE, "started", "/synthetic/operator", directory, directory + "/receipt",
                    "lock", os.geteuid(), "c" * 64, (), ())
                record = {"phase": "stopped", "nonce": "e" * 32, "action": "publish", "exitCode": 1,
                    "execId": "d" * 64, "failure": failure, "targetId": target.container_id,
                    "image": target.image, "started": target.started, "mounts": [], "tmpfs": [],
                    "name": target.name, "fixtureNonce": target.nonce, "lockName": target.lock_name,
                    "ownerUid": target.owner_uid, "helper": target.helper_sha256, "operator": target.operator,
                    "control": target.control, "inputHash": MODULE.sha(b"synthetic"), "leaseHash": "lease", "history": []}
                with MODULE.DurableHold(directory, "lock") as hold:
                    hold.create(record)
                dispatches = []
                engine = SimpleNamespace(create=lambda *_: dispatches.append(True))
                with patch.object(MODULE, "EngineAdapter", return_value=engine), \
                     patch.object(MODULE.FixtureTarget, "validate"), \
                     patch.object(MODULE.FixtureTarget, "verify_helper"), \
                     patch.object(MODULE, "verify_hq_lease", return_value="lease"), \
                     patch.object(MODULE, "build_payload", return_value=b"synthetic"):
                    for action in ("rollback", "reconcile"):
                        self.assertEqual(MODULE._coordinate(target, action)["status"], "indeterminate")
                self.assertEqual(dispatches, [])
                with MODULE.DurableHold(directory, "lock") as hold:
                    self.assertEqual(hold.read(), record)

    @unittest.skipUnless(os.name == "posix", "requires POSIX flock")
    def test_wrong_success_receipt_keeps_hold_and_dispatches_no_recovery_exec(self):
        def run_case(valid):
            with tempfile.TemporaryDirectory() as directory:
                (Path(directory) / "lock").touch(mode=0o600)
                target = MODULE.FixtureTarget("a" * 64, "tadazz-atomic-qa-test", "b" * 32,
                    MODULE.IMAGE, "started", "/synthetic/operator", directory, directory + "/receipt",
                    "lock", os.geteuid(), "c" * 64, (), ())
                class Engine:
                    def __init__(self): self.creates = 0
                    def create(self, hold, record, _target, _action):
                        self.creates += 1
                        created = {**record, "phase": "created", "execId": "d" * 64}
                        hold.replace(record, created)
                        return created
                    def start_once(self, hold, record, _target, _payload):
                        stopped = {**record, "phase": "stopped", "exitCode": 0,
                                   "failure": {"kind": "unclassified", "phase": None, "operation": None, "errno": None}}
                        hold.replace(record, stopped)
                        receipt = {"observation": "complete", "phase": "journal-fenced", "classification": "new-entry-complete",
                                   "oldIndex": MODULE.OLD_INDEX, "newIndex": MODULE.NEW_INDEX if valid else "wrong"}
                        body = json.dumps(receipt).encode()
                        return stopped, b'\x01\x00\x00\x00' + len(body).to_bytes(4, 'big') + body
                engine = Engine()
                with patch.object(MODULE, "EngineAdapter", return_value=engine), \
                     patch.object(MODULE.FixtureTarget, "validate"), \
                     patch.object(MODULE.FixtureTarget, "verify_helper"), \
                     patch.object(MODULE, "verify_hq_lease", return_value="lease"), \
                     patch.object(MODULE, "build_payload", return_value=b"synthetic"):
                    result = MODULE._coordinate(target, "publish")
                    if valid:
                        self.assertEqual(result["status"], "verified")
                        with MODULE.DurableHold(directory, "lock") as hold:
                            self.assertEqual(hold.read()["phase"], "closed")
                    else:
                        self.assertEqual(result["status"], "indeterminate")
                        with MODULE.DurableHold(directory, "lock") as hold:
                            self.assertEqual(hold.read()["failure"]["kind"], "unclassified")
                        for action in ("rollback", "reconcile"):
                            self.assertEqual(MODULE._coordinate(target, action)["status"], "indeterminate")
                        self.assertEqual(engine.creates, 1)
        run_case(False)
        run_case(True)

    @unittest.skipUnless(os.name == "posix", "requires POSIX flock")
    def test_secondary_eio_blocks_new_exec_and_benign_eintr_is_eligible(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "lock").touch(mode=0o600)
            target = MODULE.FixtureTarget("a" * 64, "tadazz-atomic-qa-test", "b" * 32,
                MODULE.IMAGE, "started", "/synthetic/operator", directory, directory + "/receipt",
                "lock", os.geteuid(), "c" * 64, (), ())
            observation = {"observation": "failed", "phase": "directories-fenced", "operation": "journal:published",
                "error": "InterruptedError", "errno": errno.EINTR, "chain": [], "failureJournal": "failed",
                "secondary": {"error": "OSError", "errno": errno.EIO, "operation": "journal:failure"}}
            failure = MODULE.classify_child_failure(observation, 1)
            record = {"phase": "stopped", "nonce": "e" * 32, "action": "publish", "exitCode": 1,
                "execId": "d" * 64, "failure": failure, "targetId": target.container_id,
                "image": target.image, "started": target.started, "mounts": [], "tmpfs": [],
                "name": target.name, "fixtureNonce": target.nonce, "lockName": target.lock_name,
                "ownerUid": target.owner_uid, "helper": target.helper_sha256, "operator": target.operator,
                "control": target.control, "inputHash": MODULE.sha(b"synthetic"), "leaseHash": "lease", "history": []}
            with MODULE.DurableHold(directory, "lock") as hold:
                hold.create(record)
            dispatches = []
            engine = SimpleNamespace(create=lambda *_: dispatches.append(True))
            with patch.object(MODULE, "EngineAdapter", return_value=engine), \
                 patch.object(MODULE.FixtureTarget, "validate"), \
                 patch.object(MODULE.FixtureTarget, "verify_helper"), \
                 patch.object(MODULE, "verify_hq_lease", return_value="lease"), \
                 patch.object(MODULE, "build_payload", return_value=b"synthetic"):
                for action in ("rollback", "reconcile"):
                    self.assertEqual(MODULE._coordinate(target, action)["status"], "indeterminate")
            self.assertEqual(dispatches, [])
            with MODULE.DurableHold(directory, "lock") as hold:
                self.assertEqual(hold.read(), record)
            benign = MODULE.classify_child_failure({**observation, "secondary": None, "failureJournal": "written"}, 1)
            self.assertTrue(MODULE.recovery_eligible({"phase": "stopped", "exitCode": 1, "failure": benign}, "reconcile"))
            with MODULE.DurableHold(directory, "lock") as hold:
                hold.replace(record, {**record, "failure": benign})
            with patch.object(MODULE, "EngineAdapter", return_value=engine), \
                 patch.object(MODULE.FixtureTarget, "validate"), \
                 patch.object(MODULE.FixtureTarget, "verify_helper"), \
                 patch.object(MODULE, "verify_hq_lease", return_value="lease"), \
                 patch.object(MODULE, "build_payload", return_value=b"synthetic"):
                self.assertEqual(MODULE._coordinate(target, "reconcile")["status"], "indeterminate")
            self.assertEqual(len(dispatches), 1)

    @unittest.skipUnless(os.name == "posix", "requires POSIX flock")
    def test_final_directory_fsync_failure_leaves_canonical_hold_and_requires_refence(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "lock").touch(mode=0o600)
            with MODULE.DurableHold(directory, "lock") as hold:
                record = {"phase": "verified-disposition", "nonce": "a" * 32}
                hold.create(record)
                real_fsync = os.fsync
                calls = []
                def fail_final(fd):
                    calls.append(fd)
                    if len(calls) == 3:
                        raise OSError(errno.EIO, "synthetic failure")
                    return real_fsync(fd)
                with patch.object(MODULE.os, "fsync", side_effect=fail_final):
                    with self.assertRaises(OSError):
                        hold.complete(record)
                self.assertTrue((Path(directory) / MODULE.HOLD_NAME).exists())
                closed = hold.read()
                self.assertEqual(closed["phase"], "closed")
                with patch.object(MODULE.os, "fsync", side_effect=OSError(errno.EIO, "synthetic failure")):
                    with self.assertRaises(OSError):
                        hold.qualify_closed(closed)
                self.assertEqual(hold.read(), closed)
                hold.qualify_closed(closed)
                self.assertEqual(hold.read(), closed)

    @unittest.skipUnless(os.name == "posix", "requires POSIX flock")
    def test_successful_close_keeps_record_and_qualifies_before_reuse(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "lock").touch(mode=0o600)
            with MODULE.DurableHold(directory, "lock") as hold:
                record = {"phase": "verified-disposition", "nonce": "b" * 32}
                hold.create(record)
                closed = hold.complete(record)
                self.assertEqual(closed["phase"], "closed")
                self.assertEqual(hold.read(), closed)
                hold.qualify_closed(closed)
                hold.replace(closed, {"phase": "prepared", "nonce": "c" * 32})
                self.assertEqual(hold.read()["phase"], "prepared")

    def test_production_tmpfs_must_match_actual_daemon_readback(self):
        target = MODULE.ProductionTarget(MODULE.CONTAINER, "tadazz", "production", MODULE.IMAGE,
            MODULE.STARTED, str(MODULE.OPERATOR), MODULE.LOCK_DIR,
            str(MODULE.OPERATOR / "public-file-sizes-and-controls.json"), MODULE.LOCK_NAME,
            1001, "a" * 64, tuple(MODULE.EXPECTED_MOUNTS), ())
        mounts = [{"Type": a, "Destination": b, "Source": c, "RW": d} for a, b, c, d in MODULE.EXPECTED_MOUNTS]
        obj = {"Id": MODULE.CONTAINER, "Name": "/tadazz", "Image": MODULE.IMAGE,
               "State": {"Running": True, "StartedAt": MODULE.STARTED},
               "Mounts": mounts, "HostConfig": {"Tmpfs": {}}}
        engine = type("Engine", (), {"_request_json": lambda self, *_: obj})()
        target.validate(engine)
        obj["HostConfig"]["Tmpfs"] = {"/app/web": "rw"}
        with self.assertRaisesRegex(ValueError, "target mismatch"):
            target.validate(engine)






if __name__ == "__main__":
    unittest.main()
