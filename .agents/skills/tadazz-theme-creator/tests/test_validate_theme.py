import importlib.util
from pathlib import Path
import subprocess
import unittest

root = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("validator", root / ".agents/skills/tadazz-theme-creator/scripts/validate_theme.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class ValidatorTests(unittest.TestCase):
    def test_actual_repository_classic_validates_without_installing(self):
        result = subprocess.run(validator.command(root / "extensions/src/core/show-themes/classic.manifest.json", root / "packages/web/public", True), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("VALIDATED_NOT_INSTALLED", result.stdout)

    def test_customer_cannot_claim_existing_repository_rights(self):
        result = subprocess.run(validator.command(root / "extensions/src/core/show-themes/classic.manifest.json", root / "packages/web/public"), capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("rights", result.stderr)


if __name__ == "__main__":
    unittest.main()
