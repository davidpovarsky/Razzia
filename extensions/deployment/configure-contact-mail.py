#!/usr/bin/env python3
"""Configure one contact recipient on the exact running image; never deploy code.

The operator retains the existing image, entrypoint, secrets, volumes and host
configuration. It first takes a consistent private backup and proves the new
setting on an isolated restored clone. Rollback restarts the retained container
against current data; it never restores an archive over customer writes.
"""
import argparse
import copy
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import tempfile
import uuid

SPEC = importlib.util.spec_from_file_location("contact_release_guards", Path(__file__).with_name("deploy-mcp-site.py"))
OP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OP)
ENV_FILE = Path("/var/lib/tadazz-release-5312660/runtime.env")


def environment_bytes(data, recipient):
    text = data.decode("utf-8")
    lines, found = text.splitlines(keepends=True), 0
    for index, line in enumerate(lines):
        if re.match(r"^\s*TADAZZ_CONTACT_EMAIL_TO\s*=", line):
            found += 1
            lines[index] = "TADAZZ_CONTACT_EMAIL_TO=" + recipient + ("\r\n" if line.endswith("\r\n") else "\n")
    OP.require(found <= 1, "CONTACT_ENV_DUPLICATE")
    if not found:
        if lines and not lines[-1].endswith(("\r", "\n")):
            lines[-1] += "\n"
        lines.append("TADAZZ_CONTACT_EMAIL_TO=" + recipient + "\n")
    return "".join(lines).encode("utf-8")


def private_env():
    path = OP.plain_path(ENV_FILE, directory=False, root_owned=True)
    info = path.stat()
    OP.require(stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1, "CONTACT_ENV_FILE_UNSAFE")
    data = path.read_bytes()
    OP.require(len(data) <= 1024 * 1024, "CONTACT_ENV_FILE_SIZE")
    return data


