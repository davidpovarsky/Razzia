"""Read-only verification of the owner's updated original native BMS game.

The historical installed upload identifies only the original owner and game.
Current questions, sidecar, builtin theme and public artifacts require a separate
root-reviewed evidence object. No package is installed, no game is changed, and
this source/configuration proof does not claim browser rendering or playback.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import sys
import time
import uuid


GAME = "6369bf77-c3d4-40ee-8a67-0476434b562f"
UPLOAD = "9d9e3f4f-2995-4adb-8763-4bd7595b8b4c"
SOURCE = "041e64a214f6121b3492b736956884495147be061988ed9285b3f179b89204b0"
BUILD = "25f6b9b8bd5bd79ddcd0510471113aeb5ef67cc410f53fd05da52ffaed20245d"
PACKAGE = "bms-memory-files-complete"
THEME = "tadazz-classic"
THEME_VERSION = "1.0.0"
RENDERER = "tadazz-classic-stage"
QUESTION_DOCUMENT_SHA = "8a1fd41862e524a5c3359dd38489d2ca6b1b85f888080f08caa686ea83059667"
MANIFEST_PATH = "extensions/src/core/show-themes/classic.manifest.json"
HEX = re.compile(r"[a-f0-9]{64}\Z")
REVISION = re.compile(r"[a-f0-9]{40}\Z")
OLD_AUDIO_DIGESTS = (
    "7dc2f5f14b8d37310d54381cd54c8fdc9a6fec7729ef70f3eff2ab879ae3c7b8",
    "d27eb52bd8a4a38016ce40d73ebde502cc6ade64fb01b283338f0f6e219476d5",
    "e433bb921f9416ef05a38bb122aef69c8e779ac4d3c92b8db72fa45adf01058b",
    "034f498d58496121be9f85419d4620dd5cc0c6058e5249d43abaf1ba5982da6a",
)
INTRO_WAV = "/tadazz-show/music/platform/tadazz-production-intro-20261106.wav"
INTRO_WAV_BYTES = ("65aca17e6c1b0ff067aeda6251c900e3a4eff3033c018598002f2a6432b05c07", 2116310)
# These exact product-opening URLs are declared by TadazzOpening.tsx.
# Other JSON/video/API paths remain outside this public artifact contract.
OPENING_PUBLIC_TYPES = {
    "/tadazz-show/opening/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4": "video/mp4",
    "/tadazz-show/opening/TADAZZ-Opening-4-5s.json": "application/json",
}
MEDIA_MIMES = {
    ".mp3": {"audio/mpeg"}, ".wav": {"audio/wav", "audio/x-wav"},
    ".ogg": {"audio/ogg"}, ".m4a": {"audio/mp4"},
    ".png": {"image/png"}, ".jpg": {"image/jpeg"}, ".jpeg": {"image/jpeg"},
    ".webp": {"image/webp"}, ".svg": {"image/svg+xml"}, ".avif": {"image/avif"},
}


class VerificationFailure(Exception):
    pass


def require(condition, code):
    if not condition:
        raise VerificationFailure(code)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def uuid_value(value):
    try:
        return isinstance(value, str) and str(uuid.UUID(value)) == value
    except (ValueError, AttributeError):
        return False


def own_path(root, *parts):
    result = root
    for part in parts:
        require(isinstance(part, str) and 0 < len(part) <= 180 and part not in {".", ".."}
                and not any(c in part for c in ["/", "\\", "\x00"]), "INVALID_OWNED_PATH_COMPONENT")
        result = result / part
        require(not stat.S_ISLNK(result.lstat().st_mode), "OWNED_PATH_IS_SYMLINK")
    return result


def read_bytes(path, budget):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                and 0 < info.st_size <= budget, "OWNED_FILE_SIZE_OR_TYPE")
        data = stream.read(budget + 1)
        require(len(data) == info.st_size, "OWNED_FILE_CHANGED_DURING_READ")
        return data


def readonly_packages(path):
    # Reuse the qualified read-only WAL admission: existing live sidecars only,
    # no immutable reads, checkpoints, copies, schema writes or new sidecars.
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                and 100 <= info.st_size <= 64 * 1024**2, "UNSAFE_DATABASE_FILE")
        header = stream.read(100)
        require(header[:16] == b"SQLite format 3\0" and header[18:20] == b"\x02\x02",
                "EXPECTED_PACKAGE_WAL_DATABASE")
    require(not os.path.lexists(str(path) + "-journal"), "DATABASE_BUSY_OR_UNEXPECTED_JOURNAL")
    for suffix in ("-wal", "-shm"):
        sidecar = Path(str(path) + suffix)
        require(os.path.lexists(sidecar), "EXISTING_WAL_SIDECARS_REQUIRED")
        info = sidecar.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                and info.st_size <= 64 * 1024**2, "UNSAFE_WAL_SIDECAR")
    connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=1)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only=ON")
        connection.execute("PRAGMA trusted_schema=OFF")
        require(connection.execute("PRAGMA journal_mode").fetchone()[0] == "wal",
                "DATABASE_JOURNAL_MODE_CHANGED")
        deadline = time.monotonic() + 3
        connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
        connection.execute("BEGIN")
        return connection
    except BaseException:
        connection.close()
        raise


def validate_artifact(asset, entry=False):
    keys = {"artifactPath", "sha256", "bytes", "mime"} | (set() if entry else {"url"})
    require(isinstance(asset, dict) and set(asset) == keys, "NATIVE_ARTIFACT_PIN_SCHEMA")
    require(isinstance(asset["sha256"], str) and HEX.fullmatch(asset["sha256"])
            and type(asset["bytes"]) is int and 0 < asset["bytes"] <= (2 if entry else 32) * 1024**2,
            "NATIVE_ARTIFACT_BYTES_PIN")
    if entry:
        require(asset["artifactPath"] == "packages/web/dist/index.html" and asset["mime"] == "text/html",
                "NATIVE_ENTRY_ARTIFACT_SCOPE")
        return
    url = asset["url"]
    require(isinstance(url, str) and len(url) <= 300
            and re.fullmatch(r"/(?:sounds|tadazz-show|assets)/[A-Za-z0-9_./-]+", url)
            and all(part not in {"", ".", ".."} for part in url.split("/")[1:])
            and asset["artifactPath"] == "packages/web/dist" + url, "NATIVE_PUBLIC_MEDIA_SCOPE")
    accepted_mimes = MEDIA_MIMES.get(Path(url).suffix.lower(), set())
    exact_intro_binary = (url == INTRO_WAV and asset["mime"] == "application/octet-stream"
                          and (asset["sha256"], asset["bytes"]) == INTRO_WAV_BYTES)
    exact_product_opening = url in OPENING_PUBLIC_TYPES and OPENING_PUBLIC_TYPES[url] == asset["mime"]
    require(asset["mime"] in accepted_mimes or exact_intro_binary or exact_product_opening,
            "NATIVE_PUBLIC_MEDIA_MIME")


def validate_current_evidence(current, pin):
    required = {
        "schemaVersion", "kind", "gameId", "themeId", "themeVersion", "rendererId",
        "questionDocumentSha256", "acceptedNativeQuestionsSha256", "nativeBaseSha256",
        "nativeExtrasSha256", "nativeQuestionCount", "nativeCardCount", "leaderboardAfterQuestions",
        "presentationLocale", "compositionMode", "contentAcceptanceReceiptSha256",
        "builtinManifestPath", "builtinManifestSha256", "builtinDefinitionCanonicalSha256",
        "builtinDefinition", "builtinDefinitionQualificationReceiptSha256", "sourceRevision",
        "sourceInputManifestSha256", "qualifiedWebReceiptSha256", "webArtifactManifestSha256",
        "acceptedManagerProjectionSha256", "nativeAssetSelectionReceiptSha256", "nativeEntryHtml", "nativeMedia",
    }
    require(isinstance(current, dict) and set(current) == required and current["schemaVersion"] == 1,
            "CURRENT_NATIVE_EVIDENCE_REQUIRED")
    require(isinstance(pin, str) and HEX.fullmatch(pin) and digest(canonical(current)) == pin,
            "CURRENT_NATIVE_SNAPSHOT_PIN")
    require(current["kind"] == "native-builtin" and current["gameId"] == GAME
            and current["themeId"] == THEME and current["themeVersion"] == THEME_VERSION
            and current["rendererId"] == RENDERER, "CURRENT_NATIVE_IDENTITY")
    require(current["questionDocumentSha256"] == QUESTION_DOCUMENT_SHA
            and current["nativeQuestionCount"] == 23 and type(current["nativeCardCount"]) is int
            and 26 <= current["nativeCardCount"] <= 100 and current["leaderboardAfterQuestions"] == [8, 16, 23]
            and current["presentationLocale"] == "en" and current["compositionMode"] == "none",
            "CURRENT_ACCEPTED_CONTENT_SCOPE")
    for key in (
        "acceptedNativeQuestionsSha256", "nativeBaseSha256", "nativeExtrasSha256",
        "contentAcceptanceReceiptSha256", "builtinManifestSha256", "builtinDefinitionCanonicalSha256",
        "builtinDefinitionQualificationReceiptSha256", "sourceInputManifestSha256",
        "qualifiedWebReceiptSha256", "webArtifactManifestSha256", "acceptedManagerProjectionSha256",
        "nativeAssetSelectionReceiptSha256",
    ):
        require(isinstance(current[key], str) and HEX.fullmatch(current[key]), "CURRENT_NATIVE_DIGEST_REQUIRED")
    require(isinstance(current["sourceRevision"], str) and REVISION.fullmatch(current["sourceRevision"])
            and current["builtinManifestPath"] == MANIFEST_PATH, "BUILTIN_SOURCE_PROVENANCE")
    definition = current["builtinDefinition"]
    require(isinstance(definition, dict) and len(canonical(definition)) <= 128 * 1024
            and digest(canonical(definition)) == current["builtinDefinitionCanonicalSha256"],
            "BUILTIN_DEFINITION_PIN")
    require(definition.get("id") == THEME and definition.get("version") == THEME_VERSION
            and definition.get("kind") == "code-backed" and definition.get("rendererId") == RENDERER
            and "runtime" not in definition, "BUILTIN_DEFINITION_IDENTITY")
    validate_artifact(current["nativeEntryHtml"], entry=True)
    media = current["nativeMedia"]
    require(isinstance(media, list) and 1 <= len(media) <= 96, "NATIVE_MEDIA_PIN_COUNT")
    seen = set()
    for asset in media:
        validate_artifact(asset)
        require(asset["url"] not in seen, "NATIVE_MEDIA_DUPLICATE")
        seen.add(asset["url"])
    require(sum(asset["bytes"] for asset in media) <= 128 * 1024**2, "NATIVE_MEDIA_TOTAL_BUDGET")
    return current


def manager_projection(extras):
    # Exact native ExtensionGameSession manager payload contract. Full sidecar
    # bytes also bind question overrides/history not repeated in the lobby frame.
    require(isinstance(extras, dict) and isinstance(extras.get("defaults"), dict)
            and isinstance(extras.get("timeline"), list) and isinstance(extras.get("scenes"), dict),
            "NATIVE_MANAGER_PROJECTION_SCHEMA")
    require("themeDefinitionJson" not in extras and "applicationCompositionJson" not in extras
            and "showComposition" not in extras["defaults"], "CUSTOM_OR_COMPOSITION_PAYLOAD_FORBIDDEN")
    require(extras["defaults"].get("presentationLocale") == "en", "NATIVE_PRESENTATION_LOCALE")
    selection = extras["defaults"].get("showTheme")
    require(isinstance(selection, dict) and selection.get("id") == THEME
            and selection.get("version") == THEME_VERSION, "NATIVE_BUILTIN_SELECTION")
    # Match core/stage-look.ts::normalizeLegacyStageLook for this original
    # stored sidecar only. The current runtime already supplies normalized
    # defaults in its manager envelope, which has no stored quiz identity.
    # Never rewrite stored bytes or discard an explicit appearance selection.
    defaults = extras["defaults"]
    if extras.get("quizId") == GAME and "stageLook" not in defaults:
        defaults = {**defaults, "stageLook": "guess-off"}
    value = {"defaults": defaults, "timeline": extras["timeline"], "scenes": extras["scenes"]}
    if "audio" in extras:
        require(isinstance(extras["audio"], dict), "NATIVE_AUDIO_CONFIGURATION_SCHEMA")
        value["audio"] = extras["audio"]
    return value


def validate_native_configuration(base, extras, current):
    require(isinstance(base, dict) and isinstance(extras, dict) and base.get("id") == GAME
            and extras.get("quizId") == GAME and extras.get("schemaVersion") == 2, "NATIVE_GAME_IDENTITY")
    questions, ids, timeline = base.get("questions"), extras.get("questionIds"), extras.get("timeline")
    require(isinstance(questions, list) and isinstance(ids, list) and isinstance(timeline, list)
            and len(questions) == len(ids) == 23 and len(timeline) == current["nativeCardCount"],
            "NATIVE_GAME_STRUCTURE")
    require(digest(canonical(questions)) == current["acceptedNativeQuestionsSha256"],
            "ACCEPTED_NATIVE_QUESTIONS_CHANGED")
    require(all(uuid_value(value) for value in ids) and len(set(ids)) == 23
            and all(isinstance(card, dict) for card in timeline), "NATIVE_QUESTION_IDENTITIES")
    refs = [card.get("questionId") for card in timeline if card.get("kind") == "question"]
    require(refs == ids, "NATIVE_QUESTION_TIMELINE")
    completed, boards = 0, []
    for card in timeline:
        if card.get("kind") == "question":
            completed += 1
        elif card.get("kind") == "leaderboard":
            boards.append(completed)
    require(boards == [8, 16, 23], "NATIVE_WINNERS_CHAPTERS")
    projection = manager_projection(extras)
    require(digest(canonical(projection)) == current["acceptedManagerProjectionSha256"],
            "ACCEPTED_NATIVE_MANAGER_CONFIGURATION_CHANGED")
    serialized = canonical([current["builtinDefinition"], base, extras]).decode()
    require(not any(value in serialized for value in OLD_AUDIO_DIGESTS), "OLD_RECORDING_REFERENCE_RETAINED")
    return projection, boards


def read_verified(config_root, game_id, current, snapshot_pin):
    validate_current_evidence(current, snapshot_pin)
    require(game_id == GAME, "ORIGINAL_GAME_ID_REQUIRED")
    root = Path(config_root)
    require(root.is_absolute() and root.resolve(strict=True) == root and root.is_dir(),
            "INVALID_EXPLICIT_CONFIG_ROOT")
    database = own_path(root, "extensions", "packages", "packages.sqlite")
    connection = readonly_packages(database)
    try:
        anchor = connection.execute(
            "SELECT tenant,package_id,version,source,build,phase,revision,games FROM packages WHERE upload=?", (UPLOAD,),
        ).fetchone()
        require(anchor is not None and anchor["phase"] == "installed" and anchor["revision"] == 2
                and anchor["package_id"] == PACKAGE and anchor["version"] == "1.0.0"
                and anchor["source"] == SOURCE and anchor["build"] == BUILD
                and isinstance(anchor["games"], str) and len(anchor["games"]) < 1000
                and json.loads(anchor["games"]) == [GAME] and uuid_value(anchor["tenant"]),
                "ORIGINAL_OWNER_GAME_ANCHOR")
        owner = anchor["tenant"]
        owner_root = own_path(root, "tenants", owner)
        base_raw = read_bytes(own_path(owner_root, "quizz", GAME + ".json"), 2000000)
        extras_raw = read_bytes(own_path(owner_root, "extensions", "quizzes", GAME + ".json"), 2000000)
        require(digest(base_raw) == current["nativeBaseSha256"] and digest(extras_raw) == current["nativeExtrasSha256"],
                "CURRENT_NATIVE_GAME_BYTES_CHANGED")
        base, extras = json.loads(base_raw), json.loads(extras_raw)
        projection, boards = validate_native_configuration(base, extras, current)
        proof = {
            "ok": True, "originalUploadOwnerGameAnchorVerified": True, "originalNativeGameIdPreserved": True,
            "currentNativeSnapshotSha256": snapshot_pin, "nativeBaseSha256": digest(base_raw),
            "nativeExtrasSha256": digest(extras_raw), "acceptedNativeQuestionsSha256": current["acceptedNativeQuestionsSha256"],
            "questionDocumentSha256": QUESTION_DOCUMENT_SHA, "contentAcceptanceReceiptSha256": current["contentAcceptanceReceiptSha256"],
            "nativeQuestionCount": 23, "nativeCardCount": len(extras["timeline"]), "winnerScreensAfterQuestion": boards,
            "builtinThemeIdentityVerified": True, "builtinDefinitionCanonicalSha256": current["builtinDefinitionCanonicalSha256"],
            "acceptedManagerProjectionSha256": current["acceptedManagerProjectionSha256"],
            "oldRecordingsAbsentFromCurrentConfiguration": True, "presentationLocale": "en", "compositionMode": "none",
            "proofKind": "accepted-content-configuration-and-pinned-source-provenance", "readOnly": True,
            "observedPlaybackClaimed": False, "visualRenderingClaimed": False,
        }
        return owner, current["builtinDefinition"], projection, extras["defaults"]["showTheme"], proof
    finally:
        connection.close()


def verify(config_root, game_id, current, snapshot_pin):
    return read_verified(config_root, game_id, current, snapshot_pin)[4]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config-root", required=True)
    parser.add_argument("--installed-game-id", required=True)
    parser.add_argument("--current-native-evidence", type=Path, required=True)
    parser.add_argument("--current-native-evidence-sha256", required=True)
    args = parser.parse_args()
    raw = read_bytes(args.current_native_evidence, 256 * 1024)
    require(HEX.fullmatch(args.current_native_evidence_sha256) and digest(raw) == args.current_native_evidence_sha256,
            "CURRENT_EVIDENCE_FILE_PIN")
    current = json.loads(raw)
    print(json.dumps(verify(args.config_root, args.installed_game_id, current, digest(canonical(current))), separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except VerificationFailure as error:
        print(json.dumps({"ok": False, "error": str(error), "readOnly": True}))
        sys.exit(1)
    except Exception as error:
        print(json.dumps({"ok": False, "error": "BOUNDED_VERIFICATION_FAILED", "errorType": type(error).__name__, "readOnly": True}))
        sys.exit(1)
