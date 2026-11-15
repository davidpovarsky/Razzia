"""Hash/JSON/text verification only; never open captured SQLite with SQLite."""
import hashlib
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
E = HERE / "server-receipts"
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
read = lambda name: json.loads((E / name).read_text())
transport = json.loads((HERE / "receipt-transport.json").read_text())
assert transport["exit"] == 0 and sha(HERE / "server-receipts.tar.gz") == transport["sha256"]
for row in transport["rawFiles"]:
    file = E / row["path"]
    assert file.stat().st_size == row["bytes"] and sha(file) == row["sha256"]
phases = {}
for name, expected in [("01-frozen-bootstrap", 0), ("02-typecheck", 0), ("03-first-party", 0),
    ("04-actual-producer", 0), ("05-format", 1)]:
    phase = read(name + ".json")
    assert phase["actualReturnCode"] == phase["shellExit"] == expected and not phase["logTruncated"]
    assert int((E / (name + ".exit")).read_text()) == expected
    assert sha(E / (name + ".log")) == phase["logSha256"]
    assert (E / (name + ".log")).stat().st_size < 1024 * 1024
    phases[name] = {"exit": expected, "logSha256": phase["logSha256"]}
tap = (E / "03-first-party.log").read_text(encoding="utf-8")
for pattern in [r"\btests 34\b", r"\bpass 34\b", r"\bfail 0\b", r"\bcancelled 0\b", r"\bskipped 0\b"]:
    assert re.search(pattern, tap)
compat = json.loads((E / "04-actual-producer.log").read_text())
assert compat["kind"] == "ACTUAL_AD895_INITIALIZE_COMPATIBILITY_OBSERVATION"
assert compat["producerCommit"] == "ad8955327a56213b3a437379fcc7ccc6e05a261a"
assert compat["getStatus"] == compat["mutationStatus"] == 200 and compat["revision"] == 2
assert compat["getBytesMtimeDirectoriesUnchanged"] and compat["nativeUnchanged"]
assert compat["counts"] == {"drafts": 1, "operations": 1, "audit": 1}
assert compat["extraToFirstParty34"] and not compat["migrationOrRepair"] and not compat["retainedHotJournalAccessed"]
W = E / "review-witnesses"
assert sha(W / "actual-ad895-initialized.sqlite") == compat["initializedSha256"]
assert (W / "actual-ad895-before-get.sqlite").read_bytes() == (W / "actual-ad895-after-get.sqlite").read_bytes()
before = json.loads((W / "actual-ad895-before-get.json").read_text())
after = json.loads((W / "actual-ad895-after-get.json").read_text())
assert before["beforeGet"] == after["afterGet"] and after["snapshotEqual"]
assert before["owner"] == after["owner"] == compat["owner"]
rejected = ["missing-operations-pk", "missing-native-null-check", "unexpected-mutating-trigger",
    "unexpected-view", "unexpected-index"]
for name in rejected:
    a = W / (name + "-rejected-before.sqlite")
    b = W / (name + "-rejected-after.sqlite")
    assert a.read_bytes() == b.read_bytes()
    old = json.loads((W / (name + "-rejected-before.json")).read_text())
    new = json.loads((W / (name + "-rejected-after.json")).read_text())
    assert new["getStatus"] == new["mutationStatus"] == 503
    assert old["beforeState"] == new["afterState"]
post_body = json.loads((W / "abort-post-body.json").read_text())
assert post_body["status"] == 400 and post_body["realVerifyCalls"] == 2
assert post_body["responsePendingUntilAuthSettled"] and post_body["snapshotEqual"]
assert not post_body["privateStoreCreated"]
post_auth = json.loads((W / "abort-post-auth.json").read_text())
assert post_auth["status"] == 400 and post_auth["verifiedPrincipalObserved"]
assert not post_auth["privateStoreCreated"] and post_auth["snapshotEqual"]
postcommit = json.loads((W / "abort-postcommit.json").read_text())
assert postcommit["committed"] and postcommit["privateDisclosureWithheld"]
assert postcommit["counts"] == [1, 1, 1]
for name in ["source-before.json", "source-after.json", "source-finally.json"]:
    source = read(name)
    assert source["files"] == 160 and source["unexpectedChanges"] == []
    assert source["privateLockSha256"] == "e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838"
