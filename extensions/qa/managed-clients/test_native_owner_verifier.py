"""Linux-only controls for the current native BMS provisioning verifier.

These tests use synthetic content and an isolated SQLite WAL database. They do
not invoke Docker, the owner CLI, a customer login, or a production data path.
"""

from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import uuid


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "current_native_bms_verifier", HERE / "verify-native-current-bms.py"
)
assert SPEC is not None and SPEC.loader is not None
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


def canonical(value):
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def extras_fixture():
    ids = [str(uuid.UUID(int=index + 1)) for index in range(23)]
    timeline = [{"id": "opening", "kind": "opening", "sceneId": "opening"}]
    for count, question_id in enumerate(ids, start=1):
        timeline.append({"id": "card-" + str(count), "kind": "question", "questionId": question_id})
        if count in (8, 16, 23):
            timeline.append({"id": "board-" + str(count), "kind": "leaderboard"})
    timeline.append({"id": "closing", "kind": "closing", "sceneId": "closing"})
    return {
        "schemaVersion": 2,
        "quizId": VERIFIER.GAME,
        "defaults": {
            "presentationLocale": "en",
            "showTheme": {"id": "tadazz-classic", "version": "1.0.0"},
        },
        "questionIds": ids,
        "timeline": timeline,
        "scenes": {"opening": {"kind": "opening"}, "closing": {"kind": "closing"}},
        "audio": {},
    }


class ProjectionControls(unittest.TestCase):
    def test_normalizes_only_the_original_missing_look_without_mutating_input(self):
        cases = (
            (VERIFIER.GAME, None, "guess-off"),
            (VERIFIER.GAME, "theme", "theme"),
            (VERIFIER.GAME, "guess-off", "guess-off"),
            (str(uuid.UUID(int=500)), None, None),
            (None, None, None),
        )
        for quiz_id, explicit_look, expected in cases:
            with self.subTest(quiz_id=quiz_id, explicit_look=explicit_look):
                extras = extras_fixture()
                if quiz_id is None:
                    del extras["quizId"]
                else:
                    extras["quizId"] = quiz_id
                if explicit_look is not None:
                    extras["defaults"]["stageLook"] = explicit_look
                before = deepcopy(extras)
                projection = VERIFIER.manager_projection(extras)
                self.assertEqual(projection["defaults"].get("stageLook"), expected)
                self.assertEqual(extras, before)
                self.assertEqual(projection["timeline"], before["timeline"])
                self.assertEqual(projection["scenes"], before["scenes"])
                self.assertEqual(projection["audio"], before["audio"])


