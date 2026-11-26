"""Synthetic checks for the opt-in pricing-only deployment environment."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

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


if __name__ == "__main__":
    unittest.main()
