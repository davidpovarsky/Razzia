"""Synthetic operator lifecycle tests; no Docker/systemd or production paths."""

import importlib.util
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("worker_roll_forward", Path(__file__).with_name("roll-forward-package-worker.py"))
WORKER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = WORKER
SPEC.loader.exec_module(WORKER)


class FakeOperations:
    def __init__(self, paths, plan, timer="active", fail_new=False, never_finish=False, race=False, base_race=False, restore_race=None):
        self.paths, self.plan = paths, plan
        self.timer = timer
        self.fail_new, self.never_finish, self.race = fail_new, never_finish, race
        self.clock, self.old_polls, self.new_polls = 0, 2, 1
        self.started = False
        self.base_race = base_race
        self.restore_race = restore_race
        self.calls = []

    def run(self, argv):
        self.calls.append(argv)
        if argv[:3] == ["docker", "image", "inspect"]:
            return json.dumps([{"Id": argv[3], "Config": {"Labels": {
                "org.opencontainers.image.revision": self.plan["revision"],
                "com.tadazz.package-worker.source-manifest-sha256": self.plan["source_manifest_sha256"],
                "com.tadazz.package-worker.sdk-sha256": "f" * 64,
            }}}])
        if argv == ["systemctl", "stop", self.paths.timer.name]:
            self.timer = "inactive"
        elif argv == ["systemctl", "start", self.paths.timer.name]:
            self.timer = "active"
            if self.restore_race is not None:
                getattr(self.paths, self.restore_race).write_bytes(b"external change during timer restoration\n")
        elif argv == ["systemctl", "start", "--no-block", self.paths.unit.name]:
            self.started = True
            if self.race:
                self.paths.override.write_bytes(b"external operator change\n")
        elif argv != ["systemctl", "daemon-reload"]:
            raise AssertionError("Unexpected command, especially service interruption: " + repr(argv))
        return ""

    def state(self, unit):
        if unit == self.paths.timer.name:
            return {"ActiveState": self.timer}
        command = next((line.removeprefix("ExecStart=") for line in self.paths.override.read_text().splitlines() if line.startswith("ExecStart=/")), "")
        active = False
        if not self.started and self.old_polls:
            self.old_polls -= 1
            active = True
        elif self.started and (self.new_polls or self.never_finish):
            self.new_polls = max(0, self.new_polls - 1)
            active = True
        return {
            "ActiveState": "activating" if active else "failed" if self.started and self.fail_new else "inactive",
            "MainPID": "0", "ControlPID": "22" if active else "0",
            "Result": "exit-code" if self.started and self.fail_new else "success",
            "ExecMainStatus": "1" if self.started and self.fail_new else "0",
            "InvocationID": "new-run" if self.started else "old-run", "ExecStart": command,
        }

    def now(self):
        return self.clock

    def wait(self):
        self.clock += 1
        if self.base_race and not self.started:
            self.paths.unit.write_bytes(b"external base service change\n")


class WorkerRollForwardTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        units = root / "units"
        override = units / "tadazz-package-builder.service.d/20-qualified-toolchain.conf"
        override.parent.mkdir(parents=True)
        releases = root / "releases"
        previous = releases / ("a" * 40) / "package-build-worker.py"
        previous.parent.mkdir(parents=True)
        previous.write_bytes(b"print('previous synthetic broker')\n")
        self.old_override = ("[Service]\nExecStart=\nExecStart=/usr/bin/python3 " + str(previous) + " /synthetic/config/extensions/packages --image sha256:" + "b" * 64 + "\n").encode()
        override.write_bytes(self.old_override)
        override.chmod(0o644)
        unit, timer = units / "tadazz-package-builder.service", units / "tadazz-package-builder.timer"
        unit.write_bytes(b"synthetic base service\n")
        timer.write_bytes(b"synthetic base timer\n")
        self.paths = WORKER.Paths(unit, timer, override, releases, root / "deploy.lock")
        qualified = root / "qualified"
        source = qualified / "source/scripts/qa/package-build-worker.py"
        source.parent.mkdir(parents=True)
        source.write_bytes(b"print('next synthetic broker')\n")
        source_sha = WORKER.digest(source.read_bytes())
        revision, image = "c" * 40, "sha256:" + "d" * 64
        manifest = {"revision": revision, "appRevision": revision, "files": {"scripts/qa/package-build-worker.py": source_sha, "extensions/src/presentation/package-runtime/sdk.tsx": "f" * 64}}
        manifest_bytes = json.dumps(manifest).encode()
        (qualified / "source-manifest.json").write_bytes(manifest_bytes)
        manifest_sha = WORKER.digest(manifest_bytes)
        proof = {"ok": True, "revision": revision, "image": image, "sourceManifestSha256": manifest_sha, "workerSha256": source_sha, "workerExit": 0, "mediaValidated": True, "nativeAccept": {"phaseBeforeInstall": "preview-ready", "phaseAfterInstall": "installed", "nativeGames": 1, "preservedCooldownSeconds": [2], "reexportPreservedCooldownSeconds": [2]}, "belowMinimum": {"nativePreflightRejected": True, "workerRejected": True, "bundleProduced": False}, "productionChanged": False, "customerStorageAccessed": False}
        proof_bytes = json.dumps(proof).encode()
        (qualified / "matching-worker-proof.json").write_bytes(proof_bytes)
        self.plan = {
            "qualified_root": str(qualified), "revision": revision, "image": image,
            "qualification_sha256": WORKER.digest(proof_bytes), "source_manifest_sha256": manifest_sha, "worker_sha256": source_sha,
            "current_worker": str(previous), "current_worker_sha256": WORKER.digest(previous.read_bytes()),
            "current_image": "sha256:" + "b" * 64, "current_override_sha256": WORKER.digest(self.old_override),
            "unit_sha256": WORKER.digest(unit.read_bytes()), "timer_sha256": WORKER.digest(timer.read_bytes()),
            "report_dir": str(root / "report"), "wait_seconds": 3,
        }

    def run_upgrade(self, **options):
        ops = FakeOperations(self.paths, self.plan, **options)
        result = WORKER.roll_forward(self.plan, self.paths, ops)
        self.assertNotIn(["systemctl", "stop", self.paths.unit.name], ops.calls)
        self.assertEqual(WORKER.digest(self.paths.unit.read_bytes()), self.plan["unit_sha256"])
        self.assertEqual(WORKER.digest(self.paths.timer.read_bytes()), self.plan["timer_sha256"])
        return result, ops

    def test_success_waits_for_real_work_and_preserves_active_timer(self):
        result, ops = self.run_upgrade()
        self.assertTrue(result["success"])
        self.assertEqual(ops.timer, "active")
        self.assertIn(self.plan["image"], self.paths.override.read_text())
        self.assertGreaterEqual(ops.clock, 2)
        self.assertEqual((Path(self.plan["report_dir"]) / "override.before").read_bytes(), self.old_override)
        self.assertEqual(stat.S_IMODE(self.paths.override.stat().st_mode), 0o644)

    def test_previously_inactive_timer_stays_inactive(self):
        result, ops = self.run_upgrade(timer="inactive")
        self.assertTrue(result["success"])
        self.assertEqual(ops.timer, "inactive")
        self.assertNotIn(["systemctl", "start", self.paths.timer.name], ops.calls)

    def test_failed_new_run_restores_exact_override_and_prior_timer(self):
        result, ops = self.run_upgrade(fail_new=True)
        self.assertFalse(result["success"])
        self.assertTrue(result["rolledBackToExactPreviousOverride"])
        self.assertEqual(self.paths.override.read_bytes(), self.old_override)
        self.assertEqual(ops.timer, "active")

    def test_inflight_timeout_never_interrupts_or_rolls_back_under_running_build(self):
        result, ops = self.run_upgrade(never_finish=True)
        self.assertFalse(result["success"])
        self.assertTrue(result["reconciliationRequired"])
        self.assertTrue(result["timerLeftPaused"])
        self.assertIn(self.plan["image"], self.paths.override.read_text())
        self.assertEqual(ops.timer, "inactive")

    def test_changed_current_override_rejects_before_timer_or_files_are_changed(self):
        self.paths.override.write_bytes(b"foreign override\n")
        ops = FakeOperations(self.paths, self.plan)
        with self.assertRaisesRegex(WORKER.GuardFailure, "CURRENT_OVERRIDE_CHANGED"):
            WORKER.roll_forward(self.plan, self.paths, ops)
        self.assertEqual(ops.calls, [])
        self.assertEqual(ops.timer, "active")
        self.assertFalse(Path(self.plan["report_dir"]).exists())

    def test_external_override_change_is_not_overwritten_during_rollback(self):
        result, ops = self.run_upgrade(race=True)
        self.assertFalse(result["success"])
        self.assertTrue(result["reconciliationRequired"])
        self.assertEqual(self.paths.override.read_bytes(), b"external operator change\n")
        self.assertEqual(ops.timer, "inactive")

    def test_post_rename_sync_failure_restores_exact_previous_override(self):
        original_sync = WORKER.sync_dir
        failed = False

        def fail_after_rename(path):
            nonlocal failed
            if path == self.paths.override.parent and not failed:
                self.assertIn(self.plan["image"], self.paths.override.read_text())
                failed = True
                raise OSError("synthetic directory fsync failure after rename")
            original_sync(path)

        with mock.patch.object(WORKER, "sync_dir", side_effect=fail_after_rename):
            result, ops = self.run_upgrade()
        self.assertTrue(failed)
        self.assertFalse(result["success"])
        self.assertTrue(result["rolledBackToExactPreviousOverride"])
        self.assertEqual(result["failureCode"], "OSError")
        self.assertEqual(self.paths.override.read_bytes(), self.old_override)
        self.assertFalse(ops.started)
        self.assertEqual(ops.timer, "active")

    def test_unknown_override_after_incomplete_replace_never_resumes_timer(self):
        def race_before_rename(path, expected, data, mode):
            path.write_bytes(b"external change before rename\n")
            raise WORKER.GuardFailure("OVERRIDE_RACED")

        with mock.patch.object(WORKER, "replace_owned", side_effect=race_before_rename):
            result, ops = self.run_upgrade()
        self.assertFalse(result["success"])
        self.assertTrue(result["reconciliationRequired"])
        self.assertEqual(result["rollbackFailureCode"], "ROLLBACK_OVERRIDE_UNKNOWN")
        self.assertEqual(self.paths.override.read_bytes(), b"external change before rename\n")
        self.assertFalse(ops.started)
        self.assertEqual(ops.timer, "inactive")
        self.assertNotIn(["systemctl", "start", self.paths.timer.name], ops.calls)

    def test_override_change_during_timer_restoration_is_preserved_and_paused(self):
        result, ops = self.run_upgrade(restore_race="override")
        self.assertFalse(result["success"])
        self.assertTrue(result["reconciliationRequired"])
        self.assertEqual(result["rollbackFailureCode"], "ROLLBACK_OVERRIDE_UNKNOWN")
        self.assertEqual(self.paths.override.read_bytes(), b"external change during timer restoration\n")
        self.assertEqual(ops.timer, "inactive")

    def test_base_unit_change_during_timer_restoration_cannot_report_success(self):
        ops = FakeOperations(self.paths, self.plan, restore_race="unit")
        result = WORKER.roll_forward(self.plan, self.paths, ops)
        self.assertFalse(result["success"])
        self.assertTrue(result["reconciliationRequired"])
        self.assertFalse(result["baseUnitUnchanged"])
        self.assertTrue(result["timerConfigurationUnchanged"])
        self.assertEqual(self.paths.unit.read_bytes(), b"external change during timer restoration\n")
        self.assertEqual(ops.timer, "inactive")
        self.assertTrue(result["timerLeftPaused"])
        self.assertFalse(result["timerStateRestored"])
        self.assertNotIn(["systemctl", "stop", self.paths.unit.name], ops.calls)

    def test_override_change_during_rollback_timer_restoration_stays_paused(self):
        result, ops = self.run_upgrade(fail_new=True, restore_race="override")
        self.assertFalse(result["success"])
        self.assertTrue(result["reconciliationRequired"])
        self.assertEqual(result["rollbackFailureCode"], "ROLLBACK_OVERRIDE_RACED")
        self.assertEqual(self.paths.override.read_bytes(), b"external change during timer restoration\n")
        self.assertEqual(ops.timer, "inactive")
        self.assertTrue(result["timerLeftPaused"])

    def test_base_unit_race_is_preserved_and_reported_without_switching_worker(self):
        ops = FakeOperations(self.paths, self.plan, base_race=True)
        result = WORKER.roll_forward(self.plan, self.paths, ops)
        self.assertFalse(result["success"])
        self.assertFalse(result["baseUnitUnchanged"])
        self.assertTrue(result["timerConfigurationUnchanged"])
        self.assertEqual(self.paths.unit.read_bytes(), b"external base service change\n")
        self.assertEqual(self.paths.override.read_bytes(), self.old_override)
        self.assertFalse(ops.started)
        self.assertEqual(ops.timer, "inactive")
        self.assertTrue(result["reconciliationRequired"])


if __name__ == "__main__":
    unittest.main()
