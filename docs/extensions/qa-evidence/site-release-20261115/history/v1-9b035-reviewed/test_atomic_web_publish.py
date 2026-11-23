"""Bounded static/manifest tests; they do not invoke the publisher or Docker.

Independent QA must additionally execute the isolated container trial described
in ATOMIC_WEB_QA.md. Run this file only from a synthetic QA copy with python -B.
"""

import ast
import importlib.util
import json
from pathlib import Path
import unittest

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


if __name__ == "__main__":
    unittest.main()
