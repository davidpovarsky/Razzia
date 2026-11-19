"""Collect exactly five public result files after the accepted candidate deployment.

Prepared for explicit invocation only. This does not stage, deploy, inspect
Docker, or read backups, runtime/config files, environment files, or logs.
SSH stdout is an internal transfer of the allowlisted bytes; terminal output
contains only fixed failure codes or paths, byte counts, and SHA-256 metadata.
"""

import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile


ROOT = Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119")
DOCS = ROOT / "docs/extensions/plans/ux-unified-20261119"
DESTINATION = DOCS / "release-evidence"
SHA = "d8a402dd39bf3cd7e5b046c3bf3b955181815a62"
RELEASE = "/home/ubuntu/tadazz-mcp-release-" + SHA[:12] + "-20261119"
IMAGE_TAG = "tadazz:mcp-" + SHA[:12] + "-20261119"
MAX_FILE_BYTES = 1024 * 1024
HEX = re.compile(r"[0-9a-f]{64}\Z")
IMAGE = re.compile(r"sha256:[0-9a-f]{64}\Z")
RUN = re.compile(r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}\Z")
NAMES = (
    "stage-result.json",
    "stage-manifest.json",
    "synthetic-smoke-result.json",
    "backup-qualification-result.json",
    "deployment-result.json",
)


class EvidenceError(RuntimeError):
    pass


def need(condition, code):
    if not condition:
        raise EvidenceError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def invalid_number(_value):
    raise EvidenceError("NONFINITE_JSON_NUMBER")


def decode(data):
    try:
        value = json.loads(data, object_pairs_hook=unique_object, parse_constant=invalid_number)
    except (ValueError, UnicodeError):
        raise EvidenceError("INVALID_JSON") from None
    need(isinstance(value, dict), "JSON_OBJECT_REQUIRED")
    return value


def producer_bytes(value):
    # Verification only: both reviewed producers write sorted, indented JSON
    # followed by LF. These reconstructed bytes are NEVER retained as evidence.
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def plain_local(path, directory=False):
    need(path.is_absolute(), "LOCAL_PATH_NOT_ABSOLUTE")
    for component in [*reversed(path.parents), path]:
        info = component.lstat()
        reparse = getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
        need(not stat.S_ISLNK(info.st_mode) and not reparse, "LOCAL_LINK_REJECTED")
        is_directory = directory or component != path
        need(stat.S_ISDIR(info.st_mode) if is_directory else stat.S_ISREG(info.st_mode), "LOCAL_PATH_TYPE")
    return path


def local_bytes(path):
    plain_local(path)
    before = path.stat()
    need(before.st_size <= MAX_FILE_BYTES, "LOCAL_FILE_TOO_LARGE")
    with path.open("rb") as stream:
        opened_before = os.fstat(stream.fileno())
        data = stream.read(MAX_FILE_BYTES + 1)
        opened_after = os.fstat(stream.fileno())
    plain_local(path)
    after = path.stat()
    # CPython 3.12 on Windows reports legacy st_ctime differently through
    # path.stat() and os.fstat(). Compare those clocks only within the same
    # API, while still binding the path and opened handle by file identity,
    # type, link count, length and nanosecond modification time.
    signature = lambda info: (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
                              info.st_size, info.st_mtime_ns)
    clock = lambda info: (info.st_ctime_ns, getattr(info, "st_birthtime_ns", None))
    need(signature(before) == signature(opened_before) == signature(opened_after) == signature(after), "LOCAL_FILE_CHANGED")
    need(clock(before) == clock(after) and clock(opened_before) == clock(opened_after), "LOCAL_FILE_CHANGED")
    need(len(data) == before.st_size and len(data) <= MAX_FILE_BYTES, "LOCAL_FILE_SIZE")
    return data


def accepted_action(envelope, action):
    need(envelope.get("action") == action and envelope.get("exit") == 0, "ACTION_NOT_ACCEPTED")
    need(not envelope.get("timedOut") and not envelope.get("stateRequiresInspection"), "ACTION_REQUIRES_INSPECTION")
    coordinator = decode(envelope.get("stdout", ""))
    need(coordinator.get("action") == action and coordinator.get("sourceSha") == SHA, "COORDINATOR_IDENTITY")
    need(coordinator.get("exit") == 0 and coordinator.get("childExit") == 0, "COORDINATOR_NOT_ACCEPTED")
    need(coordinator.get("deadlineExceeded") is False and coordinator.get("stateRequiresInspection") is False, "COORDINATOR_REQUIRES_INSPECTION")
    report = decode(coordinator.get("stdout", ""))
    need(report.get("revision") == SHA and report.get("success") is True, "RESULT_NOT_ACCEPTED")
    return coordinator, report


