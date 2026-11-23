import importlib.util
import copy
import json
import os
import pathlib
import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from unittest.mock import patch

path = pathlib.Path(__file__).with_name("maintenance-external-media.py")
spec = importlib.util.spec_from_file_location("repair", path)
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class MaintenanceGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def owner_fixture(self):
        owner = "11111111-1111-4111-a111-111111111111"
        config = self.root / "backup"
        folder = config / "tenants" / owner / "quizz"
        folder.mkdir(parents=True)
        base = {"id": repair.QUIZ_ID, "questions": [
            {}, {"media": {"type": "image", "url": repair.SOURCE_URL}},
            {"media": {"type": "image", "url": repair.SOURCE_URL}}, {},
        ]}
        file = folder / "example.json"
        file.write_text(json.dumps(base))
        return config, owner, file, base

    @contextmanager
    def root_owned_scope(self, directory):
        # The real target is root-owned. Model only that metadata when these
        # pure guards are tested by a non-root local test executor.
        original = pathlib.Path.stat
        def observed(file, *args, **kwargs):
            result = original(file, *args, **kwargs)
            if file == directory:
                fields = list(result)
                fields[4] = 0
                return os.stat_result(fields)
            return result
        with patch.object(pathlib.Path, "stat", observed):
            yield

    def test_inventory_rejects_file_and_directory_symlinks(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "secret").write_text("synthetic")
        scope = self.root / "scope"
        scope.mkdir()
        (scope / "link").symlink_to(outside / "secret")
        with self.assertRaises(repair.GateError):
            repair.inventory(scope)
        (scope / "link").unlink()
        (scope / "link").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(repair.GateError):
            repair.inventory(scope)

    def test_backup_clone_is_exact_and_source_drift_is_rejected(self):
        config, owner, file, base = self.owner_fixture()
        expected = repair.inventory(config)
        destination = self.root / "clone"
        repair.clone_backup(config, destination, expected)
        self.assertEqual(repair.inventory(destination), expected)
        file.write_text(json.dumps({**base, "changed": True}))
        with self.assertRaisesRegex(repair.GateError, "BACKUP_DOES_NOT_MATCH_PLAN"):
            repair.clone_backup(config, self.root / "other", expected)
        self.assertFalse((self.root / "other").exists())

    def test_verified_owner_copy_is_read_only_and_rejects_duplicate_ids(self):
        config = self.root / "config"
        config.mkdir()
        file = config / "tadazz-accounts.sqlite"
        db = sqlite3.connect(file)
        db.execute("CREATE TABLE accounts(id TEXT, verified_at INTEGER, disabled INTEGER)")
        owner = "11111111-1111-4111-a111-111111111111"
        db.execute("INSERT INTO accounts VALUES(?,1,0)", (owner,))
        db.commit()
        db.close()
        before = repair.inventory(config)
        work = self.root / "work"
        work.mkdir()
        accounts, digest = repair.canonical_accounts(config, work, before)
        self.assertEqual(accounts, {owner: True})
        self.assertEqual(repair.inventory(config), before)
        self.assertEqual(len(digest), 64)
        db = sqlite3.connect(file)
        db.execute("INSERT INTO accounts VALUES(?,2,0)", (owner,))
        db.commit()
        db.close()
        with self.assertRaisesRegex(repair.GateError, "DUPLICATE_CANONICAL_OWNER"):
            repair.canonical_accounts(config, work, repair.inventory(config))

    def test_disabled_owner_is_ineligible_and_malformed_state_is_rejected(self):
        config = self.root / "config"
        config.mkdir()
        work = self.root / "work"
        work.mkdir()
        file = config / "tadazz-accounts.sqlite"
        db = sqlite3.connect(file)
        owner = "11111111-1111-4111-a111-111111111111"
        try:
            db.execute("CREATE TABLE accounts(id TEXT, verified_at INTEGER, disabled INTEGER)")
            db.execute("INSERT INTO accounts VALUES(?,1,1)", (owner,))
            db.commit()
            accounts, _ = repair.canonical_accounts(config, work, repair.inventory(config))
            self.assertEqual(accounts, {owner: False})
            with self.assertRaisesRegex(repair.GateError, "VERIFIED_OWNER_NOT_UNIQUE"):
                repair.target_bindings(config, accounts, [repair.sha(owner.encode())], "a" * 64)
            db.execute("UPDATE accounts SET disabled=2")
            db.commit()
            with self.assertRaisesRegex(repair.GateError, "CANONICAL_OWNER_STATE_INVALID"):
                repair.canonical_accounts(config, work, repair.inventory(config))
        finally:
            db.close()

    def test_target_requires_verified_owner_exact_bytes_and_unique_binding(self):
        config, owner, file, base = self.owner_fixture()
        owner_hash = repair.sha(owner.encode())
        digest = repair.sha(file.read_bytes())
        with self.root_owned_scope(config / "tenants" / owner):
            target = repair.target_bindings(config, {owner: True}, [owner_hash], digest)
            self.assertEqual(target[0]["questionIndices"], [1, 2])
            with self.assertRaisesRegex(repair.GateError, "VERIFIED_OWNER_NOT_UNIQUE"):
                repair.target_bindings(config, {owner: False}, [owner_hash], digest)
            with self.assertRaisesRegex(repair.GateError, "EXPECTED_BASE_CHANGED"):
                repair.target_bindings(config, {owner: True}, [owner_hash], "0" * 64)
            (file.parent / "duplicate.json").write_text(json.dumps(base))
            with self.assertRaisesRegex(repair.GateError, "QUIZ_PHYSICAL_BINDING_NOT_UNIQUE"):
                repair.target_bindings(config, {owner: True}, [owner_hash], digest)

    def test_unrelated_missing_ids_and_pending_journals_block_before_mutation(self):
        config, owner, file, _ = self.owner_fixture()
        owner_hash, digest = repair.sha(owner.encode()), repair.sha(file.read_bytes())
        other = file.parent / "unrelated.json"
        other.write_text("{}")
        with self.root_owned_scope(config / "tenants" / owner):
            with self.assertRaisesRegex(repair.GateError, "UNRELATED_LEGACY_ID_MIGRATION_RISK"):
                repair.target_bindings(config, {owner: True}, [owner_hash], digest)
            other.unlink()
            journal = config / "tenants" / owner / "extensions/quizzes/.journal/staged.journal.json"
            journal.parent.mkdir(parents=True)
            journal.write_text("{}")
            with self.assertRaisesRegex(repair.GateError, "UNRESOLVED_OWNER_JOURNAL"):
                repair.target_bindings(config, {owner: True}, [owner_hash], digest)

    def test_running_production_is_allowed_for_plan_and_rejected_for_apply(self):
        config = self.root / "config"
        config.mkdir()
        container, image = "a" * 64, "sha256:" + "b" * 64
        facts = {"Id": container, "Name": "/tadazz", "Image": image,
            "State": {"Running": True, "StartedAt": "2026-11-21T00:00:00Z"},
            "Config": {"Env": ["TADAZZ_ACCOUNTS_ENABLED=true", "CONFIG_PATH=/app/config"], "Labels": {}, "User": ""},
            "Mounts": [{"Type": "bind", "Destination": "/app/config", "Source": str(config), "RW": True}],
            "RestartCount": 0}
        with patch.object(repair, "CONFIG_ROOT", config), patch.object(repair, "inspect", return_value=facts):
            self.assertEqual(repair.production_identity(container, image, stopped=False)["container"], container)
            with self.assertRaisesRegex(repair.GateError, "PRODUCTION_MUST_BE_STOPPED"):
                repair.production_identity(container, image)
            facts["State"]["Running"] = False
            self.assertEqual(repair.production_identity(container, image)["container"], container)
            facts["Config"]["Env"][1] = "CONFIG_PATH=/different-root"
            with self.assertRaisesRegex(repair.GateError, "VERIFIED_ACCOUNT_SCOPE_REQUIRED"):
                repair.production_identity(container, image)
            facts["Config"]["Env"] = ["TADAZZ_ACCOUNTS_ENABLED=true", "CONFIG_PATH=/app/config", "CONFIG_PATH=/different-root"]
            with self.assertRaisesRegex(repair.GateError, "PRODUCTION_ENVIRONMENT_DUPLICATE"):
                repair.production_identity(container, image)

    def test_maintenance_source_must_match_the_deployed_revision(self):
        revision = "a" * 40
        repair.deployed_source_binding({"revision": revision}, {"revision": revision})
        for actual in (None, "b" * 40, revision[:7]):
            with self.subTest(actual=actual):
                with self.assertRaisesRegex(repair.GateError, "REPAIR_SOURCE_DIFFERS_FROM_DEPLOYED_REVISION"):
                    repair.deployed_source_binding({"revision": revision}, {"revision": actual})

    def release_documents(self):
        revision, image, container = "a" * 40, "sha256:" + "b" * 64, "c" * 64
        run, stage_pin, backend = "tadazz-codex-" + revision[:12] + "-01234567", "d" * 64, "e" * 64
        source = {"root": "/synthetic/" + run + "/source", "revision": revision, "files": {"source.ts": "f" * 64}}
        production = {"container": container, "revision": revision, "image": image}
        stage = {"format": "tadazz-mcp-stage", "version": 2, "sourceSha": revision, "sourceRun": run,
                 "imageId": image, "backendSha256": backend, "artifacts": {"socket/index.cjs": backend},
                 "artifactBytes": {"socket/index.cjs": 100}}
        staged = {"ok": True, "sourceSha": revision, "imageId": image, "stageManifestSha256": stage_pin,
                  "syntheticSmokePassed": True, "runningContainersUnchanged": True,
                  "productionTouched": False, "customerMountUsed": False, "backendSha256": backend}
        host = {"sha": revision, "run": run, "suite": "native-launch", "allHashesVerifiedBeforeAfter": True,
                "hashesBefore": copy.deepcopy(source["files"]), "hashesAfter": copy.deepcopy(source["files"]),
                "productionChanged": False, "customerMountAccessed": False,
                "checks": [{"label": label, "exit": 0} for label in ("native-launch-build", "native-site-build")]}
        deployed = {"version": 1, "success": True, "phase": "verified", "revision": revision,
                    "image": image, "replacementContainer": container, "mountsUnchanged": True,
                    "hostConfigurationUnchanged": True, "otherContainersUnchanged": True,
                    "customerContentPrinted": False, "dataRestorePerformed": False}
        return source, production, stage, staged, host, deployed, stage_pin

    def test_successful_release_proof_binds_source_stage_backend_and_deployed_container(self):
        self.assertEqual(repair.validate_release_documents(*self.release_documents()), ("e" * 64, 100))

    def test_stale_failed_or_different_release_proofs_are_rejected(self):
        cases = (
            (2, "imageId", "sha256:" + "0" * 64, "RELEASE_STAGE_IDENTITY_CHANGED"),
            (2, "sourceRun", "tadazz-codex-" + "0" * 12 + "-01234567", "RELEASE_SOURCE_RUN_CHANGED"),
            (3, "ok", False, "SUCCESSFUL_STAGE_PROOF_REQUIRED"),
            (3, "stageManifestSha256", "0" * 64, "SUCCESSFUL_STAGE_PROOF_REQUIRED"),
            (4, "hashesAfter", {"source.ts": "0" * 64}, "QUALIFIED_SOURCE_PROOF_CHANGED"),
            (4, "checks", [{"label": "native-launch-build", "exit": 1}], "QUALIFIED_SOURCE_BUILD_NOT_PASSED"),
            (5, "success", False, "SUCCESSFUL_EXACT_DEPLOYMENT_REQUIRED"),
            (5, "replacementContainer", "0" * 64, "SUCCESSFUL_EXACT_DEPLOYMENT_REQUIRED"),
            (5, "rolledBack", True, "SUCCESSFUL_EXACT_DEPLOYMENT_REQUIRED"),
            (3, "backendSha256", "0" * 64, "QUALIFIED_BACKEND_PIN_CHANGED"),
        )
        for index, field, replacement, code in cases:
            with self.subTest(field=field, code=code):
                documents = self.release_documents()
                documents[index][field] = replacement
                with self.assertRaisesRegex(repair.GateError, code):
                    repair.validate_release_documents(*documents)

    def test_unrelated_rw_parent_and_subtree_mounts_are_rejected(self):
        root = pathlib.Path("/synthetic/config")
        for source in ("/synthetic", "/synthetic/config", "/synthetic/config/media"):
            calls = [b"abc\n", json.dumps([{"Id": "abc", "Mounts": [{"Type": "bind", "Source": source, "RW": True}]}]).encode()]
            with patch.object(repair, "docker", side_effect=calls):
                with self.assertRaisesRegex(repair.GateError, "OTHER_RUNNING_CONFIG_WRITER"):
                    repair.no_other_config_writer(root)

    def output_fixture(self):
        owner = "11111111-1111-4111-a111-111111111111"
        target = {"ownerId": owner, "ownerSha256": repair.sha(owner.encode()),
                  "baseRelative": f"tenants/{owner}/quizz/example.json",
                  "sidecarRelative": f"tenants/{owner}/extensions/quizzes/{repair.QUIZ_ID}.json"}
        asset = f"tenants/{owner}/media/synthetic-image.png"
        record = {"kind": "file", "mode": 0o644, "uid": 0, "gid": 0, "bytes": 2, "sha256": "a" * 64}
        before = {"entries": {target["baseRelative"]: copy.deepcopy(record), "unrelated.json": copy.deepcopy(record)}}
        after = copy.deepcopy(before)
        after["entries"][target["baseRelative"]]["sha256"] = "b" * 64
        after["entries"][target["sidecarRelative"]] = {**record, "sha256": "c" * 64}
        after["entries"][asset] = {**record, "bytes": repair.PNG_SIZE, "sha256": repair.PNG_SHA}
        native = {"passed": True, "saves": [{"ownerSha256": target["ownerSha256"], "committed": True,
            "nativePreviewVerified": True, "baseSha256": "b" * 64, "sidecarSha256": "c" * 64,
            "uploadedAsset": {"relative": asset, "sha256": repair.PNG_SHA, "bytes": repair.PNG_SIZE}}]}
        return {"targets": [target]}, before, after, native

    def test_only_reviewed_base_sidecar_and_new_owner_asset_are_accepted(self):
        plan, before, after, native = self.output_fixture()
        changes = repair.allowed_changes(plan, before, after, native)
        self.assertEqual(len(changes), 3)
        self.assertTrue(all(set(item) == {"pathSha256", "kind"} for item in changes))

    def test_unrelated_edits_deletes_ownership_changes_and_upload_escape_fail(self):
        plan, before, after, native = self.output_fixture()
        invalid = copy.deepcopy(after)
        invalid["entries"]["unrelated.json"]["sha256"] = "d" * 64
        with self.assertRaisesRegex(repair.GateError, "UNRELATED_CONFIG_FILE_CHANGED"):
            repair.allowed_changes(plan, before, invalid, native)
        invalid = copy.deepcopy(after)
        del invalid["entries"]["unrelated.json"]
        with self.assertRaisesRegex(repair.GateError, "UNEXPECTED_FILE_REMOVAL"):
            repair.allowed_changes(plan, before, invalid, native)
        invalid = copy.deepcopy(after)
        invalid["entries"][plan["targets"][0]["baseRelative"]]["uid"] = 1000
        with self.assertRaisesRegex(repair.GateError, "EXISTING_FILE_OWNERSHIP_CHANGED"):
            repair.allowed_changes(plan, before, invalid, native)
        invalid_native = copy.deepcopy(native)
        invalid_native["saves"][0]["uploadedAsset"]["relative"] = "tenants/another-owner/media/synthetic-image.png"
        with self.assertRaisesRegex(repair.GateError, "UPLOADED_ASSET_SCOPE_CHANGED"):
            repair.allowed_changes(plan, before, after, invalid_native)
        invalid_before = copy.deepcopy(before)
        asset = native["saves"][0]["uploadedAsset"]["relative"]
        invalid_before["entries"][asset] = after["entries"][asset]
        with self.assertRaisesRegex(repair.GateError, "UPLOAD_OVERWROTE_EXISTING_MEDIA"):
            repair.allowed_changes(plan, invalid_before, after, native)


if __name__ == "__main__":
    unittest.main(verbosity=2)
