"""Read/hash actual receipts only. No application code or local compiler/tests."""
import hashlib
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
R = HERE / "server-receipts"
FINAL = R / "attempt-06"
SDK = R / "attempt-03"
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
read = lambda path: json.loads(path.read_bytes())
phases = ["01-resolve", "02-install", "03-reinstall", "04-typecheck", "05-first-party", "06-sdk-reuse", "07-format",
          "09-get-absent", "09-get-regular", "09-get-hot-journal", "11-source"]
for name in phases:
    result = read(FINAL / (name + ".json"))
    assert result["actualReturnCode"] == 0 and result["shellExit"] == 0 and not result["logTruncated"], name
    assert result["logSha256"] == sha(FINAL / (name + ".log")), name
assert read(FINAL / "12-private-validation.json")["exit"] == 0
for count in [r"\btests 26\b", r"\bpass 26\b", r"\bfail 0\b", r"\bskipped 0\b", r"\bcancelled 0\b"]:
    assert re.search(count, (FINAL / "05-first-party.log").read_text(encoding="utf-8"))
sdk = read(SDK / "06-sdk.json")
assert sdk["actualReturnCode"] == 0 and sdk["logSha256"] == sha(SDK / "06-sdk.log")
for count in [r"\btests 41\b", r"\bpass 41\b", r"\bfail 0\b", r"\bskipped 0\b"]:
    assert re.search(count, (SDK / "06-sdk.log").read_text(encoding="utf-8"))
reuse = read(FINAL / "sdk41-reuse.json")
assert reuse["actualTests"] == reuse["actualPass"] == 41 and reuse["actualFail"] == 0
assert reuse["actualSdkLogSha256"] == sdk["logSha256"] and reuse["sameGeneratedPrivateLock"]
source = read(FINAL / "source-after-final.json")
assert source["sourceCommit"] == "ad8955327a56213b3a437379fcc7ccc6e05a261a"
assert source["files"] == 150 and not source["unexpectedChanges"]
assert read(FINAL / "source-after-final-exit.json")["exit"] == 0
lock_sha = "e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838"
assert sha(FINAL / "generated-private-pnpm-lock.yaml") == lock_sha == sha(ROOT / "extensions/src/mcp-app/pnpm-lock.yaml")
observations = []
for mode, expected in [("absent", 404), ("regular", 200), ("hot-journal", 503)]:
    frames = [json.loads(line) for line in (FINAL / ("09-get-" + mode + ".log")).read_text().splitlines() if line.startswith("{")]
    end = next(row for row in frames if row["phase"] == "GET_END")
    assert end["status"] == end["expected"] == expected and end["snapshotEqual"]
    assert end["controlEvents"] > 0 and end["watcherError"] is None and not end["overflow"]
    assert end["observedMutationEvents"] == [] and end["observation"] == "NO_OBSERVED_MUTATION"
    assert (FINAL / ("get-" + mode + "-before.json")).read_bytes() == (FINAL / ("get-" + mode + "-after.json")).read_bytes()
    observations.append({"case": mode, "http": expected, "snapshotEqual": True, "mutationNotifications": 0, "positiveControlEvents": end["controlEvents"]})
assert (FINAL / "get-hot-journal-preserved/drafts.sqlite-journal").read_bytes()[:8].hex() == "d9d505f920a163d7"
assert (FINAL / "get-hot-journal-preserved/drafts.sqlite").read_bytes()[:16] == b"SQLite format 3\0"
assert (FINAL / "08-tracer-unavailable.txt").is_file()
resources = read(FINAL / "resource-end.json")
assert resources["ownTmpfsUsedBytes"] <= 256 * 1024**2 and int(resources["memoryPeak"]) < 2 * 1024**3 and not resources["monitorErrors"]
assert "oom_kill 0" in resources["memoryEvents"]
release = read(R / "allocation-release.json")
assert release["allOwnContainersStopped"] and release["allOomKilledFalse"] and release["finalNaturalExit"] == 0
assert release["newPhysicalConservativeUpperBoundBytes"] < 64 * 1024**2 and release["sharedMetadataKeeperLeftRunning"]
audit = read(HERE / "final-source-audit.json")
assert audit["sourceInputs"] == 150 and not audit["sourceMismatches"] and not audit["protectedChangesSinceAccepted"]
assert audit["protectedFiles"] == 602 and not audit["unleasedChanges"] and not audit["frozenLegacyModuleChanges"]
assert audit["rootLockUnchanged"] and not audit["guardEdited"] and not audit["parentNewVitestGlobIntersection"]
assert audit["rawFreezeExit"] == 1 and not audit["rawFreezeDetails"]["mismatches"]
manifest = read(HERE / "corrected-input-manifest.json")
for row in manifest["files"]:
    assert sha(ROOT / row["path"]) == row["sha256"]
result = {"status": "PRIVATE_FUNCTIONAL_STAGE_VERIFIED_EXTERNAL_GATES_OPEN",
    "sourceCommit": source["sourceCommit"], "sourceManifestSha256": sha(HERE / "corrected-input-manifest.json"),
    "sourceInputs": 150, "privateLockSha256": lock_sha, "finalAttempt": "attempt-06", "finalContainerNaturalExit": 0,
    "offlineLockFrozenInstallReinstall": [0, 0, 0], "privateTypecheck": 0, "newTests": {"pass": 26, "fail": 0, "skip": 0},
    "sdkTests": {"pass": 41, "fail": 0, "actualAttempt": "attempt-03", "verifiedReuseInFinal": True, "rerunInFinal": False},
    "format": 0, "exactSourceRecheck": 0, "getObservations": observations, "syscallNoWriteProof": "NOT_AVAILABLE_STRACE_ABSENT",
    "scopeOfGetObservation": "PRIVATE_DRAFT_AND_NATIVE_ONLY; AUTH_WAL_SHM_AND_OS_ATIME_EXCLUDED",
    "hotJournalAndDbPreserved": True, "protectedFilesUnchangedSinceAccepted": 602, "frozenLegacyFiles": 29,
    "rawFreezeExit": 1, "rawFreezeAllowlistDenials": len(audit["rawFreezeDetails"]["denied"]), "rawFreezeMismatches": [],
    "ownTmpfsUsedBytes": resources["ownTmpfsUsedBytes"], "memoryPeakBytes": int(resources["memoryPeak"]),
    "sharedMetadataTmpfsBytesCountedOnce": resources["sharedMetadataTmpfsUsed"],
    "newPhysicalConservativeUpperBoundBytes": release["newPhysicalConservativeUpperBoundBytes"], "resourceCapExpanded": False,
    "allOwnAllocationsReleased": True, "originalImplementationTasksAndHq": "OPEN",
    "openGates": ["host OAuth/private client grants", "accepted renderer", "native save consent/reservation/publication",
                  "R2 native read/import", "actual download delivery", "protected mount and release"]}
(HERE / "verified-stage-summary.json").write_bytes((json.dumps(result, indent=2) + "\n").encode())
print(json.dumps(result))