def result_path(path, prefix, basename):
    need(isinstance(path, str), "RESULT_PATH_TYPE")
    candidate = PurePosixPath(path)
    need(candidate.is_absolute() and str(candidate) == path, "RESULT_PATH_CANONICAL")
    need(".." not in candidate.parts, "RESULT_PATH_TRAVERSAL")
    try:
        relative = candidate.relative_to(PurePosixPath(RELEASE))
    except ValueError:
        raise EvidenceError("RESULT_OUTSIDE_RELEASE") from None
    need(len(relative.parts) == 2 and relative.parts[1] == basename, "RESULT_PATH_SHAPE")
    folder = relative.parts[0]
    need(folder.startswith(prefix) and RUN.fullmatch(folder[len(prefix):]), "RESULT_RUN_ID")
    return str(candidate)


REMOTE = r'''
import base64,hashlib,json,os,pathlib,re,stat
c=__CONFIG__
NAMES=("stage-result.json","stage-manifest.json","synthetic-smoke-result.json","backup-qualification-result.json","deployment-result.json")
LIMIT=1024*1024

class GateError(RuntimeError): pass
def need(value,code):
 if not value: raise GateError(code)
def digest(data): return hashlib.sha256(data).hexdigest()
def unique(pairs):
 out={}
 for key,value in pairs:
  need(key not in out,"DUPLICATE_JSON_KEY");out[key]=value
 return out
def bad_number(_): raise GateError("NONFINITE_JSON_NUMBER")
def decode(data):
 value=json.loads(data,object_pairs_hook=unique,parse_constant=bad_number)
 need(isinstance(value,dict),"JSON_OBJECT_REQUIRED")
 return value
def producer_bytes(value): return (json.dumps(value,indent=2,sort_keys=True)+"\n").encode("utf-8")

def read_public(name):
 # The allowlist is checked before any file is opened. Walk directory FDs with
 # O_NOFOLLOW so a symlink swap cannot redirect a read to private material.
 need(name in NAMES,"FILE_NOT_ALLOWLISTED")
 path=c["paths"][name]
 p=pathlib.PurePosixPath(path)
 need(p.is_absolute() and str(p)==path and ".." not in p.parts,"PATH_CANONICAL")
 need(p.name==name and p.is_relative_to(pathlib.PurePosixPath(c["releaseDir"])),"PATH_OUTSIDE_RELEASE")
 fd=os.open("/",os.O_RDONLY|os.O_DIRECTORY)
 try:
  for component in p.parts[1:-1]:
   new=os.open(component,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
   os.close(fd);fd=new
  info=os.fstat(fd)
  need(info.st_uid==0 and not stat.S_IMODE(info.st_mode)&0o022,"PARENT_OWNER_MODE")
  file_fd=os.open(p.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
  with os.fdopen(file_fd,"rb") as stream:
   before=os.fstat(stream.fileno())
   need(stat.S_ISREG(before.st_mode) and before.st_nlink==1,"FILE_TYPE")
   need(before.st_uid==0 and stat.S_IMODE(before.st_mode)==0o600,"FILE_OWNER_MODE")
   need(0<before.st_size<=LIMIT,"FILE_SIZE")
   data=stream.read(LIMIT+1)
   after=os.fstat(stream.fileno())
   signature=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
   need(signature(before)==signature(after) and len(data)==before.st_size,"FILE_CHANGED_DURING_READ")
  return data
 finally:
  os.close(fd)

try:
 need(os.geteuid()==0,"LINUX_ROOT_REQUIRED")
 need(c["sha"]=="d8a402dd39bf3cd7e5b046c3bf3b955181815a62","SOURCE_MISMATCH")
 release="/home/ubuntu/tadazz-mcp-release-"+c["sha"][:12]+"-20261119"
 need(c["releaseDir"]==release and set(c["paths"])==set(NAMES),"RELEASE_ALLOWLIST")
 for name in NAMES[:3]: need(c["paths"][name]==release+"/"+name,"STAGE_PATH")
 for name,prefix in [(NAMES[3],"backup-qualification-"),(NAMES[4],"deployment-")]:
  relative=pathlib.PurePosixPath(c["paths"][name]).relative_to(pathlib.PurePosixPath(release))
  need(len(relative.parts)==2 and relative.parts[1]==name and re.fullmatch(prefix+r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}",relative.parts[0]),"RUN_PATH")
 raw={name:read_public(name) for name in NAMES}
 values={name:decode(raw[name]) for name in NAMES}
 stage=values["stage-result.json"];manifest=values["stage-manifest.json"];smoke=values["synthetic-smoke-result.json"]
 qual=values["backup-qualification-result.json"];deploy=values["deployment-result.json"]
 need(digest(raw["stage-manifest.json"])==c["stageManifestSha256"],"STAGE_MANIFEST_HASH")
 need(manifest.get("format")=="tadazz-mcp-stage" and manifest.get("version")==2,"STAGE_SCHEMA")
 need(manifest.get("sourceSha")==c["sha"] and manifest.get("sourceRun")==c["sourceRun"] and manifest.get("webSourceRun")==c["sourceRun"],"STAGE_SOURCE")
 need(manifest.get("image")==c["candidateTag"] and manifest.get("imageId")==c["candidateImage"],"STAGE_IMAGE")
 need(manifest.get("productionTouched") is False and manifest.get("customerMountUsed") is False,"STAGE_SCOPE")
 artifacts=manifest.get("artifacts")
 need(isinstance(artifacts,dict) and 1<=len(artifacts)<=10000,"STAGE_ARTIFACT_COUNT")
 expected_stage={"sourceSha":c["sha"],"productionTouched":False,"customerMountUsed":False,"ok":True,"releaseDir":release,
  "image":c["candidateTag"],"imageId":c["candidateImage"],"stageManifestSha256":c["stageManifestSha256"],
  "backendSha256":manifest["backendSha256"],"widgetManifestSha256":manifest["widgetManifestSha256"],
  "payloadFiles":len(artifacts),"syntheticSmokePassed":True,"runningContainersUnchanged":True}
 need(raw["stage-result.json"]==producer_bytes(expected_stage),"STAGE_RESULT_BINDING")
 need(digest(raw["synthetic-smoke-result.json"])==manifest.get("syntheticSmokeSha256"),"SMOKE_HASH")
 need(smoke.get("sourceSha")==c["sha"] and smoke.get("image")==c["candidateImage"] and smoke.get("ok") is True,"SMOKE_IDENTITY")
 need(smoke.get("productionTouched") is False and smoke.get("customerMountUsed") is False and smoke.get("network")=="none","SMOKE_SCOPE")
 need(digest(raw["backup-qualification-result.json"])==c["qualificationSha256"],"QUALIFICATION_HASH")
 need(qual.get("receiptPath")==c["paths"]["backup-qualification-result.json"] and qual.get("revision")==c["sha"] and qual.get("image")==c["candidateImage"] and qual.get("success") is True,"QUALIFICATION_IDENTITY")
 need(digest(raw["deployment-result.json"])==c["deploymentSha256"],"DEPLOYMENT_HASH")
 need(deploy.get("revision")==c["sha"] and deploy.get("image")==c["candidateImage"] and deploy.get("success") is True and deploy.get("phase")=="verified","DEPLOYMENT_IDENTITY")
 need(deploy.get("priorRestoreBootQualification",{}).get("sha256")==c["qualificationSha256"],"DEPLOYMENT_QUALIFICATION_BINDING")
 print(json.dumps({"ok":True,"sourceSha":c["sha"],"releaseDir":release,"files":{
  name:{"remotePath":c["paths"][name],"sha256":digest(raw[name]),"bytes":len(raw[name]),"base64":base64.b64encode(raw[name]).decode("ascii")} for name in NAMES}}))
except GateError as error:
 print(json.dumps({"ok":False,"code":str(error)}));raise SystemExit(1)
except Exception as error:
 print(json.dumps({"ok":False,"code":"REMOTE_EVIDENCE_FAILURE","errorType":type(error).__name__}));raise SystemExit(1)
'''