class RawSnapshotControls(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="tadazz-native-owner-control-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        package_dir = self.root / "extensions" / "packages"
        package_dir.mkdir(parents=True)
        self.database = sqlite3.connect(package_dir / "packages.sqlite")
        self.addCleanup(self.database.close)
        self.database.execute("PRAGMA journal_mode=WAL")
        self.database.execute(
            "CREATE TABLE packages (upload TEXT PRIMARY KEY, tenant TEXT, package_id TEXT, "
            "version TEXT, source TEXT, build TEXT, phase TEXT, revision INTEGER, games TEXT)"
        )
        self.owner = str(uuid.UUID(int=1000))
        self.database.execute(
            "INSERT INTO packages VALUES (?,?,?,?,?,?,?,?,?)",
            (
                VERIFIER.UPLOAD, self.owner, VERIFIER.PACKAGE, "1.0.0",
                VERIFIER.SOURCE, VERIFIER.BUILD, "installed", 2, json.dumps([VERIFIER.GAME]),
            ),
        )
        self.database.commit()
        owner_root = self.root / "tenants" / self.owner
        self.base_path = owner_root / "quizz" / (VERIFIER.GAME + ".json")
        self.extras_path = owner_root / "extensions" / "quizzes" / (VERIFIER.GAME + ".json")
        self.base_path.parent.mkdir(parents=True)
        self.extras_path.parent.mkdir(parents=True)
        self.base = {
            "id": VERIFIER.GAME,
            "questions": [
                {"question": "Synthetic question " + str(index), "answers": ["A", "B"], "solutions": [0]}
                for index in range(23)
            ],
        }
        self.extras = extras_fixture()
        self.base_raw = canonical(self.base) + b"\n"
        self.extras_raw = canonical(self.extras) + b"\n"
        self.base_path.write_bytes(self.base_raw)
        self.extras_path.write_bytes(self.extras_raw)
        definition = {
            "id": "tadazz-classic", "version": "1.0.0",
            "kind": "code-backed", "rendererId": "tadazz-classic-stage",
        }
        # Independent expected projection: raw content is unchanged; the current
        # canonical runtime adds exactly the original show's missing appearance.
        self.expected_projection = {
            "defaults": {**self.extras["defaults"], "stageLook": "guess-off"},
            "timeline": self.extras["timeline"],
            "scenes": self.extras["scenes"],
            "audio": self.extras["audio"],
        }
        pin = "1" * 64
        self.current = {
            "schemaVersion": 1,
            "kind": "native-builtin",
            "gameId": VERIFIER.GAME,
            "themeId": "tadazz-classic",
            "themeVersion": "1.0.0",
            "rendererId": "tadazz-classic-stage",
            "questionDocumentSha256": VERIFIER.QUESTION_DOCUMENT_SHA,
            "acceptedNativeQuestionsSha256": digest(canonical(self.base["questions"])),
            "nativeBaseSha256": digest(self.base_raw),
            "nativeExtrasSha256": digest(self.extras_raw),
            "nativeQuestionCount": 23,
            "nativeCardCount": 28,
            "leaderboardAfterQuestions": [8, 16, 23],
            "presentationLocale": "en",
            "compositionMode": "none",
            "contentAcceptanceReceiptSha256": pin,
            "builtinManifestPath": VERIFIER.MANIFEST_PATH,
            "builtinManifestSha256": pin,
            "builtinDefinitionCanonicalSha256": digest(canonical(definition)),
            "builtinDefinition": definition,
            "builtinDefinitionQualificationReceiptSha256": pin,
            "sourceRevision": "f" * 40,
            "sourceInputManifestSha256": pin,
            "qualifiedWebReceiptSha256": pin,
            "webArtifactManifestSha256": pin,
            "acceptedManagerProjectionSha256": digest(canonical(self.expected_projection)),
            "nativeAssetSelectionReceiptSha256": pin,
            "nativeEntryHtml": {
                "artifactPath": "packages/web/dist/index.html", "sha256": pin,
                "bytes": 1, "mime": "text/html",
            },
            "nativeMedia": [{
                "url": "/sounds/synthetic-control.wav",
                "artifactPath": "packages/web/dist/sounds/synthetic-control.wav",
                "sha256": pin, "bytes": 1, "mime": "audio/wav",
            }],
        }

    def read_verified(self):
        return VERIFIER.read_verified(
            str(self.root), VERIFIER.GAME, self.current, digest(canonical(self.current))
        )

    def test_exact_legacy_bytes_qualify_with_current_canonical_projection(self):
        owner, _, projection, _, proof = self.read_verified()
        self.assertEqual(owner, self.owner)
        self.assertEqual(projection, self.expected_projection)
        self.assertTrue(proof["ok"])
        self.assertTrue(proof["readOnly"])
        self.assertEqual(proof["winnerScreensAfterQuestion"], [8, 16, 23])
        self.assertEqual(self.base_path.read_bytes(), self.base_raw)
        self.assertEqual(self.extras_path.read_bytes(), self.extras_raw)

    def test_even_semantically_equal_raw_base_drift_is_rejected(self):
        self.base_path.write_bytes(self.base_raw + b"\n")
        with self.assertRaisesRegex(VERIFIER.VerificationFailure, "^CURRENT_NATIVE_GAME_BYTES_CHANGED$"):
            self.read_verified()

    def test_materializing_the_implicit_look_on_disk_is_still_raw_drift(self):
        changed = deepcopy(self.extras)
        changed["defaults"]["stageLook"] = "guess-off"
        self.extras_path.write_bytes(canonical(changed) + b"\n")
        with self.assertRaisesRegex(VERIFIER.VerificationFailure, "^CURRENT_NATIVE_GAME_BYTES_CHANGED$"):
            self.read_verified()

    def test_explicit_override_cannot_be_hidden_by_projection_normalization(self):
        changed = deepcopy(self.extras)
        changed["defaults"]["stageLook"] = "theme"
        changed_raw = canonical(changed) + b"\n"
        self.extras_path.write_bytes(changed_raw)
        self.current["nativeExtrasSha256"] = digest(changed_raw)
        with self.assertRaisesRegex(
            VERIFIER.VerificationFailure, "^ACCEPTED_NATIVE_MANAGER_CONFIGURATION_CHANGED$"
        ):
            self.read_verified()


if __name__ == "__main__":
    unittest.main()
