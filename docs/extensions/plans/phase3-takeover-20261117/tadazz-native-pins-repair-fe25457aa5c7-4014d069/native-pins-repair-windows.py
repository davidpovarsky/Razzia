"""Workstation orchestration only; all formatting/build/type/lint runs are Oracle.

Preserves and verifies the bounded failed native artifact before permitting any
Oracle source mutation. The result prepares pins; it is not release qualification.
"""
from pathlib import Path, PurePosixPath
import base64
import hashlib
import json
import shlex
import subprocess
import tarfile
import uuid

REPO = Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-original-themes-20261122")
TRANSFER = Path(r"C:\Users\DAVID\Code\tadazz-original-themes-20261122-transfer")
BASE = REPO / "docs/extensions/plans/phase3-takeover-20261117"
RUN = "tadazz-codex-fe25457aa5c7-53880a3e"
SHA = "fe25457aa5c79e7ac24c36ef55ff2235d97dd9d4"
INPUT_PIN = "bb651d7dec9b0e4afb34afa1fd29cbaac5cc6f7b5d0af4d3e62bfd823ebd8ba1"
FAILED_PIN = "b99b70e104136f42d9a3a69fa23d09a24e940b8a17a792e70b756872f73ad539"
BUILDER = "extensions/qa/build-application-preview.mjs"
FIXTURE = "extensions/qa/phase3-full-show/native-parity-fixtures.ts"
MANIFEST = "extensions/src/core/show-library/application-preview-build.json"
EXPECTED_WINDOWS = {
    BUILDER: "3f3df7de61f85a1c3a2e57049ba14051aeeeaaf8df491e09e5a0be389c539b18",
    FIXTURE: "a7b17c393cca0678082cfab2f41e2f70e03daa407d86ee1bc59c0147370ecb48",
    MANIFEST: "c3c8c1f99a2903a7117cf9b47ee5a7bf2226afb526eb8410a40ba8666b31c410",
}
SSH = ["ssh", "-i", str(Path.home() / ".ssh/tadazz_oracle_2026"), "-o", "BatchMode=yes",
       "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "ubuntu@132.145.25.168"]


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf8", newline="\n")


def git(*args):
    return subprocess.check_output(["git", *args], cwd=REPO)


def read_archive(path, maximum_bytes=40 * 1024**2):
    payload = {}
    total = 0
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            key = PurePosixPath(member.name)
            assert member.isfile() and not key.is_absolute() and ".." not in key.parts
            assert member.name not in payload and len(payload) < 256
            total += member.size
            assert total <= maximum_bytes
            payload[member.name] = archive.extractfile(member).read()
    return payload


def main():
    assert git("rev-parse", "HEAD").decode().strip() == SHA
    assert set(git("diff", "--name-only", "HEAD", "--", "extensions", "packages").decode().splitlines()) == {BUILDER, FIXTURE}
    assert all(digest(REPO / key) == pin for key, pin in EXPECTED_WINDOWS.items())
    input_path = BASE / RUN / "input-manifest.json"
    failed_path = BASE / (RUN + "-retry-22e28948") / "receipt.json"
    assert digest(input_path) == INPUT_PIN and digest(failed_path) == FAILED_PIN
    failed = json.loads(failed_path.read_bytes())
    assert failed["run"] == RUN and failed["sha"] == SHA and failed["suite"] == "native-launch"
    assert {item["label"] for item in failed["checks"] if item["exit"] != 0} == {"native-application-preview-build", "semantic-types", "semantic-lint"}
    oracle_path = Path(__file__).with_name("native-pins-repair-oracle.py")
    oracle = oracle_path.read_text(encoding="utf8")
    assert oracle.count("CONFIG = None") == 1
    repair_run = "tadazz-native-pins-repair-fe25457aa5c7-" + uuid.uuid4().hex[:8]
    owned = TRANSFER / repair_run
    evidence = BASE / repair_run
    owned.mkdir(exist_ok=False)
    evidence.mkdir(exist_ok=False)
    for folder in [owned, evidence]:
        (folder / "failed-native-receipt.json").write_bytes(failed_path.read_bytes())
        (folder / "failed-input-manifest.json").write_bytes(input_path.read_bytes())
        (folder / "native-pins-repair-oracle.py").write_bytes(oracle_path.read_bytes())
        (folder / "native-pins-repair-windows.py").write_bytes(Path(__file__).read_bytes())
    capture_script = oracle.replace("CONFIG = None", "CONFIG = " + repr({"mode": "capture"}))
    before_archive = owned / "failed-native-before.tar.gz"
    with before_archive.open("xb") as stream:
        capture = subprocess.run([*SSH, "sudo -n python3 -"], input=capture_script.encode(), stdout=stream,
                                 stderr=subprocess.PIPE, timeout=180)
    (owned / "capture.stderr.log").write_bytes(capture.stderr)
    assert capture.returncode == 0, capture.stderr.decode(errors="replace")[-6000:]
    before = read_archive(before_archive)
    capture_receipt = json.loads(before["capture-receipt.json"])
    assert capture_receipt["sourceRun"] == RUN and capture_receipt["sourceSha"] == SHA
    assert capture_receipt["inputManifestSha256"] == INPUT_PIN and capture_receipt["sourceUnchangedDuringCapture"] is True
    assert set(before) == set(capture_receipt["files"]) | {"capture-receipt.json"}
    for key, pin in capture_receipt["files"].items():
        assert hashlib.sha256(before[key]).hexdigest() == pin["sha256"] and len(before[key]) == pin["bytes"]
    assert before["input-manifest.json"] == input_path.read_bytes()
    for key, content in before.items():
        destination = evidence / "before" / key
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        assert destination.read_bytes() == content
    archive_pin = digest(before_archive)
    (evidence / before_archive.name).write_bytes(before_archive.read_bytes())
    assert digest(evidence / before_archive.name) == archive_pin
    retention = {"archiveSha256": archive_pin, "archiveBytes": before_archive.stat().st_size,
                 "captureReceiptSha256": hashlib.sha256(before["capture-receipt.json"]).hexdigest(),
                 "failedNativeReceiptSha256": FAILED_PIN, "inputManifestSha256": INPUT_PIN,
                 "sourceTreeSha256": capture_receipt["sourceTreeSha256"], "sourceEntries": capture_receipt["sourceEntries"],
                 "allExtractedHashesVerified": True, "sourceMutationStarted": False}
    for folder in [owned, evidence]:
        write_json(folder / "before-retention-receipt.json", retention)
    # This durable verified Windows retention is completed before the next SSH call.
    assert git("rev-parse", "HEAD").decode().strip() == SHA
    assert all(digest(REPO / key) == pin for key, pin in EXPECTED_WINDOWS.items())
    config = {"mode": "repair", "repairRun": repair_run, "beforeTreeSha256": capture_receipt["sourceTreeSha256"],
              "beforeEntries": capture_receipt["sourceEntries"], "windowsBeforeArchiveVerified": True,
              "windowsBeforeArchiveSha256": archive_pin, "windowsCaptureReceiptSha256": retention["captureReceiptSha256"],
              "failedNativeReceiptSha256": FAILED_PIN,
              "patches": {key: {"sha256": EXPECTED_WINDOWS[key], "base64": base64.b64encode((REPO / key).read_bytes()).decode()} for key in [BUILDER, FIXTURE]}}
    repair_script = oracle.replace("CONFIG = None", "CONFIG = " + repr(config))
    result = subprocess.run([*SSH, "sudo -n python3 -"], input=repair_script, capture_output=True,
                            text=True, encoding="utf8", timeout=1900)
    for folder in [owned, evidence]:
        (folder / "controller.stdout.log").write_text(result.stdout, encoding="utf8", newline="\n")
        (folder / "controller.stderr.log").write_text(result.stderr, encoding="utf8", newline="\n")
    if not result.stdout.strip():
        print(json.dumps({"prepared": False, "evidence": str(evidence), "failure": result.stderr[-6000:]}))
        raise SystemExit(1)
    summary = json.loads(result.stdout)
    assert summary["evidence"] == "/home/ubuntu/" + repair_run
    # Copy bounded owned receipts/logs/source results even when a check fails.
    fetch = r'''
from pathlib import Path
import hashlib,json,os,sys,tarfile
root=Path(ROOT)
assert root.resolve()==root and root.is_dir()
payload={}
for dp,ds,fs in os.walk(root,followlinks=False):
 assert not any((Path(dp)/d).is_symlink() for d in ds)
 for name in fs:
  p=Path(dp)/name
  assert p.is_file() and not p.is_symlink()
  payload[p.relative_to(root).as_posix()]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
assert len(payload)<=128 and sum(v['bytes'] for v in payload.values())<32*1024**2
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz') as archive:
 for key in sorted(payload):archive.add(root/key,arcname=key,recursive=False)
'''
    after_archive = owned / "repair-evidence.tar.gz"
    with after_archive.open("xb") as stream:
        fetched = subprocess.run([*SSH, "sudo -n python3 -"], input=fetch.replace("ROOT", repr(summary["evidence"])).encode(),
                                 stdout=stream, stderr=subprocess.PIPE, timeout=120)
    (owned / "fetch.stderr.log").write_bytes(fetched.stderr)
    assert fetched.returncode == 0, fetched.stderr.decode(errors="replace")[-6000:]
    after = read_archive(after_archive)
    assert hashlib.sha256(after["receipt.json"]).hexdigest() == summary["receiptSha256"]
    receipt = json.loads(after["receipt.json"])
    assert receipt["sourceRun"] == RUN and receipt["sourceSha"] == SHA and receipt["run"] == repair_run
    assert receipt["windowsBeforeArchiveSha256"] == archive_pin and receipt["failedNativeReceiptSha256"] == FAILED_PIN
    for key, content in after.items():
        target = evidence / key
        assert not target.exists()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    (evidence / after_archive.name).write_bytes(after_archive.read_bytes())
    assert digest(evidence / after_archive.name) == digest(after_archive)
    if result.returncode or not receipt["passed"]:
        print(json.dumps({"prepared": False, "evidence": str(evidence), "receiptSha256": summary["receiptSha256"],
                          "containerStopped": receipt.get("containerStopped"), "noOom": receipt.get("noOom"),
                          "failure": receipt.get("failure"), "cleanupOrInvariantFailure": receipt.get("cleanupOrInvariantFailure")}))
        raise SystemExit(1)
    assert receipt["containerStopped"] is True and receipt["noOom"] is True
    assert receipt["releaseQualified"] is False and receipt["preparationOnly"] is True
    assert receipt["trackedChangedPaths"] == sorted(EXPECTED_WINDOWS)
    assert all(item["exit"] == 0 for item in receipt["checks"]) and len(receipt["checks"]) == 8
    assert git("rev-parse", "HEAD").decode().strip() == SHA
    assert all(digest(REPO / key) == pin for key, pin in EXPECTED_WINDOWS.items())
    copyback = {}
    for key, expected in receipt["formattedSource"].items():
        assert key in EXPECTED_WINDOWS
        data = after["source-copyback/" + key]
        assert hashlib.sha256(data).hexdigest() == expected["sha256"] and len(data) == expected["bytes"]
        (REPO / key).write_bytes(data)
        assert digest(REPO / key) == expected["sha256"]
        copyback[key] = expected
    assert set(copyback) == set(EXPECTED_WINDOWS)
    write_json(evidence / "windows-copyback-receipt.json", {"headUnchanged": SHA, "sourceFiles": copyback,
               "repairReceiptSha256": summary["receiptSha256"], "releaseQualified": False})
    print(json.dumps({"prepared": True, "evidence": str(evidence), "transfer": str(owned),
                      "receiptSha256": summary["receiptSha256"], "sourceTreeSha256": receipt["sourceTreeSha256"],
                      "sourceEntries": receipt["sourceEntries"], "removedGeneratedSourcePaths": receipt["removedGeneratedSourcePaths"],
                      "copiedBack": copyback, "checks": [{"label": row["label"], "exit": row["exit"], "seconds": row["seconds"]} for row in receipt["checks"]],
                      "containerStopped": True, "noOom": True, "productionChanged": False, "releaseQualified": False}))


if __name__ == "__main__":
    main()