def main():
    need(len(sys.argv) == 1, "NO_PATH_OVERRIDES_ALLOWED")
    paths = {
        "stage": DOCS / "stage-execution.json",
        "qualification": DOCS / "deployment-qualify-backup-execution.json",
        "deployment": DOCS / "deployment-deploy-execution.json",
    }
    coordinator_bytes = {name: local_bytes(path) for name, path in paths.items()}
    envelopes = {name: decode(data) for name, data in coordinator_bytes.items()}
    need(envelopes["stage"].get("exit") == 0, "STAGE_NOT_ACCEPTED")
    stage = decode(envelopes["stage"].get("stdout", ""))
    need(stage.get("sourceSha") == SHA and stage.get("exit") == 0 and stage.get("productionChanged") is False, "STAGE_COORDINATOR_IDENTITY")
    need(stage.get("releaseDir") == RELEASE and stage.get("candidateTag") == IMAGE_TAG, "STAGE_RELEASE_PATH")
    need(IMAGE.fullmatch(stage.get("candidateImage", "")) and HEX.fullmatch(stage.get("stageManifestSha256", "")), "STAGE_PINS")
    need(re.fullmatch("tadazz-codex-" + SHA[:12] + r"-[0-9a-f]{8}", stage.get("sourceRun", "")), "STAGE_SOURCE_RUN")
    _qualification_coordinator, qualification = accepted_action(envelopes["qualification"], "qualify-backup")
    deployment_coordinator, deployment = accepted_action(envelopes["deployment"], "deploy")
    for result in (qualification, deployment):
        need(result.get("image") == stage["candidateImage"], "RESULT_IMAGE_MISMATCH")
    need(qualification.get("kind") == "backup-qualification" and qualification.get("phase") == "qualified" and qualification.get("releaseEligible") is True and qualification.get("candidateCloneBoot", {}).get("passed") is True, "QUALIFICATION_NOT_ACCEPTED")
    need(qualification.get("sourceContainer") == stage.get("productionContainer") and qualification.get("sourceImage") == stage.get("productionImage") and qualification.get("configSha256") == stage.get("runtimeConfigSha256"), "QUALIFICATION_STAGE_BINDING")
    need(qualification.get("deploymentPerformed") is False and qualification.get("productionDataRestored") is False, "QUALIFICATION_SCOPE")
    need(deployment.get("phase") == "verified" and deployment.get("previousContainer") == stage.get("productionContainer") and deployment.get("previousImage") == stage.get("productionImage"), "DEPLOYMENT_STAGE_BINDING")
    need(deployment.get("customerContentPrinted") is False and deployment.get("dataRestorePerformed") is False and deployment.get("otherContainersUnchanged") is True, "DEPLOYMENT_SCOPE")
    observed = deployment_coordinator.get("observedContainers", {})
    need(observed.get("tadazz", {}).get("running") is True and observed["tadazz"].get("image") == stage["candidateImage"] and observed["tadazz"].get("id") == deployment.get("replacementContainer"), "DEPLOYMENT_OBSERVATION")
    need(observed.get("tadazz-phone-gateway", {}).get("running") is True and observed["tadazz-phone-gateway"].get("id") == stage.get("gatewayContainer"), "GATEWAY_OBSERVATION")
    qualification_path = result_path(qualification.get("receiptPath"), "backup-qualification-", NAMES[3])
    # Reviewed deploy-mcp-site.py uses the SAME run_id for rollbackContainer
    # and stage/deployment-<run_id>/deployment-result.json. It emits no result
    # path. Derive that public filename without reading/statting any backup.
    rollback_prefix = "tadazz-pre-mcp-" + SHA[:12] + "-"
    rollback = deployment.get("rollbackContainer", "")
    need(rollback.startswith(rollback_prefix) and RUN.fullmatch(rollback[len(rollback_prefix):]), "DEPLOYMENT_RUN_ID")
    deployment_path = result_path(RELEASE + "/deployment-" + rollback[len(rollback_prefix):] + "/" + NAMES[4], "deployment-", NAMES[4])
    qualification_hash = digest(producer_bytes(qualification))
    need(deployment.get("priorRestoreBootQualification", {}).get("sha256") == qualification_hash, "ACCEPTED_QUALIFICATION_HASH")
    remote_paths = {name: RELEASE + "/" + name for name in NAMES[:3]}
    remote_paths.update({NAMES[3]: qualification_path, NAMES[4]: deployment_path})
    config = {
        "sha": SHA, "sourceRun": stage["sourceRun"], "releaseDir": RELEASE,
        "candidateTag": IMAGE_TAG, "candidateImage": stage["candidateImage"],
        "stageManifestSha256": stage["stageManifestSha256"],
        "qualificationSha256": qualification_hash,
        "deploymentSha256": digest(producer_bytes(deployment)), "paths": remote_paths,
    }
    program = REMOTE.replace("c=__CONFIG__", "c=" + repr(config))
    compile(program, "public-release-evidence-remote", "exec")
    result = subprocess.run([
        "ssh", "-i", r"C:\Users\DAVID\.ssh\tadazz_oracle_2026", "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
        "ubuntu@132.145.25.168", "sudo -n python3 -",
    ], input=program.encode("utf-8"), capture_output=True, timeout=60)
    need(result.returncode == 0, "REMOTE_COLLECTION_REFUSED")
    need(len(result.stdout) <= 8 * MAX_FILE_BYTES, "REMOTE_TRANSFER_LIMIT")
    transfer = decode(result.stdout)
    need(transfer.get("ok") is True and transfer.get("sourceSha") == SHA and transfer.get("releaseDir") == RELEASE, "TRANSFER_IDENTITY")
    files = transfer.get("files", {})
    need(set(files) == set(NAMES), "TRANSFER_ALLOWLIST")
    raw = {}
    for name in NAMES:
        record = files[name]
        need(record.get("remotePath") == remote_paths[name] and HEX.fullmatch(record.get("sha256", "")), "TRANSFER_PATH_PIN")
        raw[name] = base64.b64decode(record.get("base64", ""), validate=True)
        need(0 < len(raw[name]) <= MAX_FILE_BYTES and len(raw[name]) == record.get("bytes") and digest(raw[name]) == record["sha256"], "TRANSFER_BYTES_MISMATCH")
    need(digest(raw[NAMES[1]]) == config["stageManifestSha256"], "LOCAL_STAGE_HASH")
    need(digest(raw[NAMES[2]]) == decode(raw[NAMES[1]]).get("syntheticSmokeSha256"), "LOCAL_SMOKE_HASH")
    need(digest(raw[NAMES[3]]) == qualification_hash and digest(raw[NAMES[4]]) == config["deploymentSha256"], "LOCAL_RESULT_HASH")
    for name, path in paths.items():
        need(local_bytes(path) == coordinator_bytes[name], "COORDINATOR_CHANGED_DURING_COLLECTION")
    manifest = {
        "format": "tadazz-public-release-evidence-retrieval", "version": 1,
        "sourceSha": SHA, "sourceRun": stage["sourceRun"], "releaseDir": RELEASE,
        "candidateImage": stage["candidateImage"], "collectedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "copiedActualDiskBytes": True, "privateFilesRead": False, "productionChanged": False,
        "coordinators": {name: {"path": str(paths[name]), "sha256": digest(data)} for name, data in coordinator_bytes.items()},
        "files": [{"remotePath": remote_paths[name], "localPath": str(DESTINATION / name), "sha256": digest(raw[name]), "bytes": len(raw[name])} for name in NAMES],
    }
    plain_local(DOCS, directory=True)
    if DESTINATION.exists() or DESTINATION.is_symlink():
        plain_local(DESTINATION, directory=True)
        need(set(path.name for path in DESTINATION.iterdir()) == set(NAMES) | {"retrieval-manifest.json"}, "EXISTING_EVIDENCE_SET")
        for name in NAMES:
            need(local_bytes(DESTINATION / name) == raw[name], "EXISTING_EVIDENCE_MISMATCH")
        retained = decode(local_bytes(DESTINATION / "retrieval-manifest.json"))
        need(retained.get("sourceSha") == SHA and retained.get("files") == manifest["files"] and retained.get("coordinators") == manifest["coordinators"], "EXISTING_RETRIEVAL_MISMATCH")
    else:
        pending = Path(tempfile.mkdtemp(prefix=".release-evidence-", dir=DOCS))
        plain_local(pending, directory=True)
        for name in NAMES:
            with (pending / name).open("xb") as stream:
                stream.write(raw[name])
        with (pending / "retrieval-manifest.json").open("xb") as stream:
            stream.write(producer_bytes(manifest))
        pending.rename(DESTINATION)
    print(json.dumps({"ok": True, "sourceSha": SHA, "evidenceDirectory": str(DESTINATION),
                      "retrievalManifestSha256": digest(local_bytes(DESTINATION / "retrieval-manifest.json")),
                      "files": manifest["files"]}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except EvidenceError as error:
        print(json.dumps({"ok": False, "code": str(error)}))
        raise SystemExit(1) from None
    except Exception as error:
        print(json.dumps({"ok": False, "code": "EVIDENCE_COLLECTION_FAILED", "errorType": type(error).__name__}))
        raise SystemExit(1) from None