def replace_private_env(expected, desired):
    OP.require(private_env() == expected, "CONTACT_ENV_CHANGED")
    handle, name = tempfile.mkstemp(prefix=".contact-env-", dir=ENV_FILE.parent)
    with os.fdopen(handle, "wb") as output:
        output.write(desired)
        output.flush()
        os.fsync(output.fileno())
    # Both old and new files are root-owned 0600; no unrelated setting changes.
    os.replace(name, ENV_FILE)
    descriptor = os.open(ENV_FILE.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def payload_for(original, recipient):
    payload = copy.deepcopy(original["Config"])
    environment = OP.env_map(payload.get("Env"))
    OP.require(environment.get("RESEND_API_KEY") and
               (environment.get("TADAZZ_CONTACT_EMAIL_FROM", "").strip() or
                environment.get("TADAZZ_AUTH_EMAIL_FROM", "").strip()), "CONTACT_MAIL_TRANSPORT_REQUIRED")
    environment["TADAZZ_CONTACT_EMAIL_TO"] = OP.contact_email_to(argparse.Namespace(contact_email_to=recipient))
    payload["Env"] = [name + "=" + value for name, value in environment.items()]
    payload["Image"] = original["Image"]
    payload["HostConfig"] = copy.deepcopy(original["HostConfig"])
    return payload


def baseline(args):
    original = OP.inspect("tadazz")
    OP.require(original["Id"] == args.expected_container and original["Image"] == args.expected_image and
               original["State"]["Running"] and not original["State"].get("Paused"), "CONTACT_CONTAINER_CHANGED")
    mounts = original["Mounts"]
    OP.require(len(mounts) == 1 and mounts[0]["Type"] == "bind" and
               mounts[0]["Source"] == str(OP.CONFIG_ROOT) and mounts[0]["Destination"] == "/app/config" and
               mounts[0]["RW"] is True, "CONTACT_CONFIG_MOUNT_CHANGED")
    others = {}
    for item in OP.docker_api("GET", "/containers/json?all=0"):
        if item["Id"] != original["Id"]:
            container = OP.inspect(item["Id"])
            others[item["Id"]] = (container["Image"], container["State"]["StartedAt"])
    OP.require(hashlib.sha256(OP.canonical(others)).hexdigest() == args.expected_others_sha256,
               "CONTACT_OTHER_CONTAINERS_CHANGED")
    data = private_env()
    OP.require(hashlib.sha256(data).hexdigest() == args.expected_env_sha256, "CONTACT_ENV_PIN_CHANGED")
    return original, others, data


def verify_live():
    OP.json_probe(OP.PUBLIC_ORIGIN, "/api/health", expected={"status": "ok"})
    OP.json_probe(OP.PUBLIC_ORIGIN, "/api/auth/mode", expected={"accountsEnabled": True})
    return {label: OP.contact_mail_probe(origin) for origin, label in
            ((OP.LOCAL_ORIGIN, "loopback"), (OP.PUBLIC_ORIGIN, "publicHttps"))}


def qualify_clone(original, payload, work, run_id):
    restored = OP.plain_path(work / "restore-private", root_owned=True)
    clone_payload = copy.deepcopy(payload)
    clone_payload["HostConfig"] = {
        "NetworkMode": "none", "Binds": [str(restored) + ":/app/config:rw"],
        "PortBindings": {}, "RestartPolicy": {"Name": "no"}, "Memory": 1024**3,
        "NanoCpus": 1000000000, "PidsLimit": 256, "Privileged": False,
        "LogConfig": {"Type": "json-file", "Config": {"max-size": "5m", "max-file": "1"}},
    }
    name = "tadazz-contact-clone-" + run_id
    identity = OP.docker_api("POST", "/containers/create?name=" + name, clone_payload)["Id"]
    try:
        clone = OP.inspect(identity)
        OP.require(clone["Image"] == original["Image"] and OP.env_map(clone["Config"]["Env"]) == OP.env_map(payload["Env"]),
                   "CONTACT_CLONE_IMAGE_ENV_CHANGED")
        OP.require(clone["HostConfig"]["NetworkMode"] == "none" and not clone["HostConfig"]["PortBindings"] and
                   len(clone["Mounts"]) == 1 and clone["Mounts"][0]["Source"] == str(restored) and
                   clone["Mounts"][0]["Destination"] == "/app/config" and clone["Mounts"][0]["RW"] is True,
                   "CONTACT_CLONE_ISOLATION_FAILED")
        OP.docker_api("POST", "/containers/" + identity + "/start")
        program = r'''
const http=require("node:http");
function get(path){return new Promise((resolve,reject)=>{
 const q=http.request({host:"127.0.0.1",port:3000,path,headers:{Host:"tadazz.com"},timeout:2500},r=>{
  let body="";r.on("data",c=>{body+=c;if(body.length>4096){q.destroy();reject(Error("limit"));}});
  r.on("end",()=>{try{if(r.statusCode!==200)throw Error("status");resolve({value:JSON.parse(body),headers:r.headers});}catch(e){reject(e);}});
 });q.on("error",reject);q.on("timeout",()=>q.destroy(Error("timeout")));q.end();
});}
(async()=>{
 let healthy=false;const deadline=Date.now()+25000;
 while(Date.now()<deadline){try{if((await get("/api/health")).value.status==="ok"){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 if(!healthy)throw Error("health");
 if((await get("/api/auth/mode")).value.accountsEnabled!==true)throw Error("accounts");
 const contact=await get("/api/contact/config");
 if(JSON.stringify(contact.value)!==JSON.stringify({available:true})||
    contact.headers["cache-control"]!=="no-store"||
    !String(contact.headers["content-type"]).startsWith("application/json"))throw Error("contact");
 process.stdout.write(JSON.stringify({healthy:true,accountsEnabled:true,contactAvailable:true,noStore:true,messageSent:false}));
})().catch(()=>{process.stdout.write(JSON.stringify({failed:true}));process.exitCode=1;});
'''
        execution = OP.docker_api("POST", "/containers/" + identity + "/exec",
                                 {"AttachStdout": True, "AttachStderr": True, "Tty": False, "Cmd": ["node", "-e", program]})
        output = OP.docker_bytes("POST", "/exec/" + execution["Id"] + "/start", {"Detach": False, "Tty": False}, limit=8192)
        status = OP.docker_api("GET", "/exec/" + execution["Id"] + "/json")
        proof = json.loads(OP.decode_logs(output))
        OP.require(not status["Running"] and status["ExitCode"] == 0 and proof ==
                   {"healthy": True, "accountsEnabled": True, "contactAvailable": True, "noStore": True, "messageSent": False},
                   "CONTACT_CLONE_PROOF_FAILED")
        return {"container": identity, "image": original["Image"], "network": "none", "liveConfigMounted": False, **proof}
    finally:
        if OP.inspect(identity)["State"]["Running"]:
            OP.docker_api("POST", "/containers/" + identity + "/stop?t=35")


def apply(args, work, original, others, before):
    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    recipient = OP.contact_email_to(args)
    payload, after = payload_for(original, recipient), environment_bytes(before, recipient)
    backup_name, pending_name = "tadazz-pre-contact-" + run_id, "tadazz-contact-pending-" + run_id
    report = {"operation": "same-image-contact-configuration", "runId": run_id,
              "operatorSha256": OP.sha256(Path(__file__)), "guardSha256": OP.sha256(Path(OP.__file__)),
              "success": False, "image": original["Image"],
              "previousContainer": original["Id"], "recipient": recipient, "codeDeployed": False,
              "customerDataRestored": False, "messageSent": False, "rollbackContainer": backup_name}
    replacement_id, stopped = None, False
    (work / "original-runtime.env").write_bytes(before)
    (work / "original-runtime.env").chmod(0o600)
    try:
        report["roomGateBeforeBackup"] = OP.game_count_evidence(original)
        stopped = True
        OP.docker_api("POST", "/containers/" + original["Id"] + "/stop?t=35")
        OP.require(not OP.inspect(original["Id"])["State"]["Running"], "CONTACT_STOP_FAILED")
        try:
            expected, report["backup"] = OP.archive_private_backup(OP.CONFIG_ROOT, work)
        finally:
            OP.docker_api("POST", "/containers/" + original["Id"] + "/start")
            OP.wait_health()
        OP.qualify_private_archive(work, expected, report["backup"])
        report["clone"] = qualify_clone(original, payload, work, run_id)
        fresh, fresh_others, fresh_env = baseline(args)
        OP.require(fresh["Config"] == original["Config"] and fresh["HostConfig"] == original["HostConfig"] and
                   fresh_others == others and fresh_env == before, "CONTACT_BASELINE_CHANGED_AFTER_CLONE")
        report["roomGateBeforeCutover"] = OP.game_count_evidence(fresh)
        OP.docker_api("POST", "/containers/" + original["Id"] + "/stop?t=35")
        OP.require(not OP.inspect(original["Id"])["State"]["Running"], "CONTACT_STOP_FAILED")
        OP.docker_api("POST", "/containers/" + original["Id"] + "/rename?name=" + backup_name)
        try:
            replacement_id = OP.docker_api("POST", "/containers/create?name=" + pending_name, payload)["Id"]
        except Exception:
            try:
                possible = OP.inspect(pending_name)
                OP.verify_replacement(original, possible, payload)
                replacement_id = possible["Id"]
            except Exception:
                pass
            raise
        OP.verify_replacement(original, OP.inspect(replacement_id), payload)
        OP.docker_api("POST", "/containers/" + replacement_id + "/rename?name=tadazz")
        OP.docker_api("POST", "/containers/" + replacement_id + "/start")
        OP.wait_health()
        OP.verify_replacement(original, OP.inspect(replacement_id), payload)
        report["publicChecks"] = verify_live()
        OP.other_containers_unchanged(others, replacement_id)
        replace_private_env(before, after)
        report.update(success=True, replacementContainer=replacement_id,
                      environmentChangedOnly=["TADAZZ_CONTACT_EMAIL_TO"], runtimeEnvSha256=hashlib.sha256(after).hexdigest(),
                      previousContainerRetainedStopped=not OP.inspect(original["Id"])["State"]["Running"])
    except BaseException as error:
        report["failureCode"] = str(error) if isinstance(error, OP.GateError) else type(error).__name__
        if stopped:
            for sig in (signal.SIGINT, signal.SIGTERM):
                signal.signal(sig, signal.SIG_IGN)
            try:
                current = private_env()
                if current == after and current != before:
                    replace_private_env(after, before)
                else:
                    OP.require(current == before, "CONTACT_ENV_ROLLBACK_CONFLICT")
            except BaseException as env_error:
                report["runtimeEnvRollbackFailure"] = str(env_error) if isinstance(env_error, OP.GateError) else type(env_error).__name__
            try:
                OP.rollback_container(original, replacement_id, "tadazz-contact-failed-" + run_id, report)
            except BaseException as rollback_error:
                report["rollbackFailure"] = str(rollback_error) if isinstance(rollback_error, OP.GateError) else type(rollback_error).__name__
        raise
    finally:
        OP.write_private_json(work / "contact-configuration-result.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--action", choices=("preflight", "apply"), default="preflight")
    parser.add_argument("--expected-container", required=True)
    parser.add_argument("--expected-image", required=True)
    parser.add_argument("--expected-others-sha256", required=True)
    parser.add_argument("--expected-env-sha256", required=True)
    parser.add_argument("--contact-email-to", required=True)
    parser.add_argument("--work-dir", required=True)
    args = parser.parse_args()
    OP.require(os.geteuid() == 0, "LINUX_ROOT_REQUIRED")
    os.umask(0o077)
    OP.contact_email_to(args)
    OP.require(OP.HEX_RE.fullmatch(args.expected_container) and OP.IMAGE_RE.fullmatch(args.expected_image) and
               OP.HEX_RE.fullmatch(args.expected_others_sha256) and OP.HEX_RE.fullmatch(args.expected_env_sha256),
               "CONTACT_PINS_INVALID")
    work = Path(args.work_dir)
    OP.require(work.parent == Path("/home/ubuntu") and re.fullmatch(r"tadazz-contact-maintenance-[A-Za-z0-9-]+", work.name)
               and not work.exists(), "CONTACT_WORK_DIR_INVALID")
    descriptor, handlers = OP.acquire_deploy_lock(), {}
    try:
        original, others, before = baseline(args)
        payload_for(original, args.contact_email_to)
        environment_bytes(before, args.contact_email_to)
        room = OP.game_count_evidence(original)
        _, backup_bytes, _ = OP.tree_manifest(OP.CONFIG_ROOT)
        OP.require(OP.shutil.disk_usage(work.parent).free >= 3 * backup_bytes + 1024**3, "BACKUP_DISK_RESERVE")
        if args.action == "preflight":
            print(json.dumps({"preflight": "PASS", "productionChanged": False, "roomGate": room,
                              "image": original["Image"], "recipient": args.contact_email_to,
                              "backupDataBytes": backup_bytes, "requiredFreeBytes": 3 * backup_bytes + 1024**3}))
            return
        if OP.env_map(original["Config"]["Env"]).get("TADAZZ_CONTACT_EMAIL_TO") == args.contact_email_to and environment_bytes(before, args.contact_email_to) == before:
            print(json.dumps({"success": True, "alreadyConfigured": True, "productionChanged": False,
                              "publicChecks": verify_live()}))
            return
        OP.plain_path(work.parent)
        work.mkdir(mode=0o700)
        for sig in (signal.SIGINT, signal.SIGTERM):
            handlers[sig] = signal.signal(sig, lambda signum, frame: (_ for _ in ()).throw(OP.GateError("CONTACT_INTERRUPTED")))
        print(json.dumps(apply(args, work, original, others, before)))
    finally:
        for sig, handler in handlers.items():
            signal.signal(sig, handler)
        os.close(descriptor)


if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        print(json.dumps({"success": False, "failureCode": str(error) if isinstance(error, OP.GateError) else type(error).__name__}))
        raise SystemExit(1)
