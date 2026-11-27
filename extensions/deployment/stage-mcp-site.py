#!/usr/bin/env python3
"""Build a pinned Tadazz MCP release from already-qualified immutable Linux output.

This creates a new root-owned staging tree, image and isolated synthetic test.
It never reads the production config, stops a live container, publishes a port,
changes a proxy, or deploys. All source builds and browser gates must precede it.
Failed staging artifacts and stopped test containers are retained for review.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid


BASE_IMAGE = "sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346"
EVIDENCE_ROOT = Path("/home/ubuntu/tadazz-phase2-20261116/evidence")
ORIGIN = "https://tadazz.com"
# Initial consent advertises the ordered tool-scope union (server/http.ts).
MCP_SCOPES = (
    "tadazz.catalog.read", "tadazz.drafts.write", "tadazz.drafts.read",
    "tadazz.library.write", "tadazz.exports.read",
)
MCP_CHALLENGE = ('Bearer resource_metadata="' + ORIGIN +
                 '/.well-known/oauth-protected-resource", scope="' + " ".join(MCP_SCOPES) + '"')
HASH = re.compile(r"[a-f0-9]{64}")
PUBLIC_CATALOGUE_IDS = (
    "great-guessoff", "crowd", "quiz", "story", "picture", "truth", "finale", "family", "classroom", "team",
    "family-mixup",
    "royal-quiz", "neon-arcade", "retro-tv", "magic-storybook",
    "crystal-future", "carnival-pop", "sports-arena", "mystery-noir",
)
NATIVE_APPLICATION_RENDERERS = ("tadazz-classic-stage", "razzia-native-stage", "tadazz-original-stage")
ORIGINAL_THEME_IDS = (
    "royal-quiz", "neon-arcade", "retro-tv", "magic-storybook",
    "crystal-future", "carnival-pop", "sports-arena", "mystery-noir",
)
ORIGINAL_QA_FILES = {"extensions/qa/original-themes/" + name for name in
                     ("account-verify.mjs", "browser-verify.mjs", "audio-observer.mjs", "contract.mjs", "linux-browser-verify.py")}
MAX_FILE = 64 * 1024 * 1024
MAX_TREE = 512 * 1024 * 1024
FULL_SHOW_CHECKS = (
    "native opening, five phases, transitions and closing",
    "title edit CAS and summary refresh through AppBridge",
    "semantic question, lost ACK retry, reconnect undo, purple background, five pictures and theme preservation",
    "nine localized interfaces and non-reduced native motion",
    "native audio gesture, acknowledged music and volume, persistent playback",
    "tamper, cancellation and tool-context teardown",
    "CSP, native media resources and browser errors",
    "native pause, resume, replay and adjacent skip",
    "responsive 16:9 and 4:3 keyboard controls",
    "zero-vote, tie and picture result parity with preserved media and motion",
)
NATIVE_FIXTURE_IDS = {
    "zero-votes-five-pictures", "tie-five-pictures", "media-swap-same-composition",
    "image-only-five-pictures", "native-motion-same-pictures", "leaderboard-empty",
    "interim-results-empty", "answer-recap-empty", "countdown-three-seconds",
    "animation-interlude", "animation-spotlight",
}
NATIVE_FIXTURE_SOURCES = {
    "extensions/src/core/show-library/native-preview-frame-schema.ts",
    "extensions/src/core/show-library/native-preview-renderer-v2-schema.ts",
    "extensions/src/presentation/show-library-preview/stage-scene-adapter.ts",
    "extensions/src/presentation/poll-ranking.ts",
    "extensions/src/presentation/scene-presenter.tsx",
    "extensions/src/core/studio-timeline-schema.ts",
}
NATIVE_FIXTURE_FAMILY_SOURCES = {
    "tadazz-classic": {
        "extensions/src/presentation/show-library-preview/NativePreviewStage.tsx",
        "extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx",
    },
    "razzia-original": {
        "extensions/src/presentation/show-library-preview/NativeRazziaPreviewV2.tsx",
        "packages/web/src/features/game/components/PhotoCardGrid.tsx",
        "packages/web/src/features/game/utils/answer-style.ts",
        "extensions/src/presentation/stage-fit.tsx",
        "extensions/src/mcp-app/widget/native-photo-card-port.ts",
    },
}
PROXY_CONTROLLER = "extensions/qa/phase3-native-consent/proxy-verify.py"
PROXY_INPUTS = {
    "extensions/deployment/nginx-mcp-routes.conf",
    "extensions/qa/phase3-native-consent/nginx-routing.nodecheck.ts",
}
PROXY_PRIVACY_PROOF = {
    "version": 1, "passed": True, "ordinaryAccessControl": True,
    "ordinaryUpstreamErrorControl": True, "sensitiveAccessLogAbsent": True,
    "sensitiveErrorLogAbsent": True, "protectedSuccess": True,
    "protectedDenial": True, "protectedUpstreamFailure": True,
}
LINT_BASELINE_SHA = "9c8b1081f07c608e03946deec14351d27d6cca57"
LINT_BASELINE_RUN = "tadazz-codex-9c8b1081f07c-e01312da"
LINT_POLICY_CONFIG = "tadazz-lint-policy.config.ts"
LEGACY_LINT_FILES = tuple("extensions/src/mcp-app/" + path for path in (
    "server/drafts.ts", "first-party/oauth-grants.ts", "first-party/oauth.ts", "first-party/store.ts",
))
SEMANTIC_TEST_FILES = {
    "extensions/qa/phase3-full-show/semantic-edit.nodecheck.ts",
    "extensions/qa/phase3-full-show/assets.nodecheck.ts",
    "extensions/qa/phase3-full-show/selection.nodecheck.ts",
    "extensions/qa/phase3-full-show/resource-csp.nodecheck.ts",
    "extensions/qa/phase3-full-show/native-save-ui.nodecheck.ts",
    "extensions/qa/phase3-native-consent/builtin-asset-policy.nodecheck.ts",
    "extensions/qa/phase3-native-consent/production-config.nodecheck.ts",
    "extensions/qa/phase3-native-consent/production-capabilities.nodecheck.ts",
    "extensions/qa/phase3-native-consent/production-artifacts.nodecheck.ts",
    "extensions/qa/phase3-native-consent/oauth-client-isolation.nodecheck.ts",
    "extensions/qa/phase3-native-consent/account-preview-builtins.nodecheck.ts",
    *("extensions/src/mcp-app/tests/first-party/" + path for path in (
        "oauth.nodecheck.ts", "oauth-export.nodecheck.ts", "store.nodecheck.ts",
    )),
    *("extensions/src/mcp-app/tests/server/" + path for path in (
        "protocol.nodecheck.ts", "http.nodecheck.ts", "access-token.nodecheck.ts",
        "drafts.nodecheck.ts", "integrity.nodecheck.ts", "boundaries.nodecheck.ts",
    )),
}
SEMANTIC_STRICT_FILES = {
    *("extensions/src/mcp-app/" + path for path in (
        "contracts/semantic-edit.ts", "server/semantic-drafts.ts", "server/semantic-state.ts",
        "server/authoring.ts", "first-party/oauth-semantic-drafts.ts",
    )),
    "extensions/qa/phase3-full-show/semantic-edit.nodecheck.ts",
    "extensions/qa/phase3-full-show/native-parity-fixtures.ts",
    "extensions/src/core/show-library/reviewed-preview-assets.ts",
    "extensions/src/core/show-library/application-preview-input.ts",
    "extensions/src/server/api/account-preview-builtins.ts",
    "extensions/src/server/api/account-preview-source.ts",
    "extensions/qa/phase3-native-consent/account-preview-builtins.nodecheck.ts",
}
WIDGET_STRICT_FILES = {
    *("extensions/src/mcp-app/" + path for path in (
        "client/full-show-playback.ts", "client/full-show-audio.ts",
        "widget/full-show-entry.tsx", "widget/full-show-stage.tsx",
        "widget/full-show-audio.tsx", "widget/full-show-editor.tsx", "widget/i18n.ts",
        "widget/native-stage-viewport.tsx", "widget/native-photo-card-port.ts",
        "client/full-show-save.ts", "widget/full-show-save.tsx", "widget/full-show-demo-question.tsx",
    )),
    "extensions/qa/phase3-full-show/selection.nodecheck.ts",
    "extensions/qa/phase3-full-show/native-save-ui.nodecheck.ts",
}
SEMANTIC_REQUIRED_CHECKS = {"semantic-types", "full-show-widget-types", "full-show-widget-lint", "full-show-widget-format", "semantic-lint", "semantic-format", "semantic-integration-lint-baseline"}
NATIVE_APP_MANIFEST = "extensions/src/core/show-library/application-preview-build.json"
NATIVE_APP_BUILDER = "extensions/qa/build-application-preview.mjs"
NATIVE_APP_PROBE = "extensions/qa/phase2/runtime-package-probe.mjs"
NATIVE_APP_CHECKS = {"native-application-preview-build", "native-application-package"}


class GateError(Exception):
    pass


def need(condition, code):
    if not condition:
        raise GateError(code)


def safe_relative(value):
    need(isinstance(value, str), "RELATIVE_PATH_TYPE")
    path = PurePosixPath(value)
    need(value and not path.is_absolute() and str(path) == value and
         ".." not in path.parts and "\\" not in value and
         all(ord(char) >= 32 for char in value), "RELATIVE_PATH_REJECTED")
    return path


def plain(path, directory=False):
    path = Path(path)
    need(path.is_absolute() and str(path) == os.path.normpath(path), "PATH_NOT_CANONICAL")
    for ancestor in [*reversed(path.parents), path]:
        info = ancestor.lstat()
        need(not stat.S_ISLNK(info.st_mode), "PATH_SYMLINK")
        if ancestor != path or directory:
            need(stat.S_ISDIR(info.st_mode), "PATH_NOT_DIRECTORY")
        else:
            need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, "PATH_NOT_PLAIN_FILE")
    return path


def read_bytes(path, limit=MAX_FILE):
    path = plain(path)
    before = path.stat()
    need(before.st_size <= limit, "FILE_LIMIT")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as stream:
        current = os.fstat(stream.fileno())
        need((current.st_dev, current.st_ino, current.st_size) ==
             (before.st_dev, before.st_ino, before.st_size), "FILE_CHANGED_WHILE_OPENING")
        data = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
        need(len(data) == before.st_size and after.st_mtime_ns == before.st_mtime_ns and
             after.st_ctime_ns == before.st_ctime_ns, "FILE_CHANGED_WHILE_READING")
    return data


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical_digest(value):
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def json_file(path):
    return json.loads(read_bytes(path, 32 * 1024 * 1024))


def write_new(path, data):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    plain(path.parent, directory=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                         getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def write_json(path, value):
    write_new(path, (json.dumps(value, indent=2, sort_keys=True) + "\n").encode())


def copy_pinned(source, target, pin, size=None):
    data = read_bytes(source)
    need(digest(data) == pin and (size is None or len(data) == size), "ARTIFACT_CHANGED_DURING_COPY")
    write_new(target, data)


def tree(root):
    root = plain(root, directory=True)
    result, total = {}, 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            plain(Path(directory) / name, directory=True)
        for name in sorted(files):
            path = Path(directory) / name
            data = read_bytes(path)
            total += len(data)
            need(total <= MAX_TREE and len(result) < 10000, "TREE_LIMIT")
            relative = path.relative_to(root).as_posix()
            safe_relative(relative)
            result[relative] = {"sha256": digest(data), "bytes": len(data)}
    return dict(sorted(result.items()))


def verify_source(root, manifest):
    need(isinstance(manifest, dict) and 0 < len(manifest) <= 20000, "SOURCE_MANIFEST_EMPTY")
    for name, pin in manifest.items():
        relative = safe_relative(name)
        need(isinstance(pin, str) and HASH.fullmatch(pin), "SOURCE_PIN_INVALID")
        need(digest(read_bytes(root.joinpath(*relative.parts))) == pin, "SOURCE_HASH_MISMATCH")


def no_live_data(receipt, key="customerMountAccessed"):
    need(receipt.get("productionChanged") is False and receipt.get(key) is False,
         "RECEIPT_ISOLATION_MISSING")


def matrix_receipt(receipt, revision, source_run, suite, required):
    need(receipt.get("sha") == revision and receipt.get("run") == source_run and
         receipt.get("suite") == suite, "MATRIX_IDENTITY_MISMATCH")
    need(receipt.get("allHashesVerifiedBeforeAfter") is True and
         receipt.get("hashesBefore") == receipt.get("hashesAfter") and
         not receipt.get("changedSourcePaths"), "MATRIX_SOURCE_CHANGED")
    no_live_data(receipt)
    checks = receipt.get("checks")
    need(isinstance(checks, list) and checks and all(c.get("exit") == 0 for c in checks),
         "MATRIX_CHECK_FAILED")
    labels = [c.get("label") for c in checks]
    need(len(labels) == len(set(labels)) and required <= set(labels), "MATRIX_REQUIRED_CHECK_MISSING")
    http = next(c for c in checks if c["label"] == "native-http")
    tap_success(http.get("stdout", ""))
    if suite == "native-launch":
        verify_semantic_matrix(receipt)
    if suite in ("native-launch", "native-consent"):
        verify_application_matrix(receipt)
    return receipt["hashesBefore"]


def verify_application_matrix(receipt):
    checks = {item["label"]: item for item in receipt["checks"]}
    need(NATIVE_APP_CHECKS <= checks.keys(), "NATIVE_APPLICATION_CHECKS_MISSING")
    command = checks["native-application-preview-build"].get("command", [])
    need(command[-3:] == ["node", NATIVE_APP_BUILDER, "--verify-manifest"],
         "NATIVE_APPLICATION_GENERATION_NOT_QUALIFICATION")
    package_command = checks["native-application-package"].get("command", [])
    need(package_command[-2:] == ["node", NATIVE_APP_PROBE] and
         "TADAZZ_REMOTE_QA=1" in package_command, "NATIVE_APPLICATION_PACKAGE_GATE_MISSING")
    site_command = checks.get("native-site-build", {}).get("command", [])
    need("VITE_TADAZZ_INLINE_GAME_PREVIEW=true" in site_command and
         not any(value in site_command for value in (
             "VITE_TADAZZ_THEME_BUILDER_ENABLED=true", "TADAZZ_THEME_INSTALLER_ENABLED=true",
             "TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED=true")), "NATIVE_APPLICATION_FLAGS_MISMATCH")


def verify_application_metadata(bundle, source_manifest, backend_artifact, web_files):
    raw = bundle["manifestBytes"]
    native = json.loads(raw)
    artifact = json.loads(bundle["artifactBytes"])
    registry = json.loads(bundle["registryBytes"])
    verification = bundle["verification"]
    need(source_manifest.get(NATIVE_APP_MANIFEST) == digest(raw) and
         native.get("format") == "tadazz-application-preview-build" and native.get("available") is True,
         "NATIVE_APPLICATION_COMMITTED_PIN_MISSING")
    files = native.get("files")
    need(isinstance(files, list) and len(files) == 2 and
         {item.get("name") for item in files} == {"renderer.mjs", "renderer.css"},
         "NATIVE_APPLICATION_FILES_MISMATCH")
    need(verification.get("format") == "tadazz-application-preview-verification" and
         verification.get("mode") == "verify-manifest" and verification.get("verifiedManifest") is True and
         verification.get("generatedSourceChanged") is False and verification.get("liveAuthorityInputs") == [] and
         verification.get("productionChanged") is False and verification.get("manifestSha256") == digest(raw) and
         verification.get("artifactSha256") == digest(bundle["artifactBytes"]) and
         verification.get("registrySha256") == digest(bundle["registryBytes"]) and verification.get("files") == files,
         "NATIVE_APPLICATION_REPRODUCTION_MISSING")
    need(artifact.get("format") == "tadazz-first-party-application-renderer" and artifact.get("files") == files and
         artifact.get("toolchain", {}).get("buildScriptSha256") == source_manifest.get(NATIVE_APP_BUILDER) and
         artifact.get("toolchain", {}).get("lockfileSha256") == source_manifest.get("pnpm-lock.yaml"),
         "NATIVE_APPLICATION_BUILD_PROVENANCE_MISMATCH")
    sources = artifact.get("source")
    need(isinstance(sources, list) and sources and verification.get("inputFiles") == len(sources) and
         len({item["path"] for item in sources}) == len(sources), "NATIVE_APPLICATION_SOURCE_LIST_MISSING")
    for item in sources:
        name = item["path"]
        need(isinstance(name, str) and isinstance(item.get("sha256"), str) and HASH.fullmatch(item["sha256"]),
             "NATIVE_APPLICATION_SOURCE_PIN_INVALID")
        need(name != NATIVE_APP_MANIFEST, "NATIVE_APPLICATION_SOURCE_CYCLE")
        if name in source_manifest:
            need(source_manifest[name] == item["sha256"], "NATIVE_APPLICATION_SOURCE_CHANGED")
        elif name.startswith(("extensions/src/", "packages/web/src/", "packages/common/src/")):
            need(False, "NATIVE_APPLICATION_UNTRACKED_SOURCE")
        elif any(fragment in name for fragment in ("/extensions/src/", "/packages/web/src/", "/packages/common/src/")):
            need(False, "NATIVE_APPLICATION_FOREIGN_CHECKOUT")
    need(any(item.get("path") == NATIVE_APP_MANIFEST and item.get("sha256") == digest(raw) and
             item.get("bytes") == len(raw) for item in backend_artifact.get("files", [])),
         "NATIVE_APPLICATION_BACKEND_MANIFEST_MISMATCH")
    artifact_pin = digest(json.dumps(artifact, ensure_ascii=False, separators=(",", ":")).encode())
    registry_pin = digest(json.dumps(registry, ensure_ascii=False, separators=(",", ":")).encode())
    pins = native.get("pins")
    need(isinstance(pins, list) and len(pins) == len(NATIVE_APPLICATION_RENDERERS) and
         {(pin.get("renderer", {}).get("id"), pin.get("renderer", {}).get("version")) for pin in pins} ==
         {(renderer, "1.0.0") for renderer in NATIVE_APPLICATION_RENDERERS},
         "NATIVE_APPLICATION_RENDERER_PINS_MISSING")
    for pin in pins:
        need(pin.get("portVersion") == 3 and pin.get("identityRuleVersion") == 2 and
             pin.get("rendererBuildSha256") == artifact_pin and pin.get("registrySha256") == registry_pin and
             pin.get("registry") == {"id": registry["id"], "version": registry["version"]},
             "NATIVE_APPLICATION_ADMISSION_PIN_MISMATCH")
    for item in files:
        need(isinstance(item.get("bytes"), int) and 0 < item["bytes"] <= 10_000_000 and
             isinstance(item.get("sha256"), str) and HASH.fullmatch(item["sha256"]), "NATIVE_APPLICATION_FILE_PIN_INVALID")
        need(web_files.get("tadazz-application-runtime/" + item["name"]) ==
             {"sha256": item["sha256"], "bytes": item["bytes"]}, "NATIVE_APPLICATION_WEB_PIN_MISMATCH")
    return {"manifestSha256": digest(raw), "artifactSha256": verification["artifactSha256"],
            "registrySha256": verification["registrySha256"], "rendererBuildSha256": artifact_pin,
            "files": files, "sourceFiles": len(sources)}


def verify_lint_policy(receipt, gate, report):
    policy = report.get("effectivePolicy")
    prefix = ["node", "--experimental-strip-types", "/cleanup/node_modules/oxlint/bin/oxlint", "-c"]
    if policy is None:
        need(receipt.get("lintPolicy") is None, "SEMANTIC_LINT_POLICY_REPORT_MISSING")
        need(report["baselineHashes"]["oxlint.config.ts"] == report["candidateHashes"]["oxlint.config.ts"],
             "SEMANTIC_LINT_RULES_CHANGED")
        need(report.get("command") == [*prefix, "oxlint.config.ts", "--format=json", *LEGACY_LINT_FILES],
             "SEMANTIC_LINT_COMMAND_MISMATCH")
        return
    outer = receipt.get("lintPolicy")
    need(isinstance(policy, dict) and isinstance(outer, dict), "SEMANTIC_LINT_POLICY_PROOF_MISSING")
    expected = receipt["hashesBefore"]["oxlint.config.ts"]
    observed = {"baseline": expected, "candidate": expected}
    for proof in (policy, outer):
        need(proof.get("configFile") == LINT_POLICY_CONFIG and proof.get("sourcePath") == "oxlint.config.ts" and
             proof.get("sha256") == expected and proof.get("hashesBefore") == observed and
             proof.get("hashesAfter") == observed, "SEMANTIC_LINT_EFFECTIVE_POLICY_MISMATCH")
    need(outer.get("sourceSha") == receipt.get("sha") and isinstance(receipt.get("sha"), str) and
         re.fullmatch(r"[a-f0-9]{40}", receipt["sha"]) and outer.get("sourceReadOnly") is True and
         receipt.get("hashesAfter", {}).get("oxlint.config.ts") == expected,
         "SEMANTIC_LINT_POLICY_PROVENANCE_INVALID")
    need(report.get("workingDirectories") == {"baseline": "/lint-baseline", "candidate": receipt.get("source")} and
         isinstance(receipt.get("source"), str) and receipt["source"].startswith("/") and
         receipt["source"] != "/lint-baseline", "SEMANTIC_LINT_POLICY_WORKING_DIRECTORY_MISMATCH")
    need(report.get("command") == [*prefix, LINT_POLICY_CONFIG, "--format=json", *LEGACY_LINT_FILES],
         "SEMANTIC_LINT_COMMAND_MISMATCH")
    command = gate.get("command", [])
    script = "extensions/qa/phase3-recovery/lint-baseline.py"
    need(isinstance(command, list) and all(isinstance(value, str) for value in command) and
         command.count(script) == 1 and command.count("--policy-sha256") == 1,
         "SEMANTIC_LINT_POLICY_EXECUTION_MISMATCH")
    position = command.index(script)
    need(position > 0 and command[position - 1] == "python3", "SEMANTIC_LINT_POLICY_EXECUTION_MISMATCH")
    tail = command[position + 1:]
    need(len(tail) == 10 and tail[:7] == ["--baseline-root", "/lint-baseline", "--current-root", receipt["source"],
         "--baseline-sha", LINT_BASELINE_SHA, "--output"] and tail[8:] == ["--policy-sha256", expected],
         "SEMANTIC_LINT_POLICY_EXECUTION_MISMATCH")
    fixture = receipt.get("fixture")
    need(isinstance(fixture, str) and fixture.startswith("/") and
         re.fullmatch(re.escape(fixture.rstrip("/") + "/semantic-lint-baseline-") + r"[a-f0-9]{8}", tail[7]),
         "SEMANTIC_LINT_POLICY_OUTPUT_SCOPE_INVALID")


def verify_semantic_matrix(receipt):
    checks = {item["label"]: item for item in receipt["checks"]}
    need(SEMANTIC_REQUIRED_CHECKS <= checks.keys(), "SEMANTIC_MATRIX_REQUIRED_CHECK_MISSING")
    command = checks["native-http"].get("command", [])
    need(isinstance(command, list) and all(isinstance(value, str) for value in command) and
         "--test" in command and SEMANTIC_TEST_FILES <= set(command) and
         not any(value.startswith(("--test-name-pattern", "--test-skip-pattern", "--test-only", "--test-shard")) for value in command),
         "SEMANTIC_TEST_COMMAND_INCOMPLETE")
    need("extensions/qa/phase3-full-show/tsconfig.json" in checks["semantic-types"].get("command", []),
         "SEMANTIC_TYPES_SCOPE_MISSING")
    widget_types = checks["full-show-widget-types"].get("command", [])
    need("--noEmit" in widget_types and "-p" in widget_types and
         "extensions/src/mcp-app/widget/tsconfig.json" in widget_types, "WIDGET_TYPES_SCOPE_MISSING")
    for label in ("full-show-widget-lint", "full-show-widget-format"):
        need(WIDGET_STRICT_FILES <= set(checks[label].get("command", [])), "WIDGET_STRICT_SCOPE_MISSING")
    for label in ("semantic-lint", "semantic-format"):
        need(SEMANTIC_STRICT_FILES <= set(checks[label].get("command", [])), "SEMANTIC_STRICT_SCOPE_MISSING")
    baseline = receipt.get("lintBaseline", {})
    hashes = baseline.get("hashesBefore", {})
    need(baseline.get("sha") == LINT_BASELINE_SHA and baseline.get("run") == LINT_BASELINE_RUN and
         baseline.get("sourceReadOnly") is True and baseline.get("allHashesVerifiedBeforeAfter") is True and
         hashes and hashes == baseline.get("hashesAfter") and baseline.get("sourceFileCount") == len(hashes),
         "SEMANTIC_LINT_BASELINE_NOT_PINNED")
    gate = checks["semantic-integration-lint-baseline"]
    need(gate.get("exit") == 0 and "extensions/qa/phase3-recovery/lint-baseline.py" in gate.get("command", []),
         "SEMANTIC_LINT_BASELINE_NOT_EXECUTED")
    try:
        report = json.loads(gate.get("stdout", ""))
    except (TypeError, json.JSONDecodeError):
        raise GateError("SEMANTIC_LINT_BASELINE_REPORT_INVALID") from None
    need(report.get("baselineSha") == LINT_BASELINE_SHA and report.get("files") == list(LEGACY_LINT_FILES) and
         report.get("gatePass") is True and report.get("sourceHashesUnchanged") is True and
         report.get("unmatchedCount") == 0, "SEMANTIC_LINT_NEW_DIAGNOSTIC")
    counts = [report.get(key) for key in ("baselineDiagnosticCount", "candidateDiagnosticCount", "matchedInheritedCount")]
    need(all(type(value) is int and value >= 0 for value in counts) and
         counts[1] == counts[2] <= counts[0], "SEMANTIC_LINT_DIAGNOSTIC_ACCOUNTING_INVALID")
    need(report.get("wholeLegacyLintPass") == (report.get("candidateLintExit") == 0) and
         report.get("candidateLintExit") in (0, 1) and report.get("baselineLintExit") in (0, 1),
         "SEMANTIC_LINT_BASELINE_MISREPORTED")
    for path in (*LEGACY_LINT_FILES, "oxlint.config.ts"):
        need(report.get("baselineHashes", {}).get(path) == hashes.get(path) and
             report.get("candidateHashes", {}).get(path) == receipt["hashesBefore"].get(path) and
             isinstance(hashes.get(path), str) and HASH.fullmatch(hashes[path]) and
             isinstance(receipt["hashesBefore"].get(path), str) and HASH.fullmatch(receipt["hashesBefore"][path]),
             "SEMANTIC_LINT_SOURCE_PIN_MISMATCH")
    verify_lint_policy(receipt, gate, report)


def tap_success(output):
    # Node emits TAP ('#') or its spec reporter ('ℹ') depending on runtime.
    # Parse a local view only: original receipt/stdout evidence stays unchanged.
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", output)
    rows = re.findall(r"^(#|ℹ) (tests|pass|fail|cancelled|skipped|todo) ([0-9]+)\s*$", text, re.M)
    required = {"tests", "pass", "fail", "cancelled", "skipped", "todo"}
    need(len(rows) == len(required) and {name for _, name, _ in rows} == required and
         len({prefix for prefix, _, _ in rows}) == 1, "NODE_TEST_SUMMARY_INCOMPLETE")
    counts = {name: int(value) for _, name, value in rows}
    need(counts["tests"] == counts["pass"] > 0 and
         all(counts[name] == 0 for name in ("fail", "cancelled", "skipped", "todo")),
         "NODE_TESTS_NOT_ALL_PASSED")


def original_theme_checks():
    checks = {
        "eight-native-installs-and-isolated-two-to-five-choice-fixtures": {
            "originals": 8, "rounds": 32, "anonymousInstallDenied": True, "crossAccountReadDenied": True},
        "native-editor-eight-theme-round-trip-save-reload-and-history": {
            "switches": 8, "preservedQuestionCount": 6},
        "public-back-clears-current-and-future-votes": {
            "retainedScore": 1000, "clearedQuestions": [2, 3], "replay": True},
        "nine-locales-and-eight-reduced-motion-hebrew-mobile-votes": {
            "locales": 9, "mobileRounds": 8, "storybookFinalRecapEntries": 6},
        "native-pause-replay-previous-and-confirmed-skip": {
            "retainedPausedTimer": True, "replayDiscardsOldVotes": True},
        "original-browser-console-and-resource-integrity": {},
        "immutable-public-masters-after-editor-and-live-games": {},
    }
    for theme in ORIGINAL_THEME_IDS:
        checks["normal-motion-complete-public-show-" + theme] = {
            "rounds": 6, "checkpoints": 3, "interludes": 2, "replay": True}
        checks["reduced-motion-native-two-to-five-choices-votes-images-and-audio-" + theme] = {
            "questions": 4, "realPlayers": 2, "tie": True, "zeroVotes": True,
            "answerImages": 14, "questionImages": 1, "votingLayoutChecks": 4, "resultsLayoutChecks": 4}
    return {name: {"name": name, "passed": True, **detail} for name, detail in checks.items()}


def verify_originals(receipt, revision, source_run, manifest, artifacts):
    need(isinstance(receipt, dict) and receipt.get("format") == "tadazz-original-themes-acceptance" and
         type(receipt.get("version")) is int and receipt["version"] == 1 and
         receipt.get("sha") == revision and receipt.get("sourceRun") == source_run and
         isinstance(receipt.get("run"), str) and
         re.fullmatch(r"tadazz-originals-" + revision[:12] + r"-[a-f0-9]{8}", receipt["run"]),
         "ORIGINALS_IDENTITY_MISMATCH")
    need(type(receipt.get("exit")) is int and receipt["exit"] == 0 and receipt.get("passed") is True and
         receipt.get("oomKilled") is False and receipt.get("network") == "none" and
         receipt.get("manualListeningPerformed") is False, "ORIGINALS_LINUX_GATE_MISSING")
    no_live_data(receipt, "customerMountUsed")
    for field in ("allSourceHashesVerified", "candidateSourceHashesVerifiedBeforeAfter", "sdkCacheHashesVerifiedBeforeAfter",
                  "applicationSourcesEqualCandidate", "runtimeQaSourceEqualsCandidate", "sourceReadOnly",
                  "readOnlyMountsVerified", "builtArtifactHashesVerifiedBeforeAfter"):
        need(receipt.get(field) is True, "ORIGINALS_INPUT_CHANGED")
    need(ORIGINAL_QA_FILES <= manifest.keys() and
         all(isinstance(manifest[name], str) and HASH.fullmatch(manifest[name]) for name in ORIGINAL_QA_FILES) and
         receipt.get("qaSourceSha256") == {name: manifest[name] for name in ORIGINAL_QA_FILES} and
         receipt.get("sourceManifestSha256") == canonical_digest(manifest), "ORIGINALS_SOURCE_PIN_MISMATCH")
    need(set(artifacts) == {"web", "widget", "application", "backend"} and all(artifacts.values()) and
         receipt.get("builtArtifactsBefore") == artifacts and receipt.get("builtArtifactsAfter") == artifacts,
         "ORIGINALS_BUILT_ARTIFACT_MISMATCH")
    inner = receipt.get("browserReceipt")
    need(isinstance(inner, dict) and inner.get("passed") is True and inner.get("platform") == "linux" and
         inner.get("sourceSha") == revision and inner.get("isolatedNativeHost") is True and
         inner.get("customerMountUsed") is False and inner.get("realEmailSent") is False and
         inner.get("manualListeningPerformed") is False and not inner.get("error"), "ORIGINALS_BROWSER_GATE_MISSING")
    expected = original_theme_checks()
    results = inner.get("results")
    need(isinstance(results, list) and len(results) == len(expected) and
         all(isinstance(item, dict) and isinstance(item.get("name"), str) for item in results),
         "ORIGINALS_SCENARIOS_INCOMPLETE")
    actual = {item["name"]: item for item in results}
    need(len(actual) == len(results) and set(actual) == set(expected), "ORIGINALS_SCENARIOS_INCOMPLETE")
    need(canonical_digest(actual) == canonical_digest(expected), "ORIGINALS_SCENARIO_PROOF_MISMATCH")
    return {"format": "tadazz-original-themes-release-proof", "version": 1, "passed": True,
            "sourceSha": revision, "sourceRun": source_run, "run": receipt["run"],
            "familyIds": list(ORIGINAL_THEME_IDS), "requiredChecks": sorted(expected),
            "sourceManifestSha256": receipt["sourceManifestSha256"], "qaSourceSha256": receipt["qaSourceSha256"],
            "builtArtifactsSha256": canonical_digest(artifacts)}


def verify_fullshow(receipt, revision, manifest_pin, widget):
    need(receipt.get("sha") == revision and receipt.get("exit") == 0 and
         receipt.get("network") == "none" and receipt.get("sourceReadOnly") is True,
         "FULL_SHOW_LINUX_GATE_MISSING")
    for name in ("allSourceHashesVerifiedBeforeAfter", "allWidgetHashesVerifiedBeforeAfter",
                 "sdkCacheHashesVerifiedBeforeAfter"):
        need(receipt.get(name) is True, "FULL_SHOW_INPUT_CHANGED")
    need(receipt.get("widgetManifestSha256") == manifest_pin and
         receipt.get("widgetHtmlSha256") == widget["sha256"], "FULL_SHOW_OUTER_ARTIFACT_MISMATCH")
    inner = receipt.get("fullShow", {})
    need(inner.get("sha") == revision and inner.get("widgetManifestSha256") == manifest_pin and
         inner.get("widgetHtmlSha256") == widget["sha256"] and
         inner.get("rendererBuildId") == widget["rendererBuildId"], "FULL_SHOW_INNER_ARTIFACT_MISMATCH")
    need(inner.get("failureCount") == 0 and inner.get("sourceHashesUnchanged") is True and
         inner.get("network") == "none" and inner.get("outboundDenied") == [],
         "FULL_SHOW_RUNTIME_FAILURE")
    no_live_data(inner)
    required = {f"{engine} / {family} {check}"
                for engine in ("chromium", "webkit")
                for family in ("tadazz-classic", "razzia-original")
                for check in FULL_SHOW_CHECKS}
    need(required <= set(inner.get("requiredChecks", [])), "FULL_SHOW_REQUIRED_CHECKS_MISSING")
    engines = inner.get("engines", [])
    need(len(engines) == 2 and {e.get("name") for e in engines} == {"chromium", "webkit"}, "FULL_SHOW_ENGINE_MISSING")
    actual = set()
    for engine in engines:
        need(engine.get("version") and engine.get("outcomes"), "FULL_SHOW_ENGINE_EMPTY")
        for outcome in engine["outcomes"]:
            need(outcome.get("status") == "PASS" and not outcome.get("error"), "FULL_SHOW_SCENARIO_FAILED")
            need(isinstance(outcome.get("name"), str) and outcome["name"].startswith(engine["name"] + " / "),
                 "FULL_SHOW_SCENARIO_ENGINE_MISMATCH")
            need(outcome.get("name") not in actual, "FULL_SHOW_DUPLICATE_SCENARIO")
            actual.add(outcome["name"])
    need(required <= actual and set(inner["requiredChecks"]) <= actual,
         "FULL_SHOW_SCENARIO_MISSING")
    verify_renderer_fixtures(inner, widget)
    verify_demo_answer_observations(inner)
    verify_host_control_observations(inner)


def verify_host_control_observations(inner):
    expected = {(engine, theme) for engine in ("chromium", "webkit")
                for theme in ("tadazz-classic", "razzia-original")}
    seen = set()
    for item in inner.get("observations", []):
        if item.get("proof") != "synthetic-host-ui-control-fixture":
            continue
        identity = (item.get("engine"), item.get("theme"))
        need(identity in expected and identity not in seen, "HOST_CONTROL_FIXTURE_IDENTITY")
        seen.add(identity)
        requests = item.get("saveRequests")
        need(isinstance(requests, list) and len(requests) == 3 and requests[0] == requests[1] == requests[2],
             "HOST_CONTROL_SAVE_RETRY_CHANGED")
        value = requests[0]
        need(isinstance(value, dict) and set(value) == {
            "contractVersion", "draftId", "expectedRevision", "idempotencyKey", "intent"
        } and value["contractVersion"] == "0.1.0" and value["intent"] == "createNew" and
             type(value["expectedRevision"]) is int and 1 <= value["expectedRevision"] <= 2_147_483_647 and
             all(isinstance(value[key], str) and re.fullmatch(r"[A-Za-z0-9_-]{22,64}", value[key])
                 for key in ("draftId", "idempotencyKey")), "HOST_CONTROL_SAVE_REQUEST_INVALID")
        need(item.get("openedLinks") == [ORIGIN + "/studio/native-save-consent/" + "S" * 54,
                                        ORIGIN + "/manager/quizz/" + "Q" * 21] and
             item.get("displayRequests") == ["fullscreen"] and
             item.get("unsupportedFeaturesHiddenOrDisabled") is True and item.get("draftUnchanged") is True,
             "HOST_CONTROL_ACTION_PROOF_MISSING")
    need(seen == expected, "HOST_CONTROL_FIXTURES_INCOMPLETE")


def verify_demo_answer_observations(inner):
    required = {(engine, family, surface) for engine in ("chromium", "webkit")
                for family in ("tadazz-classic", "razzia-original") for surface in ("text", "five-pictures")}
    seen = set()
    for item in inner.get("observations", []):
        if item.get("check") != "local demo answer selection and authorized reveal":
            continue
        key = (item.get("engine"), item.get("theme"), item.get("surface"))
        need(key in required and key not in seen, "DEMO_ANSWER_OBSERVATION_IDENTITY_MISMATCH")
        need(item.get("keyboard") == "Enter on original native card" and
             all(item.get(name) is True for name in ("noVoteMutation", "revisionPreserved", "resetAfterReplay", "resetAfterQuestionChange")) and
             type(item.get("revision")) is int and item["revision"] > 0 and
             isinstance(item.get("sourceDraftSha256"), str) and HASH.fullmatch(item["sourceDraftSha256"]) and
             item.get("resultCounts") == [0, 0, 0, 0, 0] and
             item.get("chosenOutcome") in ("correct", "incorrect", "survey"), "DEMO_ANSWER_PROOF_INCOMPLETE")
        seen.add(key)
    need(seen == required, "DEMO_ANSWER_OBSERVATION_MISSING")


def verify_renderer_fixtures(inner, widget):
    required = {(engine, family, name) for engine in ("chromium", "webkit")
                for family in ("tadazz-classic", "razzia-original") for name in NATIVE_FIXTURE_IDS}
    fixtures = inner.get("rendererFixtures")
    need(isinstance(fixtures, list), "NATIVE_FIXTURE_EVIDENCE_MISSING")
    seen, definitions = set(), {}
    for item in fixtures:
        need(isinstance(item, dict), "NATIVE_FIXTURE_EVIDENCE_TYPE")
        key = (item.get("engine"), item.get("family"), item.get("id"))
        need(key in required and key not in seen, "NATIVE_FIXTURE_IDENTITY_MISMATCH")
        need(item.get("proof") == "renderer-only-synthetic-fixture" and "frame" not in item,
             "NATIVE_FIXTURE_PROOF_SCOPE_MISMATCH")
        need(item.get("rendererBuildId") == widget["rendererBuildId"], "NATIVE_FIXTURE_ARTIFACT_MISMATCH")
        need(all(isinstance(item.get(name), str) and HASH.fullmatch(item[name])
                 for name in ("sourceFrameSha256", "frameSha256", "definitionSha256")),
             "NATIVE_FIXTURE_HASH_MISSING")
        family, definition = key[1], item["definitionSha256"]
        need(definitions.setdefault(family, definition) == definition, "NATIVE_FIXTURE_THEME_MISMATCH")
        need(isinstance(item.get("sourceModules"), list) and
             set(item["sourceModules"]) == NATIVE_FIXTURE_SOURCES | NATIVE_FIXTURE_FAMILY_SOURCES[family],
             "NATIVE_FIXTURE_SOURCE_MISMATCH")
        observed = item.get("observed", {})
        need(isinstance(item.get("expected"), dict) and isinstance(observed, dict) and
             observed.get("status") == "PASS" and not observed.get("error"), "NATIVE_FIXTURE_OBSERVATION_FAILED")
        seen.add(key)
    need(seen == required, "NATIVE_FIXTURE_SCENARIO_MISSING")


def verify_proxy(receipt, binding):
    revision, source_run, manifest, image, sdk_pin = binding
    need(receipt.get("sha") == revision and receipt.get("baseSha") == revision and
         receipt.get("exactSourceSha") == revision and receipt.get("sourceRun") == source_run and
         receipt.get("immutable") is True and receipt.get("combinedImmutableGate") is True,
         "PROXY_IMMUTABLE_SOURCE_MISMATCH")
    need(receipt.get("exit") == 0 and receipt.get("network") == "none" and
         receipt.get("runnerImage") == image and receipt.get("sourceReadOnly") is True and
         receipt.get("overlayReadOnly") is True, "PROXY_RUNNER_MISMATCH")
    no_live_data(receipt, "customerDataAccessed")
    need(receipt.get("baseHashesUnchanged") is True and receipt.get("newFileHashesUnchanged") is True and
         receipt.get("hashesBefore") == manifest and receipt.get("hashesAfter") == manifest and
         receipt.get("sourceFileCount") == len(manifest), "PROXY_SOURCE_HASH_MISMATCH")
    need(PROXY_INPUTS <= manifest.keys() and PROXY_CONTROLLER in manifest and
         receipt.get("newFileHashes") == {path: manifest[path] for path in PROXY_INPUTS} and
         receipt.get("controllerSha256") == manifest[PROXY_CONTROLLER], "PROXY_TEST_CONFIG_PIN_MISMATCH")
    need(isinstance(sdk_pin, str) and HASH.fullmatch(sdk_pin) and
         receipt.get("sdkCacheHashesVerifiedBeforeAfter") is True and
         receipt.get("sdkCacheManifestSha256") == sdk_pin, "PROXY_SDK_PIN_MISMATCH")
    command = receipt.get("command", [])
    test_path = "extensions/qa/phase3-native-consent/nginx-routing.nodecheck.ts"
    need(isinstance(command, list) and "--test" in command and
         sum(isinstance(arg, str) and arg.endswith("/" + test_path) for arg in command) == 1 and
         not any(isinstance(arg, str) and arg.startswith(("--test-name-pattern", "--test-skip-pattern", "--test-only", "--test-shard"))
                 for arg in command), "PROXY_TEST_COMMAND_MISMATCH")
    tap_success(receipt.get("stdout", ""))
    proofs = re.findall(r"^\s*(?:#\s*)?TADAZZ_PROXY_PRIVACY_PROOF (\{[^\r\n]+\})\s*$",
                        receipt.get("stdout", ""), re.M)
    need(len(proofs) == 1 and json.loads(proofs[0]) == PROXY_PRIVACY_PROOF and
         receipt.get("privacyProof") == PROXY_PRIVACY_PROOF, "PROXY_PRIVACY_PROOF_MISSING")


def run(argv, *, timeout=30, input=None, log=None, env=None):
    if log:
        with open(log, "xb") as output:
            os.chmod(log, 0o600)
            result = subprocess.run(argv, input=input, stdout=output, stderr=subprocess.STDOUT,
                                    timeout=timeout, env=env)
        need(result.returncode == 0, "COMMAND_FAILED_SEE_PRIVATE_LOG")
        return b""
    result = subprocess.run(argv, input=input, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, env=env)
    need(result.returncode == 0, "COMMAND_FAILED")
    need(len(result.stdout) <= 8 * 1024 * 1024, "COMMAND_OUTPUT_LIMIT")
    return result.stdout


def docker_inspect(kind, name):
    result = json.loads(run(["docker", kind, "inspect", name]))
    need(len(result) == 1, "DOCKER_INSPECT_COUNT")
    return result[0]


def running_snapshot():
    identifiers = run(["docker", "ps", "--no-trunc", "--format", "{{.ID}}"]).decode().splitlines()
    return {identifier: {"image": facts["Image"], "startedAt": facts["State"]["StartedAt"]}
            for identifier in sorted(identifiers)
            for facts in [docker_inspect("container", identifier)]}


def package_probe_policy(container):
    # Read the inspected container, never the operator host's environment.
    environment = {}
    for item in container["Config"].get("Env") or []:
        need(isinstance(item, str) and "=" in item, "SMOKE_ENV_INVALID")
        name, value = item.split("=", 1)
        need(name and name not in environment, "SMOKE_ENV_DUPLICATE")
        environment[name] = value
    need(environment.get("TADAZZ_ACCOUNTS_ENABLED") == "true", "SMOKE_ACCOUNTS_REQUIRED")
    enabled = environment.get("TADAZZ_PACKAGE_INSTALLER_ENABLED") == "true"
    return {"accountsEnabled": True, "installerEnabled": enabled,
            "expectedStatus": 401 if enabled else 404}


def safe_probe_routes(value):
    need(isinstance(value, dict) and len(value) <= 128, "SMOKE_DIAGNOSTIC_SCHEMA")
    result = {}
    for path, item in value.items():
        need(isinstance(path, str) and len(path) <= 2048 and
             re.fullmatch(r"(?:GET|HEAD|POST) /[A-Za-z0-9_./-]*", path), "SMOKE_DIAGNOSTIC_PATH")
        need(isinstance(item, dict) and set(item) == {"status", "expectedStatus", "contentType"} and
             type(item["status"]) is int and 100 <= item["status"] <= 599 and
             type(item["expectedStatus"]) is int and 100 <= item["expectedStatus"] <= 599 and
             isinstance(item["contentType"], str) and len(item["contentType"]) <= 128 and
             (not item["contentType"] or re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+", item["contentType"])),
             "SMOKE_DIAGNOSTIC_VALUE")
        result[path] = dict(item)
    return result


def native_preview_proof(files):
    return {"files": files, "inlinePreviewEnabled": True, "packagedHttpBytes": True,
            "privateRuntimeUnauthorized": True, "publicRuntimeEnabled": True,
            "publicRuntimeBytesVerified": True, "publicRuntimeInvalidDigestDenied": True,
            "publicRuntimeInvalidNameDenied": True, "publicCatalogueIds": list(PUBLIC_CATALOGUE_IDS),
            "publicCatalogueUnknownIdDenied": True, "authenticatedStudioRender": False}


def verify_native_preview_proof(proof, files):
    need(proof == native_preview_proof(files), "SYNTHETIC_NATIVE_PREVIEW_NOT_QUALIFIED")


SMOKE_JS = r'''
const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto');
const origin='https://tadazz.com',routes={},nativeFiles=NATIVE_PREVIEW_FILES,packagePolicy=PACKAGE_PROBE_POLICY;
const publicCatalogueIds=PUBLIC_CATALOGUE_IDS;
const expectedScopes=EXPECTED_MCP_SCOPES,expectedChallenge=EXPECTED_MCP_CHALLENGE;
let failureCode='SMOKE_PROBE_FAILED';
function req(path,status=200,method='GET',body){return new Promise((resolve,reject)=>{
const q=http.request({host:'127.0.0.1',port:3000,path,method,
 headers:{Host:'tadazz.com',...(body?{'Content-Type':'text/plain;charset=UTF-8'}:{})},timeout:2500},r=>{
 let chunks=[],size=0;r.on('data',b=>{size+=b.length;if(size>8*1024*1024){q.destroy();reject(Error('limit'));}else chunks.push(b)});
 r.on('end',()=>{routes[method+' '+path.split('?')[0]]={status:r.statusCode,expectedStatus:status,contentType:String(r.headers['content-type']??'').split(';')[0].trim().toLowerCase()};
 if(r.statusCode!==status)return reject(Error('status'));const value={body:Buffer.concat(chunks),headers:r.headers};resolve(value)});
});q.on('timeout',()=>q.destroy(Error('timeout')));q.on('error',reject);q.end(body);});}
async function json(path,status=200){const r=await req(path,status);if(!r.headers['content-type']?.startsWith('application/json'))throw Error('type');return JSON.parse(r.body);}
const ok=(v,code='SMOKE_PROBE_FAILED')=>{if(!v){failureCode=code;throw Error('probe')}}, hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
let ready=false;for(let i=0;i<120;i++){try{ready=(await json('/api/health')).status==='ok';if(ready)break}catch{}await new Promise(r=>setTimeout(r,250))}ok(ready);
ok((await json('/api/auth/mode')).accountsEnabled===true);ok((await json('/api/billing/config')).enabled===false);
for(const p of ['/api/billing','/api/quizz','/api/results','/api/accounts/me'])await req(p,401);
ok(packagePolicy.accountsEnabled===true&&process.env.TADAZZ_ACCOUNTS_ENABLED==='true'&&packagePolicy.installerEnabled===(process.env.TADAZZ_PACKAGE_INSTALLER_ENABLED==='true'));
ok(packagePolicy.expectedStatus===(packagePolicy.installerEnabled?401:404));
const capabilities=await json('/api/packages/capabilities',packagePolicy.expectedStatus);
ok(capabilities?.error===(packagePolicy.installerEnabled?'errors:auth.unauthorized':'not-found')&&Object.keys(capabilities).length===1);
const packageCapabilities={...packagePolicy,...routes['GET /api/packages/capabilities']};
const resource=await json('/.well-known/oauth-protected-resource');ok(resource.resource===origin+'/mcp'&&JSON.stringify(resource.authorization_servers)===JSON.stringify([origin+'/oauth']));
ok(JSON.stringify(resource.scopes_supported)===JSON.stringify(expectedScopes),'RESOURCE_SCOPES_MISMATCH');
const issuer=await json('/.well-known/oauth-authorization-server/oauth');ok(issuer.issuer===origin+'/oauth'&&issuer.authorization_endpoint===origin+'/oauth/authorize'&&issuer.token_endpoint===origin+'/oauth/token'&&issuer.code_challenge_methods_supported.includes('S256'));
ok(JSON.stringify(issuer.scopes_supported)===JSON.stringify(expectedScopes),'ISSUER_SCOPES_MISMATCH');
const key=crypto.createPublicKey(JSON.parse(fs.readFileSync('/app/config/extensions/mcp-service/runtime.json')).signingPrivateKeyPem).export({format:'jwk'});
const jwks=await json('/oauth/jwks.json');ok(jwks.keys?.length===1&&jwks.keys[0].x===key.x&&jwks.keys[0].crv==='Ed25519'&&!('d'in jwks.keys[0]));
const mcp=await req('/mcp',401);ok(mcp.headers['www-authenticate']===expectedChallenge,'MCP_CHALLENGE_MISMATCH');ok(mcp.headers['content-type'].startsWith('application/json'));JSON.parse(mcp.body);
for(const p of ['/studio/oauth-consent?oauth_request=stage-smoke','/studio/native-save-consent/'+'a'.repeat(54)])for(const method of ['GET','HEAD']){
 const r=await req(p,200,method);ok(r.headers['content-type'].startsWith('text/html')&&r.headers['cache-control']==='no-store'&&r.headers['x-frame-options']==='DENY'&&r.headers['referrer-policy']==='no-referrer'&&r.headers['content-security-policy'].includes("frame-ancestors 'none'"));ok(method==='GET'?r.body.length>0:r.body.length===0);}
const index=fs.readFileSync('/app/web/index.html');ok(hash((await req('/')).body)===hash(index));
const assets=[...new Set([...index.toString().matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+)/g)].map(m=>m[1]))];ok(assets.length>0&&assets.length<100);
for(const p of assets)ok(hash((await req(p)).body)===hash(fs.readFileSync('/app/web'+p)));
ok(process.env.TADAZZ_INLINE_GAME_PREVIEW_ENABLED==='true'&&process.env.TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED!=='false');
const catalogue=await json('/api/extensions/catalogue');
ok(catalogue&&Object.keys(catalogue).length===1&&Array.isArray(catalogue.games)&&JSON.stringify(catalogue.games.map(g=>g?.id))===JSON.stringify(publicCatalogueIds));
ok(JSON.stringify(await json('/api/extensions/preview/public/unknown-release-example',404))===JSON.stringify({error:'Preview unavailable'}));
for(const f of nativeFiles){
 const b=fs.readFileSync('/app/web/tadazz-application-runtime/'+f.name);ok(b.length===f.bytes&&hash(b)===f.sha256);
 const r=await req('/tadazz-application-runtime/'+f.name);ok(r.body.length===f.bytes&&hash(r.body)===f.sha256);
 await req('/api/extensions/preview/runtime/'+f.sha256+'/'+f.name,401);
 const p=await req('/api/extensions/preview/public-runtime/'+f.sha256+'/'+f.name);
 ok(p.body.length===f.bytes&&hash(p.body)===f.sha256&&p.headers['cache-control']==='no-store'&&p.headers['x-content-type-options']==='nosniff'&&p.headers['content-type']?.startsWith(f.name.endsWith('.css')?'text/css':'text/javascript'));
 const wrongDigest=(f.sha256[0]==='0'?'1':'0')+f.sha256.slice(1);
 for(const suffix of [wrongDigest+'/'+f.name,f.sha256+'/unreviewed-runtime.mjs'])
  ok(JSON.stringify(await json('/api/extensions/preview/public-runtime/'+suffix,404))===JSON.stringify({error:'Preview unavailable'}));
}
const nativeApplicationPreview={files:nativeFiles,inlinePreviewEnabled:true,packagedHttpBytes:true,privateRuntimeUnauthorized:true,publicRuntimeEnabled:true,publicRuntimeBytesVerified:true,publicRuntimeInvalidDigestDenied:true,publicRuntimeInvalidNameDenied:true,publicCatalogueIds,publicCatalogueUnknownIdDenied:true,authenticatedStudioRender:false};
const query='/ws/?EIO=4&transport=polling&t=stage-smoke';const packet=(await req(query)).body.toString();ok(packet[0]==='0');const handshake=JSON.parse(packet.slice(1));ok(/^[A-Za-z0-9_-]{1,256}$/.test(handshake.sid));await req(query+'&sid='+handshake.sid,200,'POST','1');
process.stdout.write(JSON.stringify({ok:true,routes,engineIoOpenClose:true,indexAndEntryAssets:assets.length,nativeApplicationPreview,packageCapabilities}));
})().catch(()=>{process.stdout.write(JSON.stringify({ok:false,routes,failureCode}));process.exitCode=1});
'''


def synthetic_smoke(stage, image, revision, suffix, native_files):
    private = stage / "evidence/synthetic-config"
    runtime = private / "extensions/mcp-service/runtime.json"
    key = run(["openssl", "genpkey", "-algorithm", "ed25519"])
    config = {"version": 1, "origin": ORIGIN, "keyId": "stage-synthetic-" + suffix,
              "signingPrivateKeyPem": key.decode(),
              "ticketEncryptionKey": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("="),
              "clients": [{"clientId": "stage-synthetic-only", "redirectUris": ["https://example.invalid/callback"],
                           "scopes": ["tadazz.catalog.read", "tadazz.drafts.read", "tadazz.drafts.write"]}]}
    write_json(runtime, config)
    for directory in (private, private / "extensions", runtime.parent):
        os.chmod(directory, 0o700)
    name = "tadazz-mcp-stage-smoke-" + suffix
    environment = {"CONFIG_PATH": "/app/config", "SOCKET_PORT": "3001", "NODE_ENV": "production",
                   "TMPDIR": "/tmp", "TADAZZ_MCP_SERVICE_ENABLED": "true", "TADAZZ_ACCOUNTS_ENABLED": "true",
                   "TADAZZ_INLINE_GAME_PREVIEW_ENABLED": "true",
                   "JWT_SECRET": "synthetic-stage-" + secrets.token_hex(32),
                   "RESEND_API_KEY": "qa-no-network", "TADAZZ_AUTH_EMAIL_FROM": "qa@example.invalid"}
    command = ["docker", "create", "--pull=never", "--name", name, "--network", "none",
               "--cpus", "1", "--memory", "1g", "--memory-swap", "1g", "--pids-limit", "256",
               "--log-opt", "max-size=5m", "--log-opt", "max-file=1",
               "--label", "com.tadazz.mcp.staging=" + suffix,
               "--mount", f"type=bind,source={private},target=/app/config"]
    for item, value in environment.items():
        command += ["--env", item + "=" + value]
    command += [image]
    identifier = run(command).decode().strip()
    result = {"image": image, "sourceSha": revision, "productionTouched": False,
              "customerMountUsed": False, "network": "none", "container": identifier, "ok": False}
    try:
        facts = docker_inspect("container", identifier)
        need(facts["Image"] == image and facts["HostConfig"]["NetworkMode"] == "none" and
             not facts["HostConfig"].get("PortBindings"), "SMOKE_CONTAINER_NOT_ISOLATED")
        mounts = facts["Mounts"]
        need(len(mounts) == 1 and mounts[0]["Source"] == str(private) and
             mounts[0]["Destination"] == "/app/config" and mounts[0]["RW"] is True,
             "SMOKE_MOUNTS_NOT_ISOLATED")
        policy = package_probe_policy(facts)
        result["packagePolicy"] = policy
        run(["docker", "start", identifier])
        program = SMOKE_JS.replace("NATIVE_PREVIEW_FILES", json.dumps(native_files)).replace(
            "PUBLIC_CATALOGUE_IDS", json.dumps(PUBLIC_CATALOGUE_IDS)).replace(
            "PACKAGE_PROBE_POLICY", json.dumps(policy)).replace(
            "EXPECTED_MCP_SCOPES", json.dumps(MCP_SCOPES)).replace(
            "EXPECTED_MCP_CHALLENGE", json.dumps(MCP_CHALLENGE))
        completed = subprocess.run(["docker", "exec", "-i", identifier, "node", "-"],
                                   input=program.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=65)
        result["probeExitCode"] = completed.returncode
        result["probeStderrBytes"] = len(completed.stderr)
        result["probeStderrSha256"] = digest(completed.stderr)
        need(len(completed.stdout) <= 8 * 1024 * 1024, "SMOKE_PROBE_OUTPUT_LIMIT")
        try:
            probe = json.loads(completed.stdout)
        except (ValueError, UnicodeError):
            raise GateError("SMOKE_PROBE_OUTPUT_INVALID") from None
        need(isinstance(probe, dict), "SMOKE_PROBE_OUTPUT_INVALID")
        # Capture only bounded status metadata before rejecting a failed process.
        # Response bodies, headers, stderr text and URL queries are never retained.
        result["routes"] = safe_probe_routes(probe.get("routes", {}))
        if "failureCode" in probe:
            need(probe["failureCode"] in ("SMOKE_PROBE_FAILED", "RESOURCE_SCOPES_MISMATCH",
                                          "ISSUER_SCOPES_MISMATCH", "MCP_CHALLENGE_MISMATCH"),
                 "SMOKE_PROBE_FAILURE_CODE_INVALID")
            result["probeFailureCode"] = probe["failureCode"]
        need(completed.returncode == 0, "SYNTHETIC_SMOKE_PROCESS_FAILED")
        for field in ("ok", "engineIoOpenClose", "indexAndEntryAssets", "nativeApplicationPreview", "packageCapabilities"):
            if field in probe:
                result[field] = probe[field]
        need(result["ok"] is True, "SYNTHETIC_SMOKE_FAILED")
        need(result.get("packageCapabilities") == {**policy, "status": policy["expectedStatus"],
                                                   "contentType": "application/json"}, "SMOKE_PACKAGE_POLICY_MISMATCH")
        verify_native_preview_proof(result.get("nativeApplicationPreview"), native_files)
    except BaseException as error:
        result["failureCode"] = str(error) if isinstance(error, GateError) else type(error).__name__
        raise
    finally:
        if docker_inspect("container", identifier)["State"]["Running"]:
            run(["docker", "stop", "--time", "30", identifier], timeout=40)
        result["retainedStopped"] = not docker_inspect("container", identifier)["State"]["Running"]
        write_json(stage / "synthetic-smoke-result.json", result)
    return result


def qualify_inputs(args):
    need(re.fullmatch(r"[a-f0-9]{40}", args.revision), "REVISION_NOT_EXACT")
    for value in (args.source_run, args.web_source_run):
        need(re.fullmatch(r"tadazz-codex-" + args.revision[:12] + r"-[a-f0-9]{8}", value), "SOURCE_RUN_NOT_EXACT")
    source = plain(EVIDENCE_ROOT / args.source_run / "source", directory=True)
    web_source = plain(EVIDENCE_ROOT / args.web_source_run / "source", directory=True)
    receipts = {key: json_file(getattr(args, key + "_receipt"))
                for key in ("host", "launch", "web", "browser", "full_show", "proxy", "originals")}
    required = {"native-http", "native-types", "native-lint", "native-format"}
    manifest = matrix_receipt(receipts["host"], args.revision, args.source_run, "native-launch",
                              required | {"native-widget-build", "native-launch-build", "native-site-build"} | SEMANTIC_REQUIRED_CHECKS | NATIVE_APP_CHECKS)
    if receipts["web"].get("suite") == "native-launch":
        need(args.web_source_run == args.source_run and receipts["web"] == receipts["host"],
             "REUSED_WEB_MATRIX_NOT_IDENTICAL")
        other = manifest
    else:
        other = matrix_receipt(receipts["web"], args.revision, args.web_source_run, "native-consent",
                               required | {"native-widget-build", "native-site-build"} | NATIVE_APP_CHECKS)
    need(manifest == other, "SOURCE_INPUTS_DIFFER")
    verify_source(source, manifest)
    if web_source != source:
        verify_source(web_source, manifest)
    built = plain(EVIDENCE_ROOT / args.source_run / "fixtures/native-host-build", directory=True)
    artifact = json_file(built / "artifact.json")
    backend = read_bytes(built / "index.cjs")
    need(artifact.get("format") == "tadazz-native-host-artifact" and artifact.get("version") == 1 and
         artifact.get("bytes") == len(backend) and artifact.get("sha256") == digest(backend), "BACKEND_PIN_MISMATCH")
    widget_root = source / "extensions/src/mcp-app/widget/dist"
    widget_bytes = read_bytes(widget_root / "full-show-artifact.json")
    widget = json.loads(widget_bytes)
    widget_html = read_bytes(widget_root / "full-show.html", 4000000)
    widget_pin = digest(widget_bytes)
    need(artifact.get("fullShowManifestSha256") == widget_pin and widget.get("sha256") == digest(widget_html) and
         widget.get("bytes") == len(widget_html), "BACKEND_WIDGET_PIN_MISMATCH")
    need(widget.get("origin") == ORIGIN and widget.get("resourceUri") == "ui://tadazz/full-show/v3.html" and
         widget.get("mimeType") == "text/html;profile=mcp-app" and
         widget.get("csp") == {"connectDomains": [ORIGIN], "resourceDomains": [ORIGIN],
                               "frameDomains": [], "baseUriDomains": [ORIGIN]}, "WIDGET_RESOURCE_POLICY_MISMATCH")
    need(widget.get("rendererBuildId") == digest(json.dumps(widget["physicalSources"], ensure_ascii=False,
                                                           separators=(",", ":")).encode()), "WIDGET_BUILD_ID_MISMATCH")
    for group in ("physicalSources", "publicAssets"):
        entries = widget.get(group)
        need(isinstance(entries, list) and entries and len({e["path"] for e in entries}) == len(entries), "WIDGET_INPUTS_EMPTY")
        for entry in entries:
            relative = safe_relative(entry["path"])
            need(manifest.get(entry["path"]) == entry["sha256"] and
                 len(read_bytes(source.joinpath(*relative.parts))) == entry["bytes"], "WIDGET_SOURCE_MISMATCH")
    need({e["path"] for e in widget["publicAssets"]} == {p for p in manifest if p.startswith("packages/web/public/")},
         "WIDGET_PUBLIC_ASSET_INVENTORY_MISMATCH")
    launcher = receipts["launch"]
    need(launcher.get("sha") == args.revision and launcher.get("exit") == 0 and
         launcher.get("network") == "none" and launcher.get("allSourceHashesVerifiedBeforeAfter") is True and
         launcher.get("artifactHashUnchanged") is True and launcher.get("artifact") == artifact,
         "LAUNCH_GATE_MISMATCH")
    no_live_data(launcher, "customerDataAccessed")
    tap_success(launcher.get("stdout", ""))
    pinned_widget = launcher.get("widgetArtifact", {})
    need(pinned_widget.get("manifestSha256") == widget_pin and pinned_widget.get("htmlSha256") == widget["sha256"] and
         pinned_widget.get("readOnlyMountsVerified") is True and pinned_widget.get("hashesUnchanged") is True,
         "LAUNCH_WIDGET_PIN_MISMATCH")
    browser = receipts["browser"]
    need(browser.get("sha") == args.revision and browser.get("sourceRun") == args.web_source_run and
         browser.get("exit") == 0 and browser.get("network") == "none" and browser.get("sourceReadOnly") is True and
         browser.get("allSourceHashesVerifiedBeforeAfter") is True and browser.get("sdkCacheHashesVerifiedBeforeAfter") is True and
         browser.get("webArtifactsUnchanged") is True and browser.get("widgetArtifactsUnchanged") is True and
         browser.get("widgetManifestSha256") == widget_pin and browser.get("widgetHtmlSha256") == widget["sha256"],
         "NATIVE_BROWSER_GATE_MISSING")
    no_live_data(browser)
    output = browser.get("stdout", "")
    need(re.search(r"\b[1-9][0-9]* passed\b", output) and not re.search(r"\b[1-9][0-9]* (?:failed|skipped|flaky)\b", output),
         "NATIVE_BROWSER_NOT_ALL_PASSED")
    for engine in ("chromium", "webkit"):
        for scenario in ("authenticated browser flow", "direct saves enforce ownership, exact revision, idempotency and grant revocation", "directly saved games are accessible in Studio across all 9 locales"):
            need(any("[" + engine + "]" in line and scenario in line and "✓" in line for line in output.splitlines()),
                 "NATIVE_BROWSER_SCENARIO_MISSING")
    web_root = web_source / "packages/web/dist"
    web_files = tree(web_root)
    need(web_files == browser.get("webArtifacts") and "index.html" in web_files, "BROWSER_WEB_BYTES_MISMATCH")
    native_root = source / "extensions/dist/application-preview"
    native_bundle = {"manifestBytes": read_bytes(source / NATIVE_APP_MANIFEST),
                     "artifactBytes": read_bytes(native_root / "artifact.json"),
                     "registryBytes": read_bytes(native_root / "registry.json"),
                     "verification": json_file(native_root / "verification.json")}
    native_application = verify_application_metadata(native_bundle, manifest, artifact, web_files)
    for pin in native_application["files"]:
        actual = read_bytes(native_root / pin["name"])
        need(len(actual) == pin["bytes"] and digest(actual) == pin["sha256"], "NATIVE_APPLICATION_RUNTIME_CHANGED")
    package_check = next(check for check in receipts["host"]["checks"] if check["label"] == "native-application-package")
    package_proof = json.loads(package_check["stdout"])
    need(package_proof.get("format") == "tadazz-phase2-cjs-package-probe" and
         package_proof.get("admittedFiles") == native_application["files"] and
         all(package_proof.get(key) is True for key in ("packagedBytesEqual", "cjsLoader", "invalidHashAndCorruptionDenied", "traversalDenied")),
         "NATIVE_APPLICATION_PACKAGE_PROOF_MISMATCH")
    for asset in widget["publicAssets"]:
        relative = asset["path"].removeprefix("packages/web/public/")
        need(web_files.get(relative) == {"sha256": asset["sha256"], "bytes": asset["bytes"]},
             "WEB_WIDGET_PUBLIC_ASSET_MISMATCH")
    verify_fullshow(receipts["full_show"], args.revision, widget_pin, widget)
    verify_proxy(receipts["proxy"], (args.revision, args.source_run, manifest, args.base_image,
                                    receipts["full_show"].get("sdkCacheManifestSha256")))
    originals = verify_originals(receipts["originals"], args.revision, args.source_run, manifest,
                                 {"web": web_files, "widget": tree(widget_root),
                                  "application": tree(native_root), "backend": tree(built)})
    return {"source": source, "webSource": web_source, "manifest": manifest, "built": built,
            "artifact": artifact, "widget": widget, "widgetPin": widget_pin, "widgetRoot": widget_root,
            "webRoot": web_root, "webFiles": web_files, "receipts": receipts,
            "nativeApplication": native_application, "nativeRoot": native_root, "originalThemes": originals}


def stage_release(args):
    need(os.name == "posix" and os.geteuid() == 0, "LINUX_ROOT_REQUIRED")
    need(args.base_image == BASE_IMAGE, "UNREVIEWED_BASE_IMAGE")
    need(re.fullmatch(r"/home/ubuntu/tadazz-mcp-(?:candidate|release)-[a-zA-Z0-9-]+", args.release_dir), "RELEASE_PATH_REJECTED")
    image_tag = re.fullmatch(r"tadazz:mcp-([a-f0-9]{7,40})-[0-9]{8}(?:-[a-f0-9]{1,8})?", args.image)
    need(image_tag and args.revision.startswith(image_tag.group(1)), "IMAGE_TAG_REJECTED")
    stage = Path(args.release_dir)
    need(not os.path.lexists(stage), "RELEASE_ALREADY_EXISTS")
    plain(stage.parent, directory=True)
    need(shutil.disk_usage(stage.parent).free > 2 * 1024**3, "INSUFFICIENT_STAGING_SPACE")
    inputs = qualify_inputs(args)
    base = docker_inspect("image", args.base_image)
    need(base["Id"] == BASE_IMAGE and base.get("Os") == "linux" and base.get("Architecture") == "arm64", "BASE_IMAGE_MISMATCH")
    # Refuse even a reversible tag overwrite: every candidate remains reviewable.
    probe = subprocess.run(["docker", "image", "inspect", args.image], capture_output=True, timeout=15)
    need(probe.returncode != 0, "IMAGE_TAG_ALREADY_EXISTS")
    before = running_snapshot()
    stage.mkdir(mode=0o700)
    report = {"sourceSha": args.revision, "productionTouched": False, "customerMountUsed": False,
              "ok": False, "releaseDir": str(stage)}
    suffix = args.revision[:12] + "-" + uuid.uuid4().hex[:8]
    try:
        evidence = stage / "evidence"
        evidence.mkdir(mode=0o700)
        for name, receipt in inputs["receipts"].items():
            write_json(evidence / (name + "-receipt.json"), receipt)
        for name, pin in (("artifact.json", inputs["nativeApplication"]["artifactSha256"]),
                          ("registry.json", inputs["nativeApplication"]["registrySha256"])):
            copy_pinned(inputs["nativeRoot"] / name, evidence / ("native-application-" + name), pin)
        copy_pinned(inputs["source"] / NATIVE_APP_MANIFEST, evidence / "native-application-build.json",
                    inputs["nativeApplication"]["manifestSha256"])
        copy_pinned(inputs["built"] / "index.cjs", stage / "socket/index.cjs",
                    inputs["artifact"]["sha256"], inputs["artifact"]["bytes"])
        copy_pinned(inputs["widgetRoot"] / "full-show.html", stage / "mcp/full-show.html",
                    inputs["widget"]["sha256"], inputs["widget"]["bytes"])
        copy_pinned(inputs["widgetRoot"] / "full-show-artifact.json", stage / "mcp/full-show-artifact.json", inputs["widgetPin"])
        nginx_source = "extensions/deployment/nginx-mcp-routes.conf"
        copy_pinned(inputs["source"] / nginx_source, stage / "nginx/mcp-routes.conf", inputs["manifest"][nginx_source])
        for name, spec in inputs["webFiles"].items():
            data = read_bytes(inputs["webRoot"] / name)
            need(digest(data) == spec["sha256"] and len(data) == spec["bytes"], "WEB_CHANGED_DURING_COPY")
            write_new(stage / "web" / name, data)
        extractor = "tadazz-mcp-stage-base-" + suffix
        run(["docker", "create", "--pull=never", "--network", "none", "--name", extractor,
             "--label", "com.tadazz.mcp.staging=" + suffix, args.base_image])
        run(["docker", "cp", extractor + ":/etc/nginx/http.d/default.conf", str(stage / "nginx/default-original.conf")])
        original = read_bytes(stage / "nginx/default-original.conf", 65536).decode()
        need(original.count("server {") == 1 and "mcp-routes.conf" not in original and
             "root /app/web;" in original and "listen 3000;" in original and
             "include /etc/nginx/tadazz/server.conf;" in original, "BASE_NGINX_SHAPE_CHANGED")
        os.chmod(stage / "nginx/default-original.conf", 0o600)
        write_new(stage / "nginx/default.conf", original.replace("server {", "server {\n    include /etc/nginx/tadazz/mcp-routes.conf;", 1).encode())
        write_new(stage / "nginx/000-mcp-upstream.conf", b"upstream tadazz_native_mcp { server 127.0.0.1:3001; }\n")
        dockerfile = f'''FROM {args.base_image}
LABEL org.opencontainers.image.revision={args.revision}
LABEL com.tadazz.mcp.channel=private
ENV TADAZZ_MCP_SERVICE_ENABLED=true
ENV TADAZZ_INLINE_GAME_PREVIEW_ENABLED=true
COPY web/ /app/web/
COPY socket/index.cjs /app/socket/index.cjs
COPY mcp/ /app/mcp/
COPY nginx/default.conf /etc/nginx/http.d/default.conf
COPY nginx/mcp-routes.conf /etc/nginx/tadazz/mcp-routes.conf
COPY nginx/000-mcp-upstream.conf /etc/nginx/http.d/000-mcp-upstream.conf
RUN chmod -R a+rX /app/web && chmod 600 /app/socket/index.cjs /app/mcp/full-show.html /app/mcp/full-show-artifact.json && nginx -t
'''
        write_new(stage / "Dockerfile", dockerfile.encode())
        write_new(stage / ".dockerignore", b"evidence/\n*-result.json\nstage-manifest.json\n")
        payload = {name: spec for name, spec in tree(stage).items() if not name.startswith("evidence/")}
        environment = {**os.environ, "DOCKER_BUILDKIT": "0"}
        run(["docker", "build", "--pull=false", "--network=none", "--memory=1g", "--memory-swap=1g",
             "--cpuset-cpus=0", "--tag", args.image, str(stage)], timeout=900,
             log=evidence / "docker-build.log", env=environment)
        built_image = docker_inspect("image", args.image)
        need(built_image["Config"].get("Labels", {}).get("org.opencontainers.image.revision") == args.revision,
             "BUILT_IMAGE_REVISION_MISMATCH")
        need(built_image.get("Os") == "linux" and built_image.get("Architecture") == "arm64", "BUILT_IMAGE_PLATFORM_MISMATCH")
        verify_source(inputs["source"], inputs["manifest"])
        need(tree(inputs["webRoot"]) == inputs["webFiles"], "WEB_CHANGED_DURING_BUILD")
        smoke = synthetic_smoke(stage, built_image["Id"], args.revision, suffix, inputs["nativeApplication"]["files"])
        need({name: spec for name, spec in tree(stage).items() if name in payload} == payload,
             "STAGED_PAYLOAD_CHANGED")
        stage_manifest = {
            "format": "tadazz-mcp-stage", "version": 2, "sourceSha": args.revision,
            "sourceRun": args.source_run, "webSourceRun": args.web_source_run,
            "baseImage": args.base_image, "image": args.image, "imageId": built_image["Id"],
            "backendSha256": inputs["artifact"]["sha256"],
            "widgetManifestSha256": inputs["widgetPin"], "widgetHtmlSha256": inputs["widget"]["sha256"],
            "rendererBuildId": inputs["widget"]["rendererBuildId"],
            "nativeApplicationPreview": inputs["nativeApplication"],
            "originalThemes": inputs["originalThemes"],
            "publicAssetCount": len(inputs["widget"]["publicAssets"]),
            "artifacts": {name: spec["sha256"] for name, spec in payload.items()},
            "artifactBytes": {name: spec["bytes"] for name, spec in payload.items()},
            "receiptSha256": {name: digest(read_bytes(evidence / (name + "-receipt.json"))) for name in inputs["receipts"]},
            "syntheticSmokeSha256": digest(read_bytes(stage / "synthetic-smoke-result.json")),
            "productionTouched": False, "customerMountUsed": False, "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        write_json(stage / "stage-manifest.json", stage_manifest)
        need(running_snapshot() == before, "RUNNING_CONTAINERS_CHANGED")
        report.update(ok=True, image=args.image, imageId=built_image["Id"],
                      stageManifestSha256=digest(read_bytes(stage / "stage-manifest.json")),
                      backendSha256=inputs["artifact"]["sha256"], widgetManifestSha256=inputs["widgetPin"],
                      payloadFiles=len(payload), syntheticSmokePassed=smoke["ok"], runningContainersUnchanged=True)
    except Exception as error:
        report["error"] = str(error) if isinstance(error, GateError) else type(error).__name__
        report["runningContainersUnchanged"] = running_snapshot() == before
        raise
    finally:
        write_json(stage / "stage-result.json", report)
        print(json.dumps(report, sort_keys=True))


def self_test_lint_policy_gates(sample, legacy_report):
    value = json.loads(json.dumps(sample))
    value.update(sha="c" * 40, source="/source", fixture="/evidence/test/fixtures")
    value["hashesAfter"] = dict(value["hashesBefore"])
    for key in ("hashesBefore", "hashesAfter"):
        value["lintBaseline"][key]["oxlint.config.ts"] = "b" * 64
    report = json.loads(json.dumps(legacy_report))
    report["baselineHashes"]["oxlint.config.ts"] = "b" * 64
    common = {
        "configFile": LINT_POLICY_CONFIG, "sourcePath": "oxlint.config.ts", "sha256": "a" * 64,
        "hashesBefore": {"baseline": "a" * 64, "candidate": "a" * 64},
        "hashesAfter": {"baseline": "a" * 64, "candidate": "a" * 64},
    }
    report["effectivePolicy"] = json.loads(json.dumps(common))
    report["workingDirectories"] = {"baseline": "/lint-baseline", "candidate": "/source"}
    report["command"][4] = LINT_POLICY_CONFIG
    value["lintPolicy"] = dict(common, sourceSha=value["sha"], sourceReadOnly=True)
    gate = value["checks"][-1]
    gate["command"] = ["python3", "extensions/qa/phase3-recovery/lint-baseline.py",
                       "--baseline-root", "/lint-baseline", "--current-root", "/source",
                       "--baseline-sha", LINT_BASELINE_SHA,
                       "--output", "/evidence/test/fixtures/semantic-lint-baseline-1234abcd",
                       "--policy-sha256", "a" * 64]
    gate["stdout"] = json.dumps(report)
    verify_semantic_matrix(value)
    witnessed = ["same-effective-policy-with-preserved-original-configs"]
    for failure in ("policy-missing-inner-proof", "policy-missing-controller-proof", "policy-controller-mutation",
                    "policy-inner-mutation", "policy-not-candidate-config", "policy-source-revision",
                    "policy-source-not-readonly", "policy-source-config-mutated", "policy-baseline-config-rewritten",
                    "policy-absolute-config-command", "policy-wrong-cwd", "policy-missing-flag",
                    "policy-duplicate-flag", "policy-wrong-pin-flag", "policy-wrong-baseline-root",
                    "policy-wrong-interpreter", "policy-unowned-output", "policy-extra-diagnostic"):
        changed = json.loads(json.dumps(value))
        result = json.loads(changed["checks"][-1]["stdout"])
        argv = changed["checks"][-1]["command"]
        if failure == "policy-missing-inner-proof":
            result.pop("effectivePolicy")
        elif failure == "policy-missing-controller-proof":
            changed.pop("lintPolicy")
        elif failure == "policy-controller-mutation":
            changed["lintPolicy"]["hashesAfter"]["baseline"] = "d" * 64
        elif failure == "policy-inner-mutation":
            result["effectivePolicy"]["hashesAfter"]["candidate"] = "d" * 64
        elif failure == "policy-not-candidate-config":
            for proof in (result["effectivePolicy"], changed["lintPolicy"]):
                proof["sha256"] = "d" * 64
                proof["hashesBefore"] = proof["hashesAfter"] = {"baseline": "d" * 64, "candidate": "d" * 64}
        elif failure == "policy-source-revision":
            changed["lintPolicy"]["sourceSha"] = "d" * 40
        elif failure == "policy-source-not-readonly":
            changed["lintPolicy"]["sourceReadOnly"] = False
        elif failure == "policy-source-config-mutated":
            changed["hashesAfter"]["oxlint.config.ts"] = "d" * 64
        elif failure == "policy-baseline-config-rewritten":
            result["baselineHashes"]["oxlint.config.ts"] = "a" * 64
        elif failure == "policy-absolute-config-command":
            result["command"][4] = "/source/" + LINT_POLICY_CONFIG
        elif failure == "policy-wrong-cwd":
            result["workingDirectories"]["baseline"] = "/source"
        elif failure == "policy-missing-flag":
            del argv[-2:]
        elif failure == "policy-duplicate-flag":
            argv.extend(["--policy-sha256", "a" * 64])
        elif failure == "policy-wrong-pin-flag":
            argv[-1] = "d" * 64
        elif failure == "policy-wrong-baseline-root":
            argv[3] = "/source"
        elif failure == "policy-wrong-interpreter":
            argv[0] = "echo"
        elif failure == "policy-unowned-output":
            argv[9] = "/source/semantic-lint-baseline-1234abcd"
        elif failure == "policy-extra-diagnostic":
            result.update(unmatchedCount=1, gatePass=False)
        changed["checks"][-1]["stdout"] = json.dumps(result)
        try:
            verify_semantic_matrix(changed)
        except GateError:
            witnessed.append(failure)
        else:
            raise AssertionError("Invalid effective policy accepted: " + failure)
    return witnessed


def self_test_semantic_gates():
    pins = {path: "a" * 64 for path in (*LEGACY_LINT_FILES, "oxlint.config.ts")}
    report = {
        "baselineSha": LINT_BASELINE_SHA, "files": list(LEGACY_LINT_FILES),
        "gatePass": True, "sourceHashesUnchanged": True, "unmatchedCount": 0,
        "baselineDiagnosticCount": 431, "candidateDiagnosticCount": 431,
        "matchedInheritedCount": 431, "wholeLegacyLintPass": False,
        "candidateLintExit": 1, "baselineLintExit": 1,
        "baselineHashes": pins, "candidateHashes": pins,
        "command": ["node", "--experimental-strip-types", "/cleanup/node_modules/oxlint/bin/oxlint",
                    "-c", "oxlint.config.ts", "--format=json", *LEGACY_LINT_FILES],
    }
    sample = {
        "hashesBefore": pins,
        "lintBaseline": {"sha": LINT_BASELINE_SHA, "run": LINT_BASELINE_RUN,
                         "sourceReadOnly": True, "allHashesVerifiedBeforeAfter": True,
                         "sourceFileCount": len(pins), "hashesBefore": pins, "hashesAfter": pins},
        "checks": [
            {"label": "native-http", "command": ["node", "--test", *sorted(SEMANTIC_TEST_FILES)], "exit": 0},
            {"label": "semantic-types", "command": ["extensions/qa/phase3-full-show/tsconfig.json"], "exit": 0},
            {"label": "semantic-lint", "command": sorted(SEMANTIC_STRICT_FILES), "exit": 0},
            {"label": "semantic-format", "command": sorted(SEMANTIC_STRICT_FILES), "exit": 0},
            {"label": "full-show-widget-types", "command": ["node", "tsc", "--noEmit", "-p", "extensions/src/mcp-app/widget/tsconfig.json"], "exit": 0},
            {"label": "full-show-widget-lint", "command": sorted(WIDGET_STRICT_FILES), "exit": 0},
            {"label": "full-show-widget-format", "command": sorted(WIDGET_STRICT_FILES), "exit": 0},
            {"label": "semantic-integration-lint-baseline", "exit": 0,
             "command": ["extensions/qa/phase3-recovery/lint-baseline.py"], "stdout": json.dumps(report)},
        ],
    }
    verify_semantic_matrix(sample)
    witnessed = self_test_lint_policy_gates(sample, report)
    for name in ("protocol", "http", "access-token", "drafts", "integrity", "boundaries", "oauth-client-isolation"):
        folder = "extensions/qa/phase3-native-consent/" if name == "oauth-client-isolation" else "extensions/src/mcp-app/tests/server/"
        value = json.loads(json.dumps(sample))
        value["checks"][0]["command"].remove(folder + name + ".nodecheck.ts")
        try:
            verify_semantic_matrix(value)
        except GateError:
            witnessed.append("missing-protocol-security-" + name)
        else:
            raise AssertionError("Required protocol/security test omitted: " + name)
    for failure in ("missing-semantic-case", "filtered-tests", "changed-parent", "new-lint-diagnostic", "missing-strict-scope", "missing-widget-types", "wrong-widget-project", "missing-widget-viewport-lint", "missing-widget-native-port-lint"):
        value = json.loads(json.dumps(sample))
        if failure == "missing-semantic-case":
            value["checks"][0]["command"].remove("extensions/qa/phase3-full-show/semantic-edit.nodecheck.ts")
        elif failure == "filtered-tests":
            value["checks"][0]["command"].append("--test-name-pattern=one")
        elif failure == "changed-parent":
            value["lintBaseline"]["hashesAfter"]["oxlint.config.ts"] = "b" * 64
        elif failure == "new-lint-diagnostic":
            changed = dict(report, unmatchedCount=1, gatePass=False)
            value["checks"][-1]["stdout"] = json.dumps(changed)
        elif failure == "missing-widget-types":
            value["checks"] = [item for item in value["checks"] if item["label"] != "full-show-widget-types"]
        elif failure == "wrong-widget-project":
            next(item for item in value["checks"] if item["label"] == "full-show-widget-types")["command"][-1] = "extensions/qa/phase3-full-show/tsconfig.json"
        elif failure == "missing-widget-viewport-lint":
            next(item for item in value["checks"] if item["label"] == "full-show-widget-lint")["command"].remove("extensions/src/mcp-app/widget/native-stage-viewport.tsx")
        elif failure == "missing-widget-native-port-lint":
            next(item for item in value["checks"] if item["label"] == "full-show-widget-lint")["command"].remove("extensions/src/mcp-app/widget/native-photo-card-port.ts")
        else:
            value["checks"][2]["command"].remove("extensions/src/mcp-app/server/semantic-state.ts")
        try:
            verify_semantic_matrix(value)
        except GateError:
            witnessed.append(failure)
        else:
            raise AssertionError(failure + " accepted")
    revision, pin = "a" * 40, "b" * 64
    widget = {"sha256": "c" * 64, "rendererBuildId": "d" * 64}
    names = [f"{engine} / {family} {check}" for engine in ("chromium", "webkit")
             for family in ("tadazz-classic", "razzia-original") for check in FULL_SHOW_CHECKS]
    inner = {"sha": revision, "widgetManifestSha256": pin, "widgetHtmlSha256": widget["sha256"],
             "rendererBuildId": widget["rendererBuildId"], "failureCount": 0, "sourceHashesUnchanged": True,
             "network": "none", "outboundDenied": [], "productionChanged": False, "customerMountAccessed": False,
             "requiredChecks": names,
             "engines": [{"name": engine, "version": "test", "outcomes": [
                 {"name": name, "status": "PASS"} for name in names if name.startswith(engine + " /")
             ]} for engine in ("chromium", "webkit")]}
    inner["rendererFixtures"] = [
        {"engine": engine, "family": family, "id": name,
         "proof": "renderer-only-synthetic-fixture", "sourceFrameSha256": "e" * 64,
         "frameSha256": "f" * 64, "rendererBuildId": widget["rendererBuildId"],
         "definitionSha256": "0" * 64 if family == "tadazz-classic" else "1" * 64,
         "sourceModules": sorted(NATIVE_FIXTURE_SOURCES | NATIVE_FIXTURE_FAMILY_SOURCES[family]),
         "expected": {}, "observed": {"status": "PASS"}}
        for engine in ("chromium", "webkit") for family in ("tadazz-classic", "razzia-original")
        for name in sorted(NATIVE_FIXTURE_IDS)
    ]
    inner["observations"] = [
        {"engine": engine, "theme": family, "surface": surface,
         "check": "local demo answer selection and authorized reveal", "keyboard": "Enter on original native card",
         "noVoteMutation": True, "revisionPreserved": True, "revision": 6,
         "sourceDraftSha256": "e" * 64, "resultCounts": [0, 0, 0, 0, 0],
         "chosenOutcome": "correct", "resetAfterReplay": True, "resetAfterQuestionChange": True}
        for engine in ("chromium", "webkit") for family in ("tadazz-classic", "razzia-original")
        for surface in ("text", "five-pictures")
    ]
    inner["observations"] += [
        {"engine": engine, "theme": family, "proof": "synthetic-host-ui-control-fixture",
         "saveRequests": [{"contractVersion": "0.1.0", "draftId": "synthetic-draft-id-000001",
                           "expectedRevision": 6, "idempotencyKey": "synthetic-save-key-000001", "intent": "createNew"}
                          for _ in range(3)],
         "openedLinks": [ORIGIN + "/studio/native-save-consent/" + "S" * 54,
                         ORIGIN + "/manager/quizz/" + "Q" * 21],
         "displayRequests": ["fullscreen"], "unsupportedFeaturesHiddenOrDisabled": True, "draftUnchanged": True}
        for engine in ("chromium", "webkit") for family in ("tadazz-classic", "razzia-original")
    ]
    full = {"sha": revision, "exit": 0, "network": "none", "sourceReadOnly": True,
            "allSourceHashesVerifiedBeforeAfter": True, "allWidgetHashesVerifiedBeforeAfter": True,
            "sdkCacheHashesVerifiedBeforeAfter": True, "widgetManifestSha256": pin,
            "widgetHtmlSha256": widget["sha256"], "fullShow": inner}
    verify_fullshow(full, revision, pin, widget)
    for failure in ("missing", "actual-vote", "unacknowledged-revision"):
        value = json.loads(json.dumps(full))
        observations = value["fullShow"]["observations"]
        if failure == "missing":
            observations.pop(0)
        elif failure == "actual-vote":
            observations[0]["noVoteMutation"] = False
        else:
            observations[0]["revisionPreserved"] = 6
        try:
            verify_fullshow(value, revision, pin, widget)
        except GateError:
            witnessed.append("demo-answer-" + failure)
        else:
            raise AssertionError("Invalid demo answer proof accepted: " + failure)
    for failure in ("missing", "changed-retry", "unsafe-link", "malformed-request"):
        value = json.loads(json.dumps(full))
        observations = value["fullShow"]["observations"]
        target = next(item for item in observations if item.get("proof") == "synthetic-host-ui-control-fixture")
        if failure == "missing":
            observations.remove(target)
        elif failure == "changed-retry":
            target["saveRequests"][2]["idempotencyKey"] = "different-synthetic-key"
        elif failure == "malformed-request":
            for request in target["saveRequests"]:
                request["draftId"] = "a" * 21
                request["expectedRevision"] = 2_147_483_648
        else:
            target["openedLinks"][1] = "https://example.invalid/foreign"
        try:
            verify_fullshow(value, revision, pin, widget)
        except GateError:
            witnessed.append("host-controls-" + failure)
        else:
            raise AssertionError("Invalid synthetic host UI proof accepted: " + failure)
    for failure in ("missing", "duplicate", "issuer-claim", "wrong-artifact", "changed-theme", "wrong-native-path", "missing-native-port", "failed", "raw-frame"):
        value = json.loads(json.dumps(full))
        fixtures = value["fullShow"]["rendererFixtures"]
        if failure == "missing":
            fixtures.pop()
        elif failure == "duplicate":
            fixtures.append(fixtures[0])
        elif failure == "issuer-claim":
            fixtures[0]["proof"] = "actual-issuer-acceptance"
        elif failure == "wrong-artifact":
            fixtures[0]["rendererBuildId"] = "2" * 64
        elif failure == "changed-theme":
            fixtures[0]["definitionSha256"] = "3" * 64
        elif failure == "wrong-native-path":
            original = next(item for item in fixtures if item["family"] == "razzia-original")
            original["sourceModules"].remove("packages/web/src/features/game/components/PhotoCardGrid.tsx")
            original["sourceModules"].append("packages/web/src/features/game/components/AnswerButton.tsx")
        elif failure == "missing-native-port":
            original = next(item for item in fixtures if item["family"] == "razzia-original")
            original["sourceModules"].remove("extensions/src/mcp-app/widget/native-photo-card-port.ts")
        elif failure == "failed":
            fixtures[0]["observed"]["status"] = "FAIL"
        else:
            fixtures[0]["frame"] = {}
        try:
            verify_fullshow(value, revision, pin, widget)
        except GateError:
            witnessed.append("renderer-fixture-" + failure)
        else:
            raise AssertionError("Invalid renderer fixture evidence accepted: " + failure)
    misplaced = json.loads(json.dumps(full))
    misplaced["fullShow"]["engines"][0]["outcomes"].append(misplaced["fullShow"]["engines"][1]["outcomes"].pop())
    try:
        verify_fullshow(misplaced, revision, pin, widget)
    except GateError:
        witnessed.append("fullshow-wrong-engine-bucket")
    else:
        raise AssertionError("Required WebKit scenario accepted under Chromium")
    for suffix in (*FULL_SHOW_CHECKS[2:5], *FULL_SHOW_CHECKS[7:]):
        value = json.loads(json.dumps(full))
        value["fullShow"]["engines"][0]["outcomes"] = [outcome for outcome in value["fullShow"]["engines"][0]["outcomes"]
                                                       if not outcome["name"].endswith(suffix)]
        try:
            verify_fullshow(value, revision, pin, widget)
        except GateError:
            witnessed.append("missing-fullshow-" + suffix)
        else:
            raise AssertionError("Required full-show scenario omitted")
    return witnessed


def self_test_application_gate():
    compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    packed = lambda value: (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    entry = "extensions/src/presentation/show-library-preview/application-runtime-entry.tsx"
    files = [{"name": name, "bytes": len(name), "sha256": digest(name.encode())}
             for name in ("renderer.mjs", "renderer.css")]
    registry = {"id": "tadazz-native-application", "version": "1.0.0"}
    artifact = {"format": "tadazz-first-party-application-renderer", "files": files,
                "source": [{"path": entry, "sha256": "c" * 64}],
                "toolchain": {"buildScriptSha256": "a" * 64, "lockfileSha256": "b" * 64}}
    native = {"format": "tadazz-application-preview-build", "available": True, "files": files,
              "pins": [{"portVersion": 3, "identityRuleVersion": 2, "registry": registry,
                        "registrySha256": digest(compact(registry)), "renderer": {"id": renderer, "version": "1.0.0"},
                        "rendererBuildSha256": digest(compact(artifact))}
                       for renderer in NATIVE_APPLICATION_RENDERERS]}
    raw, artifact_raw, registry_raw = packed(native), packed(artifact), packed(registry)
    verification = {"format": "tadazz-application-preview-verification", "mode": "verify-manifest",
                    "verifiedManifest": True, "generatedSourceChanged": False, "liveAuthorityInputs": [],
                    "productionChanged": False, "manifestSha256": digest(raw), "artifactSha256": digest(artifact_raw),
                    "registrySha256": digest(registry_raw), "files": files, "inputFiles": 1}
    bundle = {"manifestBytes": raw, "artifactBytes": artifact_raw, "registryBytes": registry_raw,
              "verification": verification}
    source = {NATIVE_APP_MANIFEST: digest(raw), NATIVE_APP_BUILDER: "a" * 64, "pnpm-lock.yaml": "b" * 64, entry: "c" * 64}
    backend = {"files": [{"path": NATIVE_APP_MANIFEST, "sha256": digest(raw), "bytes": len(raw)}]}
    web = {"tadazz-application-runtime/" + item["name"]: {"sha256": item["sha256"], "bytes": item["bytes"]} for item in files}
    verify_application_metadata(bundle, source, backend, web)
    witnessed = []
    for failure in ("generation", "packaged-change", "backend-mismatch", "source-change", "live-authority",
                    "legacy-renderers-only", "duplicate-renderer", "foreign-renderer", "renderer-version",
                    "admission-port-version", "admission-identity-version", "admission-artifact-pin", "admission-registry-pin"):
        changed_bundle = {**bundle, "verification": json.loads(json.dumps(verification))}
        changed_source, changed_backend, changed_web = dict(source), json.loads(json.dumps(backend)), json.loads(json.dumps(web))
        if failure == "generation":
            changed_bundle["verification"]["mode"] = "generate-manifest"
        elif failure == "packaged-change":
            changed_web["tadazz-application-runtime/renderer.mjs"]["sha256"] = "d" * 64
        elif failure == "backend-mismatch":
            changed_backend["files"][0]["sha256"] = "d" * 64
        elif failure == "source-change":
            changed_source[entry] = "d" * 64
        elif failure == "live-authority":
            changed_bundle["verification"]["liveAuthorityInputs"] = ["packages/web/src/features/game/stores/live.ts"]
        else:
            changed_native = json.loads(raw)
            if failure == "legacy-renderers-only":
                changed_native["pins"] = [pin for pin in changed_native["pins"]
                                          if pin["renderer"]["id"] != "tadazz-original-stage"]
            elif failure == "duplicate-renderer":
                changed_native["pins"][-1]["renderer"] = dict(changed_native["pins"][0]["renderer"])
            elif failure == "foreign-renderer":
                changed_native["pins"][-1]["renderer"]["id"] = "unreviewed-stage"
            elif failure == "renderer-version":
                changed_native["pins"][-1]["renderer"]["version"] = "1.0.1"
            elif failure == "admission-port-version":
                changed_native["pins"][-1]["portVersion"] = 2
            elif failure == "admission-identity-version":
                changed_native["pins"][-1]["identityRuleVersion"] = 1
            elif failure == "admission-artifact-pin":
                changed_native["pins"][-1]["rendererBuildSha256"] = "d" * 64
            else:
                changed_native["pins"][-1]["registrySha256"] = "d" * 64
            changed_raw = packed(changed_native)
            changed_bundle["manifestBytes"] = changed_raw
            changed_bundle["verification"]["manifestSha256"] = digest(changed_raw)
            changed_source[NATIVE_APP_MANIFEST] = digest(changed_raw)
            changed_backend["files"][0].update(sha256=digest(changed_raw), bytes=len(changed_raw))
        try:
            verify_application_metadata(changed_bundle, changed_source, changed_backend, changed_web)
        except GateError as error:
            if failure in ("legacy-renderers-only", "duplicate-renderer", "foreign-renderer", "renderer-version"):
                need(str(error) == "NATIVE_APPLICATION_RENDERER_PINS_MISSING", "SELFTEST_RENDERER_GATE_MISMATCH")
            elif failure.startswith("admission-"):
                need(str(error) == "NATIVE_APPLICATION_ADMISSION_PIN_MISMATCH", "SELFTEST_ADMISSION_GATE_MISMATCH")
            witnessed.append("native-application-" + failure)
        else:
            raise AssertionError("Unqualified native application accepted: " + failure)
    matrix = {"checks": [
        {"label": "native-application-preview-build", "command": ["node", NATIVE_APP_BUILDER, "--verify-manifest"]},
        {"label": "native-application-package", "command": ["-e", "TADAZZ_REMOTE_QA=1", "node", NATIVE_APP_PROBE]},
        {"label": "native-site-build", "command": ["-e", "VITE_TADAZZ_INLINE_GAME_PREVIEW=true", "vite"]},
    ]}
    verify_application_matrix(matrix)
    for failure in ("no-verification", "no-package-check", "theme-builder-activation"):
        value = json.loads(json.dumps(matrix))
        if failure == "no-verification":
            value["checks"][0]["command"].pop()
        elif failure == "no-package-check":
            value["checks"].pop(1)
        else:
            value["checks"][2]["command"].append("VITE_TADAZZ_THEME_BUILDER_ENABLED=true")
        try:
            verify_application_matrix(value)
        except GateError:
            witnessed.append("native-application-" + failure)
        else:
            raise AssertionError("Native application matrix omitted its gate: " + failure)
    return witnessed


def self_test_proxy_gate():
    revision = "a" * 40
    source_run = "tadazz-codex-" + revision[:12] + "-12345678"
    manifest = {path: "b" * 64 for path in (*PROXY_INPUTS, PROXY_CONTROLLER)}
    sdk_pin = "c" * 64
    stdout = "# TADAZZ_PROXY_PRIVACY_PROOF " + json.dumps(PROXY_PRIVACY_PROOF) + "\n"
    stdout += "# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n"
    sample = {
        "sha": revision, "baseSha": revision, "exactSourceSha": revision,
        "sourceRun": source_run, "immutable": True, "combinedImmutableGate": True,
        "exit": 0, "network": "none", "runnerImage": BASE_IMAGE,
        "sourceReadOnly": True, "overlayReadOnly": True,
        "productionChanged": False, "customerDataAccessed": False,
        "baseHashesUnchanged": True, "newFileHashesUnchanged": True,
        "hashesBefore": manifest, "hashesAfter": manifest, "sourceFileCount": len(manifest),
        "newFileHashes": {path: manifest[path] for path in PROXY_INPUTS},
        "controllerSha256": manifest[PROXY_CONTROLLER],
        "sdkCacheHashesVerifiedBeforeAfter": True, "sdkCacheManifestSha256": sdk_pin,
        "command": ["node", "--test", "/overlay/extensions/qa/phase3-native-consent/nginx-routing.nodecheck.ts"],
        "stdout": stdout, "privacyProof": PROXY_PRIVACY_PROOF,
    }
    binding = (revision, source_run, manifest, BASE_IMAGE, sdk_pin)
    verify_proxy(sample, binding)
    witnessed = []
    for failure in ("precommit", "missing-proof", "controls-not-exercised", "changed-config", "changed-source", "wrong-sdk", "wrong-image", "skipped"):
        value = json.loads(json.dumps(sample))
        if failure == "precommit":
            value["combinedImmutableGate"] = False
        elif failure == "missing-proof":
            value["stdout"] = value["stdout"].split("\n", 1)[1]
        elif failure == "controls-not-exercised":
            value["privacyProof"]["ordinaryUpstreamErrorControl"] = False
            value["stdout"] = "# TADAZZ_PROXY_PRIVACY_PROOF " + json.dumps(value["privacyProof"]) + "\n" + value["stdout"].split("\n", 1)[1]
        elif failure == "changed-config":
            value["newFileHashes"]["extensions/deployment/nginx-mcp-routes.conf"] = "d" * 64
        elif failure == "changed-source":
            value["hashesAfter"][PROXY_CONTROLLER] = "e" * 64
        elif failure == "wrong-sdk":
            value["sdkCacheManifestSha256"] = "f" * 64
        elif failure == "wrong-image":
            value["runnerImage"] = "sha256:" + "0" * 64
        else:
            value["stdout"] = value["stdout"].replace("# skipped 0", "# skipped 1")
        try:
            verify_proxy(value, binding)
        except GateError:
            witnessed.append("proxy-" + failure)
        else:
            raise AssertionError("Invalid immutable proxy proof accepted: " + failure)
    return witnessed


def self_test_public_preview_gate():
    files = [{"name": "renderer.mjs", "bytes": 3, "sha256": "a" * 64},
             {"name": "renderer.css", "bytes": 3, "sha256": "b" * 64}]
    proof = native_preview_proof(files)
    verify_native_preview_proof(proof, files)
    rejected = []
    for field in ("publicRuntimeEnabled", "publicRuntimeBytesVerified",
                  "publicRuntimeInvalidDigestDenied", "publicRuntimeInvalidNameDenied",
                  "publicCatalogueUnknownIdDenied", "privateRuntimeUnauthorized"):
        invalid = {**proof, field: False}
        try:
            verify_native_preview_proof(invalid, files)
        except GateError:
            rejected.append("public-preview-missing-" + field)
        else:
            raise AssertionError("Incomplete public preview proof accepted")
    for ids in ([], list(PUBLIC_CATALOGUE_IDS[:10]), list(PUBLIC_CATALOGUE_IDS[:-1]),
                list(reversed(PUBLIC_CATALOGUE_IDS)),
                [*PUBLIC_CATALOGUE_IDS[:-1], PUBLIC_CATALOGUE_IDS[0]],
                [*PUBLIC_CATALOGUE_IDS[:-1], "unreviewed-example"],
                [*PUBLIC_CATALOGUE_IDS, "unreviewed-example"]):
        try:
            verify_native_preview_proof({**proof, "publicCatalogueIds": ids}, files)
        except GateError:
            rejected.append("public-preview-reviewed-catalogue-required")
        else:
            raise AssertionError("Unreviewed public catalogue accepted")
    return ["public-preview-enabled-default-proof"] + rejected


def self_test_originals_gate():
    revision = "b" * 40
    source_run = "tadazz-codex-" + revision[:12] + "-12345678"
    source = {name: "a" * 64 for name in ORIGINAL_QA_FILES}
    artifacts = {name: {"synthetic.bin": {"bytes": 3, "sha256": "c" * 64}}
                 for name in ("web", "widget", "application", "backend")}
    results = list(original_theme_checks().values())
    receipt = {"format": "tadazz-original-themes-acceptance", "version": 1,
               "sha": revision, "sourceRun": source_run, "run": "tadazz-originals-" + revision[:12] + "-12345678",
               "passed": True, "exit": 0, "oomKilled": False, "network": "none",
               "sourceReadOnly": True, "customerMountUsed": False, "productionChanged": False,
               "manualListeningPerformed": False, "allSourceHashesVerified": True,
               "candidateSourceHashesVerifiedBeforeAfter": True, "sdkCacheHashesVerifiedBeforeAfter": True,
               "applicationSourcesEqualCandidate": True, "runtimeQaSourceEqualsCandidate": True,
               "readOnlyMountsVerified": True, "builtArtifactHashesVerifiedBeforeAfter": True,
               "sourceManifestSha256": canonical_digest(source), "qaSourceSha256": source,
               "builtArtifactsBefore": artifacts, "builtArtifactsAfter": artifacts,
               "browserReceipt": {"passed": True, "platform": "linux", "sourceSha": revision,
                                  "isolatedNativeHost": True, "customerMountUsed": False,
                                  "realEmailSent": False, "manualListeningPerformed": False, "results": results}}
    proof = verify_originals(receipt, revision, source_run, source, artifacts)
    need(len(proof["requiredChecks"]) == 23 and len(proof["familyIds"]) == 8, "SELFTEST_ORIGINALS_INVENTORY")
    native_index = next(index for index, item in enumerate(results) if item["name"] ==
                        "reduced-motion-native-two-to-five-choices-votes-images-and-audio-royal-quiz")
    mobile_index = next(index for index, item in enumerate(results) if item["name"] ==
                        "nine-locales-and-eight-reduced-motion-hebrew-mobile-votes")
    failures = (
        ("revision", ("sha",), "c" * 40, "ORIGINALS_IDENTITY_MISMATCH"),
        ("source-run", ("sourceRun",), source_run[:-8] + "00000000", "ORIGINALS_IDENTITY_MISMATCH"),
        ("exit", ("exit",), 1, "ORIGINALS_LINUX_GATE_MISSING"),
        ("oom", ("oomKilled",), True, "ORIGINALS_LINUX_GATE_MISSING"),
        ("network", ("network",), "bridge", "ORIGINALS_LINUX_GATE_MISSING"),
        ("customer-data", ("customerMountUsed",), True, "RECEIPT_ISOLATION_MISSING"),
        ("qa-overlay", ("runtimeQaSourceEqualsCandidate",), False, "ORIGINALS_INPUT_CHANGED"),
        ("source-manifest", ("sourceManifestSha256",), "d" * 64, "ORIGINALS_SOURCE_PIN_MISMATCH"),
        ("controller-pin", ("qaSourceSha256", "extensions/qa/original-themes/linux-browser-verify.py"), "d" * 64, "ORIGINALS_SOURCE_PIN_MISMATCH"),
        ("built-artifact", ("builtArtifactsBefore", "application", "synthetic.bin", "sha256"), "d" * 64, "ORIGINALS_BUILT_ARTIFACT_MISMATCH"),
        ("changed-after", ("builtArtifactsAfter", "web", "synthetic.bin", "sha256"), "d" * 64, "ORIGINALS_BUILT_ARTIFACT_MISMATCH"),
        ("non-linux", ("browserReceipt", "platform"), "win32", "ORIGINALS_BROWSER_GATE_MISSING"),
        ("missing-family", ("browserReceipt", "results"), results[:-1], "ORIGINALS_SCENARIOS_INCOMPLETE"),
        ("duplicate-case", ("browserReceipt", "results"), [*results[:-1], results[0]], "ORIGINALS_SCENARIOS_INCOMPLETE"),
        ("failed-case", ("browserReceipt", "results", native_index, "passed"), False, "ORIGINALS_SCENARIO_PROOF_MISMATCH"),
        ("missing-results-geometry", ("browserReceipt", "results", native_index, "resultsLayoutChecks"), 3, "ORIGINALS_SCENARIO_PROOF_MISMATCH"),
        ("truncated-storybook", ("browserReceipt", "results", mobile_index, "storybookFinalRecapEntries"), 2, "ORIGINALS_SCENARIO_PROOF_MISMATCH"),
    )
    witnessed = ["originals-eight-families-23-exact-scenarios-and-built-artifacts"]
    for name, path, value, expected in failures:
        changed = json.loads(json.dumps(receipt))
        target = changed
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
        try:
            verify_originals(changed, revision, source_run, source, artifacts)
        except GateError as error:
            need(str(error) == expected, "SELFTEST_ORIGINALS_WRONG_FAILURE")
            witnessed.append("originals-rejects-" + name)
        else:
            raise AssertionError("Unqualified originals accepted: " + name)
    return witnessed


def self_test():
    # Concrete gate witnesses: traversal, same-size tampering, and missing engine checks.
    for bad in ("../x", "/etc/passwd", "a/../b", "a\\b", "a//b"):
        try:
            safe_relative(bad)
        except GateError:
            pass
        else:
            raise AssertionError("traversal accepted")
    with tempfile.TemporaryDirectory(prefix="tadazz-stage-selftest-") as temporary:
        root = Path(temporary)
        write_new(root / "x", b"one")
        manifest = {"x": digest(b"one")}
        verify_source(root, manifest)
        (root / "x").write_bytes(b"two")
        try:
            verify_source(root, manifest)
        except GateError:
            pass
        else:
            raise AssertionError("tampering accepted")
        try:
            copy_pinned(root / "x", root / "unqualified", manifest["x"], 3)
        except GateError:
            need(not (root / "unqualified").exists(), "UNQUALIFIED_ARTIFACT_WRITTEN")
        else:
            raise AssertionError("changed-after-qualification artifact copied")
        (root / "link").symlink_to(root / "x")
        try:
            tree(root)
        except GateError:
            pass
        else:
            raise AssertionError("symlink accepted")
    passed = "# tests 12\n# pass 12\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n"
    tap_success(passed)
    tap_success(passed.replace("#", "ℹ"))
    tap_success("\x1b[32m" + passed.replace("\n", "\x1b[0m\n\x1b[32m") + "\x1b[0m")
    rejected = {
        "partial-summary": "# pass 12\n# fail 0\n",
        "skipped": passed.replace("pass 12", "pass 11").replace("skipped 0", "skipped 1"),
        "failure": passed.replace("pass 12", "pass 11").replace("fail 0", "fail 1"),
        "zero-tests": passed.replace("tests 12", "tests 0").replace("pass 12", "pass 0"),
        "cancelled": passed.replace("pass 12", "pass 11").replace("cancelled 0", "cancelled 1"),
        "todo": passed.replace("pass 12", "pass 11").replace("todo 0", "todo 1"),
        "count-mismatch": passed.replace("tests 12", "tests 13"),
        "duplicate-summary": passed + passed,
    }
    for name, sample in rejected.items():
        for prefix in ("#", "ℹ"):
            try:
                tap_success(sample.replace("#", prefix))
            except GateError:
                pass
            else:
                raise AssertionError(name + " release gate accepted")
    print(json.dumps({"selfTest": "PASS", "checks": ["traversal", "same-size-tamper", "changed-after-qualification-copy", "symlink", "tap-spec-summary"] + list(rejected) + self_test_semantic_gates() + self_test_application_gate() + self_test_proxy_gate() + self_test_public_preview_gate() + self_test_originals_gate()}))


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        return 0
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-run", required=True)
    parser.add_argument("--web-source-run")
    parser.add_argument("--revision", required=True)
    parser.add_argument("--release-dir", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--base-image", default=BASE_IMAGE)
    for name in ("host", "launch", "web", "browser", "full-show", "proxy", "originals"):
        parser.add_argument("--" + name + "-receipt", required=True)
    args = parser.parse_args()
    args.web_source_run = args.web_source_run or args.source_run
    stage_release(args)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (GateError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(json.dumps({"ok": False, "gate": str(error) if isinstance(error, GateError) else type(error).__name__}), file=sys.stderr)
        raise SystemExit(1)