assert read("cache-before.json") == read("cache-after.json")
assert read("cache-after.json")["verifiedMetadataFiles"] == 459
sdk = read("sdk41-reuse.json")
assert sdk["actualPass"] == 41 and sdk["actualFail"] == 0 and sdk["sameLockImageNodePnpmCache"]
assert sdk["logSha256"] == "ecf07bc1a5bd7b195268635b0002fa4d104130a22ee95400ba977bd34e196e9a"
summary = read("stage-summary.json")
assert summary["phases"] == {"typecheck": 0, "firstParty34": 0, "actualProducerCompatibility": 0, "format": 1}
assert summary["firstFailure"] == {"phase": "05-format", "exit": 1}
format_files = re.findall(r"\[warn\] ((?:first-party|tests/first-party)/\S+\.(?:ts|md))", (E / "05-format.log").read_text())
assert len(format_files) == 8
release = read("allocation-release.json")
assert release["ownContainerStoppedNaturally"] and release["naturalExit"] == 1 and not release["oomKilled"]
assert release["computeReturned"] and release["newPhysicalConservativeUpperBoundBytes"] < 8 * 1024**2
assert release["hostFreeAfterBytes"] >= release["requiredRemainingReserveBytes"] >= 2048 * 1024**2
assert release["sharedMetadataKeeperLeftRunning"] and not release["sharedMetadataCopied"]
assert not (E / "monitor-errors.json").exists() and not (E / "resource-stop.json").exists()
resources = [read("resource-start.json"), read("resource-end.json")]
resources += [json.loads(path.read_text()) for path in E.glob("*-resources.json")]
for resource in resources:
    assert resource["ownTmpfsUsedBytes"] <= 256 * 1024**2
    assert resource["newPhysicalUpperBoundBytes"] <= 8 * 1024**2
    assert resource["freeBytes"] >= resource["requiredRemainingReserveBytes"] >= 2048 * 1024**2
raw_dbs = sorted(path.name for path in W.glob("*.sqlite"))
assert len(raw_dbs) == 14
result = {"kind": "VERIFIED_BFB160_FUNCTIONAL_STAGE_WITH_FORMAT_FAILURE",
    "productSource": summary["productSource"], "manifestSha256": summary["manifestSha256"],
    "grant": summary["grant"], "phases": phases, "firstParty": {"pass": 34, "fail": 0, "skip": 0, "cancel": 0},
    "extraActualProducerCompatibility": {"observations": 1, "pass": 1, "get": 200, "put": 200,
        "sameDbRevision": 2, "owner": compat["owner"], "getBytesMtimeDirectoriesUnchanged": True,
        "initializedDbSha256": compat["initializedSha256"]},
    "rejectedSchemasPreserved": rejected, "rawSqliteFiles": raw_dbs, "rawSqliteCount": len(raw_dbs),
    "sourceInputsUnchanged": 160, "cacheMetadataFilesVerifiedTwice": 459, "sdk41": "ACTUAL_PRIOR_RESULT_REUSED",
    "sdkUnchangedNonFirstPartyInputs": sdk["unchangedNonFirstPartyInputCount"],
    "formatExit": 1, "formatFiles": format_files, "naturalContainerExit": 1, "oomKilled": False,
    "noRetryOrSourceEdit": True, "maximumRecordedOwnTmpfsBytes": max(row["ownTmpfsUsedBytes"] for row in resources),
    "newPhysicalConservativeUpperBoundBytes": release["newPhysicalConservativeUpperBoundBytes"],
    "newPhysicalCapBytes": 8 * 1024**2, "hostFreeAfterBytes": release["hostFreeAfterBytes"],
    "computeReturned": True, "sharedMetadataKeeperLeftRunning": True,
    "syscallZeroWriteProof": False, "originalImplementationTasks": "OPEN"}
(HERE / "verified-stage-summary.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({key: value for key, value in result.items() if key not in ["rawSqliteFiles", "phases"]}))
