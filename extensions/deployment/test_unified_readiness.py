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
            self.assertEqual(deploy.probe_billing_disabled(), body)
        probe.assert_called_once_with("https://tadazz.com/api/billing/config")

    def test_only_boolean_false_is_disabled(self):
        for body in ({"enabled": True}, {"enabled": "false"}, {"enabled": 0},
                     {"enabled": None}, {}, [], False):
            with self.subTest(body=body), patch.object(
                deploy, "probe", return_value=json.dumps(body).encode()
            ), self.assertRaises(RuntimeError):
                deploy.probe_billing_disabled()

    def test_probe_failure_is_not_accepted_as_disabled(self):
        with patch.object(deploy, "probe", side_effect=RuntimeError("HTTP failure")), \
                self.assertRaises(RuntimeError):
            deploy.probe_billing_disabled()


class RetainedRegistryTests(unittest.TestCase):
    original = {
        "Id": "synthetic-pinned-container-id",
        "State": {"StartedAt": "2026-11-27T03:00:00.000000000Z"},
        "HostConfig": {"LogConfig": {"Type": "json-file", "Config": {}}},
    }
    startup = ("2026-11-27T03:00:00.050000000Z Game cleanup task started\n"
               "2026-11-27T03:00:00.100000000Z Tadazz protected native host listening on loopback\n")
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

    def test_exact_timestamp_tie_uses_later_log_event(self):
        timestamp = "2026-11-27T03:02:00.123456789Z"
        logs = (self.startup +
                timestamp + " Removed game. Remaining games: 0\n" +
                timestamp + " Game synthetic added. Total games: 1\n")
        with patch.object(deploy, "command", return_value=logs), \
                self.assertRaisesRegex(RuntimeError, "Active rooms"):
            deploy.game_count_evidence(self.original)

    def test_sub_microsecond_counts_keep_nanosecond_order(self):
        zero = "2026-11-27T03:02:00.123456100Z Removed game. Remaining games: 0\n"
        active = "2026-11-27T03:02:00.123456900Z Game synthetic added. Total games: 1\n"
        for events in (zero + active, active + zero):
            with self.subTest(events=events), patch.object(deploy, "command", return_value=self.startup + events), \
                    self.assertRaisesRegex(RuntimeError, "Active rooms"):
                deploy.game_count_evidence(self.original)

    def test_count_before_start_in_same_microsecond_is_rejected(self):
        original = {**self.original, "State": {
            "StartedAt": "2026-11-27T03:00:00.000000500Z"}}
        logs = (self.startup +
                "2026-11-27T03:00:00.000000100Z Removed game. Remaining games: 0\n")
        with patch.object(deploy, "command", return_value=logs), \
                self.assertRaisesRegex(RuntimeError, "precedes"):
            deploy.game_count_evidence(original)

class ImmediateCutoverGateTests(unittest.TestCase):
    original = {
        "Id": "synthetic-original", "Image": "sha256:synthetic",
        "State": {"Running": True, "StartedAt": "2026-11-27T03:00:00Z"},
        "HostConfig": {"LogConfig": {"Type": "json-file", "Config": {}}},
    }

    def test_replacement_container_blocks_without_reading_registry(self):
        changed = {**self.original, "Id": "concurrent-release"}
        with patch.object(deploy, "inspect", return_value=changed), \
                patch.object(deploy, "game_count_evidence") as evidence, \
                self.assertRaisesRegex(RuntimeError, "identity"):
            deploy.pre_stop_game_evidence(self.original)
        evidence.assert_not_called()

    def test_stopped_container_blocks_without_reading_registry(self):
        changed = {**self.original, "State": {**self.original["State"], "Running": False}}
        with patch.object(deploy, "inspect", return_value=changed), \
                patch.object(deploy, "game_count_evidence") as evidence, \
                self.assertRaisesRegex(RuntimeError, "running state"):
            deploy.pre_stop_game_evidence(self.original)
        evidence.assert_not_called()

    def test_newly_started_room_blocks_immediate_cutover(self):
        logs = (RetainedRegistryTests.startup +
                "2026-11-27T03:03:00Z Game synthetic added. Total games: 1\n")
        with patch.object(deploy, "inspect", return_value=self.original), \
                patch.object(deploy, "command", return_value=logs), \
                self.assertRaisesRegex(RuntimeError, "Active rooms"):
            deploy.pre_stop_game_evidence(self.original)

    def test_fresh_empty_evidence_retains_nonatomic_limit(self):
        with patch.object(deploy, "inspect", return_value=self.original), \
                patch.object(deploy, "command", return_value=RetainedRegistryTests.startup):
            evidence = deploy.pre_stop_game_evidence(self.original)
        self.assertEqual(evidence["count"], 0)
        self.assertEqual(evidence["container"], self.original["Id"])
        self.assertFalse(evidence["checkStopRaceEliminated"])


if __name__ == "__main__":
    unittest.main()
