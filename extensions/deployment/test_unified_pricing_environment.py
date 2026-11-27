"""Synthetic checks for the opt-in pricing-only deployment environment."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "unified_deploy", Path(__file__).with_name("deploy-unified-site.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class PricingEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "environment.json"
        self.values = {
            "TADAZZ_BILLING_ENABLED": "false",
            "TADAZZ_PRICING_PUBLISHED": "true",
            "PADDLE_ENVIRONMENT": "live",
            "PADDLE_API_KEY": "pdl_live_apikey_synthetic",
            "PADDLE_CLIENT_TOKEN": "live_" + "a" * 27,
            "PADDLE_WEBHOOK_SECRET": "synthetic-webhook-only",
            "TADAZZ_BILLING_CATALOG_PATH": "/app/config/billing-live-catalog.json",
        }

    def write(self):
        self.path.write_text(json.dumps(self.values))
        self.path.chmod(0o600)

    def test_preserves_auth_and_replaces_only_explicit_pricing_keys(self):
        self.write()
        original = ["JWT_SECRET=synthetic", "TADAZZ_ACCOUNTS_ENABLED=true",
                    "PADDLE_ENVIRONMENT=sandbox", "TADAZZ_BILLING_ENABLED=false"]
        result = deploy.pricing_environment(original, self.path)
        self.assertEqual(result[:2], original[:2])
        self.assertEqual(result.count("TADAZZ_BILLING_ENABLED=false"), 1)
        self.assertNotIn("PADDLE_ENVIRONMENT=sandbox", result)
        self.assertEqual(original[2], "PADDLE_ENVIRONMENT=sandbox")

    def test_no_file_keeps_original_environment(self):
        original = ["KEEP=synthetic"]
        self.assertIs(deploy.pricing_environment(original, None), original)

    def test_rejects_activation_and_unrelated_settings(self):
        for key, value in [("TADAZZ_BILLING_ENABLED", "true"),
                           ("JWT_SECRET", "replacement"),
                           ("PADDLE_ENVIRONMENT", "sandbox")]:
            with self.subTest(key=key):
                saved = dict(self.values)
                self.values[key] = value
                self.write()
                with self.assertRaises(RuntimeError):
                    deploy.pricing_environment([], self.path)
                self.values = saved

    def test_rejects_broad_file_permissions(self):
        self.write()
        self.path.chmod(0o644)
        with self.assertRaises(RuntimeError):
            deploy.pricing_environment([], self.path)

    def test_rejects_multiline_credentials(self):
        self.values["PADDLE_WEBHOOK_SECRET"] = "synthetic\nJWT_SECRET=other"
        self.write()
        with self.assertRaises(RuntimeError):
            deploy.pricing_environment([], self.path)


class BillingStateProbeTests(unittest.TestCase):
    def check_payload(self, payload):
        with patch.object(deploy, "probe", return_value=json.dumps(payload).encode()) as probe:
            result = deploy.probe_billing_disabled()
        probe.assert_called_once_with("https://tadazz.com/api/billing/config")
        return result

    def test_accepts_historical_disabled_response(self):
        self.assertEqual(self.check_payload({"enabled": False}), {"enabled": False})

    def test_accepts_current_live_readiness_metadata(self):
        payload = {"enabled": False, "configured": False,
                   "environment": "live", "catalogAvailable": True}
        self.assertEqual(self.check_payload(payload), payload)

    def test_rejects_enabled_checkout(self):
        with self.assertRaisesRegex(RuntimeError, "explicitly disabled"):
            self.check_payload({"enabled": True, "configured": True})

    def test_rejects_absent_or_nonboolean_disabled_state(self):
        for payload in [{}, None, [], False, {"enabled": None},
                        {"enabled": 0}, {"enabled": "false"}]:
            with self.subTest(payload=payload):
                with self.assertRaisesRegex(RuntimeError, "explicitly disabled"):
                    self.check_payload(payload)

    def test_rejects_invalid_json(self):
        with patch.object(deploy, "probe", return_value=b"not-json"):
            with self.assertRaises(ValueError):
                deploy.probe_billing_disabled()

    def test_retains_transport_failure(self):
        with patch.object(deploy, "probe", side_effect=RuntimeError("Probe failed")):
            with self.assertRaisesRegex(RuntimeError, "Probe failed"):
                deploy.probe_billing_disabled()


class ActiveGameCountTests(unittest.TestCase):
    native_startup = ("Game cleanup task started\n"
                      "Tadazz protected native host listening on loopback\n")

    def container(self, log_config=None):
        return {"State": {"StartedAt": "2026-11-26T23:18:12Z"},
                "HostConfig": {"LogConfig": log_config if log_config is not None
                               else {"Type": "json-file", "Config": {}}}}

    def count(self, logs, log_config=None):
        with patch.object(deploy, "command", return_value=logs) as command:
            result = deploy.last_game_count(self.container(log_config))
        command.assert_called_once_with("docker", "logs", "--since",
                                        "2026-11-26T23:18:12Z", "tadazz")
        return result

    def test_native_empty_start_requires_registry_and_listener(self):
        self.assertEqual(self.count(self.native_startup), 0)

    def test_last_live_registry_count_takes_priority_over_startup(self):
        self.assertEqual(self.count(self.native_startup +
                         "Game synthetic added. Total games: 2\n"), 2)

    def test_cleanup_count_is_the_current_count(self):
        logs = (self.native_startup +
                "Game synthetic added. Total games: 2\n" +
                "Removed 2 empty game(s). Remaining games: 0\n")
        self.assertEqual(self.count(logs), 0)

    def test_legacy_empty_startup_remains_supported(self):
        for logs in ["Socket server is running\n", "Server is running\n"]:
            with self.subTest(logs=logs):
                self.assertEqual(self.count(logs), 0)

    def test_incomplete_or_unknown_native_logs_fail_closed(self):
        for logs in ["", "Game cleanup task started\n",
                     "Tadazz protected native host listening on loopback\n",
                     "Tadazz production startup failed\n",
                     "Other service started\n"]:
            with self.subTest(logs=logs):
                with self.assertRaisesRegex(RuntimeError, "Could not establish"):
                    self.count(logs)

    def test_embedded_native_messages_do_not_establish_startup(self):
        with self.assertRaisesRegex(RuntimeError, "Could not establish"):
            self.count("untrusted: Game cleanup task started\n"
                       "untrusted: Tadazz protected native host listening on loopback\n")

    def test_log_transport_failure_is_not_empty_registry(self):
        with patch.object(deploy, "command", side_effect=RuntimeError("logs unavailable")):
            with self.assertRaisesRegex(RuntimeError, "logs unavailable"):
                deploy.last_game_count(self.container())

    def test_native_empty_start_rejects_rotated_or_unknown_log_drivers(self):
        for config in [{"Type": "json-file", "Config": {"max-size": "10m"}},
                       {"Type": "local", "Config": {}}, {}]:
            with self.subTest(config=config):
                with self.assertRaisesRegex(RuntimeError, "Could not establish"):
                    self.count(self.native_startup, config)


if __name__ == "__main__":
    unittest.main()
