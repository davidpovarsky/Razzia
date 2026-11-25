"""Source-only admission tests. All production I/O and Engine calls are mocked."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "atomic-web-publish.py"
SPEC = importlib.util.spec_from_file_location("site_production_entry", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FakeHold:
    def __init__(self, *_):
        self.record = None
    def __enter__(self): return self
    def __exit__(self, *_): return None
    def read(self): return self.record
    def create(self, record): self.record = record


class AdmissionTests(unittest.TestCase):
    def exercise(self, case):
        helper = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
        lease = {"targetId": MODULE.CONTAINER, "image": MODULE.IMAGE, "started": MODULE.STARTED,
                 "helper": helper, "nonce": "a" * 32, "actions": ["publish", "rollback", "reconcile"]}
        approved = helper
        if case == "wrong-helper": approved = "b" * 64
        if case == "wrong-target": lease["targetId"] = "c" * 64
        if case == "stale-start": lease["started"] = "stale"
        if case == "wrong-action": lease["actions"] = ["rollback", "reconcile"]
        if case == "lease-helper": lease["helper"] = "d" * 64
        calls = []
        class Engine:
            def create(self, *_):
                calls.append("create")
                raise RuntimeError("synthetic stop before Engine access")
        def fake_read(path, *_args, **_kwargs):
            if path.name == "approved-helper.sha256":
                if case == "missing-approval": raise FileNotFoundError()
                return approved.encode()
            if path.name == "hq-lease.json":
                if case == "missing-lease": raise FileNotFoundError()
                return json.dumps(lease, sort_keys=True).encode()
            raise AssertionError("unexpected file access")
        with patch.object(MODULE, "DurableHold", FakeHold), \
             patch.object(MODULE, "EngineAdapter", return_value=Engine()), \
             patch.object(MODULE, "read_regular", side_effect=fake_read), \
             patch.object(MODULE.ProductionTarget, "validate"), \
             patch.object(MODULE, "build_payload", return_value=b"synthetic"):
            result = MODULE.run("publish")
        self.assertEqual(result["status"], "indeterminate")
        return calls

    def test_missing_stale_or_mismatched_approval_and_lease_deny_dispatch(self):
        for case in ("missing-approval", "wrong-helper", "missing-lease", "wrong-target",
                     "stale-start", "wrong-action", "lease-helper"):
            with self.subTest(case=case): self.assertEqual(self.exercise(case), [])

    def test_matching_approval_and_full_action_lease_reaches_create(self):
        self.assertEqual(self.exercise("valid"), ["create"])

    def test_cli_construction_pins_target_even_with_environment_values(self):
        captured = []
        with patch.dict("os.environ", {"CONTAINER": "other", "IMAGE": "other", "OPERATOR": "/other"}), \
             patch.object(MODULE, "_coordinate", side_effect=lambda target, action: captured.append((target, action))):
            MODULE.run("publish")
        target, action = captured[0]
        self.assertEqual((target.container_id, target.image, target.started, target.operator, target.control, action),
                         (MODULE.CONTAINER, MODULE.IMAGE, MODULE.STARTED, str(MODULE.OPERATOR), MODULE.LOCK_DIR, "publish"))

    def test_fixture_entry_never_accepts_production_target(self):
        target = MODULE.ProductionTarget(MODULE.CONTAINER, "tadazz", "production", MODULE.IMAGE,
            MODULE.STARTED, str(MODULE.OPERATOR), MODULE.LOCK_DIR,
            str(MODULE.OPERATOR / "public-file-sizes-and-controls.json"), MODULE.LOCK_NAME,
            1001, "a" * 64, tuple(MODULE.EXPECTED_MOUNTS), ())
        with self.assertRaisesRegex(ValueError, "synthetic"):
            MODULE.coordinate_fixture(target, "publish")


if __name__ == "__main__": unittest.main()
