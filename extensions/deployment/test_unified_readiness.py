"""Synthetic readiness checks; no network, Docker, or production writes."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "unified_deploy_readiness", Path(__file__).with_name("deploy-unified-site.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DisabledBillingTests(unittest.TestCase):
    def test_published_catalog_metadata_keeps_checkout_disabled(self):
        body = {"enabled": False, "configured": True, "environment": "live",
                "catalogAvailable": True}
        with patch.object(deploy, "probe", return_value=json.dumps(body).encode()) as probe:
            self.assertEqual(deploy.probe_disabled_billing(), body)
        probe.assert_called_once_with("https://tadazz.com/api/billing/config")

    def test_only_boolean_false_is_disabled(self):
        for body in ({"enabled": True}, {"enabled": "false"}, {"enabled": 0},
                     {"enabled": None}, {}, [], False):
            with self.subTest(body=body), patch.object(
                deploy, "probe", return_value=json.dumps(body).encode()
            ), self.assertRaises(RuntimeError):
                deploy.probe_disabled_billing()

    def test_probe_failure_is_not_accepted_as_disabled(self):
        with patch.object(deploy, "probe", side_effect=RuntimeError("HTTP failure")), \
                self.assertRaises(RuntimeError):
            deploy.probe_disabled_billing()


class RetainedRegistryTests(unittest.TestCase):
    original = {
        "Id": "synthetic-pinned-container-id",
        "State": {"StartedAt": "2026-11-27T03:00:00.000000000Z"},
    }
    startup = "2026-11-27T03:00:00.100000000Z Tadazz protected native host listening on loopback\n"
    added = "2026-11-27T03:01:00.000000000Z Game synthetic added. Total games: 1\n"
    empty = "2026-11-27T03:02:00.000000000Z Removed 1 empty game(s). Remaining games: 0\n"

    def evidence(self, logs):
        with patch.object(deploy, "command", return_value=logs) as command:
            result = deploy.game_count_evidence(self.original)
        command.assert_called_once_with(
            "docker", "logs", "--timestamps", "--since",
            self.original["State"]["StartedAt"], "--tail", "all", self.original["Id"])
        return result

    def test_native_startup_and_no_events_proves_initial_empty_registry(self):
        result = self.evidence(self.startup)
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["source"], "retained-startup-empty-registry-no-subsequent-game-events")
        self.assertEqual(result["lastCountAt"], self.original["State"]["StartedAt"])
        self.assertFalse(result["checkStopRaceEliminated"])

    def test_active_last_event_blocks_even_after_an_earlier_zero(self):
        later_added = self.added.replace("03:01:00", "03:03:00")
        for logs in (self.startup + self.added, self.startup + self.empty + later_added):
            with self.subTest(logs=logs), patch.object(deploy, "command", return_value=logs), \
                    self.assertRaisesRegex(RuntimeError, "Active rooms"):
                deploy.game_count_evidence(self.original)

    def test_completed_game_can_return_to_zero_with_retained_evidence(self):
        result = self.evidence(self.startup + self.added + self.empty)
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["source"], "complete-retained-container-log-events")
        self.assertEqual(result["lastCountAt"], "2026-11-27T03:02:00.000000000Z")

    def test_missing_startup_blocks_even_if_last_count_is_zero(self):
        for logs in ("", self.empty):
            with self.subTest(logs=logs), patch.object(deploy, "command", return_value=logs), \
                    self.assertRaisesRegex(RuntimeError, "startup log is not retained"):
                deploy.game_count_evidence(self.original)

    def test_legacy_startups_remain_supported(self):
        for message in ("Socket server is running", "Server is running",
                        "Server running on port 3001"):
            with self.subTest(message=message):
                result = self.evidence("2026-11-27T03:00:01Z " + message + "\n")
                self.assertEqual(result["count"], 0)

    def test_old_or_unverifiable_startup_and_event_timestamps_block(self):
        invalid = (
            self.startup.replace("2026-11-27", "2026-11-26"),
            self.startup.replace("2026-11-27T03:00:00.100000000Z", "garbage"),
            self.startup + self.empty.replace("2026-11-27", "2026-11-26"),
            self.startup + self.empty.replace("2026-11-27T03:02:00.000000000Z", "garbage"),
        )
        for logs in invalid:
            with self.subTest(logs=logs), patch.object(deploy, "command", return_value=logs), \
                    self.assertRaises(RuntimeError):
                deploy.game_count_evidence(self.original)


if __name__ == "__main__":
    unittest.main()
