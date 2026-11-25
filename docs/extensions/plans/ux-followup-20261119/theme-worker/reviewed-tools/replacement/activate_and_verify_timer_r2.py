#!/usr/bin/env python3
"""Phase 3 only. Requires separately reviewed admission after successful app observation."""
import argparse,datetime,hashlib,json,os,posixpath,re,stat,subprocess,sys,time
from pathlib import Path
from decimal import Decimal, InvalidOperation, localcontext
NAMESPACE=Path("/home/ubuntu/tadazz-theme-worker-ux-followup-20261119")
HERE=NAMESPACE/"inputs/replacement"
SOURCE="34568c5c937a51d236a440513adeb9bf93637525"
OLD_IMAGE="sha256:aea88c60c29d5160dfe5ae822179da4233ed882c3979b4d592f6cd86902e05c5"
NEW_IMAGE="sha256:4ef04ef752c23e5360399880f1bcf4c79c0f48900c9597bcaa68da8aa01d1411"
SOURCE_PINS="751fa33e6591657fa40d14f99eb0f6eca775787e7ff5f0b18989bb69c73a89dd"
BROKER=Path("/opt/tadazz-package-runtime/package-build-worker.py")
BROKER_SHA="7b591a69dd4aca951cf0f8224670c797696979085ae23c01d596ab99159d60d6"
UNIT=Path("/etc/systemd/system/tadazz-package-builder.service")
UNIT_BEFORE="64c191c2e03a28f134219b17295389e041d3e5ef71093a5912cd397f9ec69053"
UNIT_AFTER="7bfd2b44f2409588f162e278e2b3eb5a8671f61d81f1609ad29292608231559c"
SERVICE="tadazz-package-builder.service"
TIMER="tadazz-package-builder.timer"
STORE=Path("/var/lib/tadazz-release-5312660/config/extensions/packages")
CACHE="07b64bb4f99518e306a2e3f5a693266a6ca543fdd1676627161af7077e818872"
COMPILE_RECEIPT=NAMESPACE/"evidence/compile-4ef04ef7/receipt.json"
COMPILE_SHA="2e7f9f814b0b1c04a6d74c16760fdaced68075c0a88ec759f3e36dcff8b38bbe"
INPUT_MANIFEST_SHA="8d9432822cb94d93fa6a461804a3760f1734e414f737376a34f9b8c1bf49b80f"
RUN=NAMESPACE/"evidence/phase3-timer-4ef04ef7-r2"
PRIOR_RECEIPT=NAMESPACE/"evidence/phase3-timer-4ef04ef7/receipt.json"
PRIOR_RECEIPT_SHA="d05873d0ad9c016e4e3e25f4e9787783ca04997b6a48c479c14f02b3aeeae6e4"
PRIOR_OWNED_PROOF_SHA="9553fec3c6ecf313804467f369f372722331fe9ee93eb4270a7bfd1eb2a49c7e"
RECORD_SOURCE_PATHS={
 "stage-execution.json":"docs/extensions/plans/ux-followup-20261119/stage-execution.json",
 "deployment-deploy-execution.json":"docs/extensions/plans/ux-followup-20261119/deployment-deploy-execution.json",
 "post-deploy-execution.json":"docs/extensions/plans/ux-followup-20261119/post-deploy-worker-recovery-execution.json",
 "post-deploy-observation.json":"docs/extensions/plans/ux-followup-20261119/post-deploy-worker-recovery-observation.json",
}
MAX_TIMER_WAIT=90
APP_IMAGE="sha256:56de89dd9ca496595980af84a7187b49fbff8c0cb563c3393c269d2b7c09d82a"
APP_CONTAINER="090d26a2fe7dd98a43226288932b7387bb9ec847cee5e5e2ff6ef48b6444bf40"
GATEWAY="c29ea46f10ff6da76428b2f296ff1468c512ec9e2af76eba552d7a144766b202"
STAGE_SHA="a6b63581f573f04a117fdf3d86062be18bfdc73ae0435a629eafc7fc23f34b62"
RUNTIME=Path("/var/lib/tadazz-release-5312660/config/extensions/mcp-service/runtime.json")
RUNTIME_SHA="6524e1e0a86be5e0ec497be239a7889f53ad4425e4d3aeec285364fc5db9e9b5"
STATIC_PROPERTIES=["Type","WorkingDirectory","TimeoutStartUSec","TimeoutStopUSec","KillMode","PrivateTmp","ProtectSystem","ProtectHome","NoNewPrivileges","MemoryMax","TasksMax","CPUQuotaPerSecUSec","CapabilityBoundingSet","ReadWritePaths","ReadOnlyPaths","RuntimeDirectory","RootDirectory","UnitFileState"]
def monotonic_microseconds(value):
    # systemd format_timespan: src/basic/time-util.c and exact factors in time-util.h.
    require(isinstance(value,str) and 0<len(value)<=160,"Bounded systemd monotonic string required")
    require(value==value.strip(),"Unexpected monotonic whitespace")
    maximum=(1<<64)-2  # UINT64_MAX is systemd USEC_INFINITY
    if re.fullmatch(r"[0-9]{1,20}",value):
        result=int(value);require(result<=maximum,"Monotonic integer exceeds uint64");return result
    factors={"y":31557600000000,"month":2629800000000,"w":604800000000,"d":86400000000,"h":3600000000,"min":60000000,"s":1000000,"ms":1000,"us":1}
    units=list(factors);previous=-1;total=0
    tokens=value.split(" ")
    require(1<=len(tokens)<=len(units) and all(tokens),"Invalid systemd timespan tokenization")
    with localcontext() as context:
        context.prec=80
        for index,token in enumerate(tokens):
            match=re.fullmatch(r"([0-9]{1,20}(?:\.[0-9]{1,18})?)(month|min|ms|us|y|w|d|h|s)",token)
            require(match is not None,"Unknown or negative systemd timespan token")
            amount,unit=match.groups();position=units.index(unit)
            require(position>previous,"Duplicate or unordered systemd timespan units")
            require("." not in amount or index==len(tokens)-1,"Fraction must occur only in the final unit")
            micros=Decimal(amount)*factors[unit]
            require(micros==micros.to_integral_value(),"Sub-microsecond systemd value rejected")
            total+=int(micros);require(total<=maximum,"Monotonic timespan exceeds uint64")
            previous=position
    return total
def sha(data): return hashlib.sha256(data).hexdigest()
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def require(ok,message):
    if not ok: raise RuntimeError(message)
def regular(file,limit=2_000_000):
    require(not file.is_symlink() and file.is_file(),"Regular non-symlink file required: "+str(file))
    require(file.stat().st_size<=limit,"File exceeds bound")
    return file.read_bytes()
def confined(root,relative):
    require(isinstance(relative,str) and relative and "\\" not in relative,"Invalid relative path")
    part=Path(relative)
    require(not part.is_absolute() and ".." not in part.parts,"Path traversal denied")
    file=root/part
    require(file.resolve().is_relative_to(root.resolve()),"Path escapes owned root")
    for parent in [file,*file.parents]:
        if parent==root: break
        require(not parent.is_symlink(),"Symlink path denied")
    return file
def command(args,timeout=15):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    require(p.returncode==0,"Named operator command failed: "+args[0]+" "+args[1])
    return p.stdout.strip()
def docker(args): return command(["/usr/bin/docker",*args])
def props(name,keys):
    args=["/usr/bin/systemctl","show",name]
    for key in keys:args.extend(["-p",key])
    return dict(line.split("=",1) for line in command(args).splitlines() if "=" in line)
def service():
    value=props(SERVICE,["FragmentPath","DropInPaths","ExecStart","User","Group","ActiveState","SubState","Result","ExecMainStatus",*STATIC_PROPERTIES])
    require(value["FragmentPath"]==str(UNIT) and not value["DropInPaths"],"Effective service file/drop-ins changed")
    require(value["User"] in ("","root") and value["Group"] in ("","root"),"Unexpected broker service identity")
    match=re.search(r"/usr/bin/python3 /opt/tadazz-package-runtime/package-build-worker\.py ([^\s;]+) --image (sha256:[0-9a-f]{64})(?:\s|;|$)",value.pop("ExecStart"))
    require(match is not None,"Effective service argv differs from reviewed broker")
    value.update({"store":match[1],"image":match[2]})
    require(value["store"]==str(STORE),"Effective worker store changed")
    return value
def effective_static(value):
    return {key:value[key] for key in ["FragmentPath","DropInPaths","User","Group","store",*STATIC_PROPERTIES]}
def runtime_unchanged():
    require(sha(regular(RUNTIME))==RUNTIME_SHA,"Accepted runtime configuration hash changed")
def drain_service(max_seconds=50):
    deadline=time.monotonic()+max_seconds
    while True:
        value=service()
        if value["ActiveState"] not in ("active","activating","deactivating"):return value
        require(time.monotonic()<deadline,"Existing broker remained busy; no running job killed and published inputs retained")
        time.sleep(1)
def timer():
    value=props(TIMER,["ActiveState","SubState","UnitFileState","LastTriggerUSec","LastTriggerUSecMonotonic","Triggers","Unit"])
    require(value.get("Triggers","").split()==[SERVICE],"Named timer must trigger the reviewed broker service only")
    if value.get("Unit"):require(value["Unit"]==SERVICE,"Timer target unit mismatch")
    return value
def cache_stopped():
    require(docker(["container","inspect","--format","{{.State.Status}}",CACHE])=="exited","Original QA cache must remain stopped")
def app_binding(admission):
    identity=json.loads(docker(["inspect","--format",'{"id":{{json .Id}},"image":{{json .Image}},"workingDir":{{json .Config.WorkingDir}},"running":{{json .State.Running}},"restarts":{{json .RestartCount}}}',"tadazz"]))
    require(identity["id"]==admission["container"] and identity["image"]==admission["image"] and identity["running"] and identity["restarts"]==0,"Accepted deployed app identity changed")
    gateway=json.loads(docker(["inspect","--format",'{"id":{{json .Id}},"running":{{json .State.Running}}}',"tadazz-phone-gateway"]))
    require(gateway["id"]==admission["gateway"] and gateway["running"],"Accepted gateway identity changed")
    env=docker(["inspect","--format",'{{range .Config.Env}}{{if eq (index (split . "=") 0) "CONFIG_PATH"}}{{println .}}{{end}}{{end}}',"tadazz"])
    require(env.startswith("CONFIG_PATH=") and "\n" not in env,"One explicit CONFIG_PATH required")
    config=posixpath.normpath(posixpath.join(identity["workingDir"] or "/",env.partition("=")[2]))
    container_store=posixpath.join(config,"extensions/packages")
    parents=[container_store];cursor=container_store
    while cursor!="/":cursor=posixpath.dirname(cursor);parents.append(cursor)
    predicate="(or "+" ".join("(eq .Destination "+json.dumps(p)+")" for p in parents)+")"
    template="{{range .Mounts}}{{if "+predicate+"}}"+'{"type":{{json .Type}},"source":{{json .Source}},"destination":{{json .Destination}},"rw":{{json .RW}}}'+"{{println}}{{end}}{{end}}"
    mounts=[json.loads(line) for line in docker(["inspect","--format",template,"tadazz"]).splitlines() if line.strip()]
    require(bool(mounts),"Config bind missing")
    mount=max(mounts,key=lambda item:len(item["destination"]))
    require(mount["type"]=="bind" and mount["rw"] is True,"Writable config bind required")
    store=posixpath.normpath(posixpath.join(mount["source"],posixpath.relpath(posixpath.join(config,"extensions/packages"),mount["destination"])))
    require(store==str(STORE) and config=="/app/config","Accepted application/store binding differs")
    require(STORE.is_dir() and STORE.resolve()==STORE,"Store path identity changed")
    return {"app":identity,"gateway":gateway,"configPath":config,"mount":mount,"mappedStore":store}
def write_exclusive(file,data,mode=0o600):
    fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,"wb") as output:output.write(data);output.flush();os.fsync(output.fileno())
def replace_unit(data,expected):
    require(sha(regular(UNIT))==expected,"Unit changed before replacement")
    temporary=UNIT.with_name(UNIT.name+".ux-followup-20261119.tmp")
    write_exclusive(temporary,data,0o644)
    os.chown(temporary,0,0)
    require(sha(regular(UNIT))==expected,"Unit changed during replacement")
    os.replace(temporary,UNIT)
    fd=os.open(UNIT.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
def load_admission(expected_hash):
    require(re.fullmatch("[a-f0-9]{64}",expected_hash) is not None,"Exact admission SHA-256 required")
    data=regular(HERE/"phase3-admission-r2.json")
    require(sha(data)==expected_hash,"Admission digest mismatch")
    a=json.loads(data)
    require(a["status"]=="READY_FOR_REVIEWED_PHASE3" and a["sourceSha"]==SOURCE and a["workerImage"]==NEW_IMAGE,"Admission is pending or for a different release")
    require(a["container"]==APP_CONTAINER and a["image"]==APP_IMAGE and a["gateway"]==GATEWAY,"Exact accepted app/gateway identity required")
    require(a["helperSha256"]==sha(regular(Path(__file__))) and a["unitBeforeSha256"]==UNIT_BEFORE and a["unitAfterSha256"]==UNIT_AFTER,"Admission helper/unit pin mismatch")
    required={"stage-execution.json","deployment-deploy-execution.json","post-deploy-execution.json","post-deploy-observation.json"}
    require(set(a["records"])==required,"Exact four release guard records required")
    require(a["recordSourcePaths"]==RECORD_SOURCE_PATHS,"Recovery record source provenance changed")
    records={}
    for name,pin in a["records"].items():
        blob=regular(confined(HERE/"phase3-admission-records-r2",name),4_000_000)
        require(sha(blob)==pin,"Release record changed: "+name)
        if name=="stage-execution.json":require(pin==STAGE_SHA,"Qualified stage receipt changed")
        records[name]=json.loads(blob)
    stage_outer=records["stage-execution.json"]
    require(stage_outer["exit"]==0,"Staging did not pass")
    stage=json.loads(stage_outer["stdout"])
    require(stage["exit"]==0 and stage["sourceSha"]==SOURCE and stage["candidateImage"]==APP_IMAGE and stage["gatewayContainer"]==GATEWAY and stage["runtimeConfigSha256"]==RUNTIME_SHA and stage["cacheRestoredStopped"] is True,"Qualified stage identity/runtime pin mismatch")
    deployment=records["deployment-deploy-execution.json"]
    require(deployment["exit"]==0 and deployment["action"]=="deploy","Deployment outer envelope did not pass")
    remote=json.loads(deployment["stdout"])
    require(remote["exit"]==remote["childExit"]==0 and remote["action"]=="deploy" and remote["deadlineExceeded"] is False and remote["stateRequiresInspection"] is False and remote["sourceSha"]==SOURCE,"Deployment remote envelope did not pass")
    core=json.loads(remote["stdout"])
    require(core["success"] is True and core["phase"]=="verified" and core["revision"]==SOURCE and core["image"]==APP_IMAGE and core["replacementContainer"]==APP_CONTAINER,"Deployment core did not verify exact release")
    require(all(core[key] is True for key in ["mountsUnchanged","hostConfigurationUnchanged","otherContainersUnchanged"]) and core["dataRestorePerformed"] is False,"Deployment preservation gates failed")
    require(core["previousContainer"]==stage["productionContainer"] and APP_CONTAINER!=stage["productionContainer"],"New release identity missing")
    current=remote["observedContainers"]["tadazz"];gateway=remote["observedContainers"]["tadazz-phone-gateway"]
    require(current["id"]==APP_CONTAINER and current["image"]==APP_IMAGE and current["running"] is True and current["restartCount"]==0 and gateway["id"]==GATEWAY and gateway["running"] is True,"Deployment observed containers mismatch")
    observation=records["post-deploy-observation.json"]
    require(records["post-deploy-execution.json"]["exit"]==0 and json.loads(records["post-deploy-execution.json"]["stdout"])==observation,"Accepted observation envelope mismatch")
    require(observation["passed"] is True and observation["runtimeConfigHashUnchanged"] is True and observation["cacheRestoredStopped"] is True,"Observer gates did not pass")
    require(observation["sourceSha"]==SOURCE and observation["sourceRun"]==stage["sourceRun"] and all(observation[key]==a[key] for key in ("container","image","gateway")),"Accepted source/container/image/gateway mismatch")
    inner=observation["observation"]
    require(inner["passed"] is True and inner["restartsDuringWindow"]==0 and inner["endingSnapshot"]["releaseIdentityVerified"] is True and inner["endingSnapshot"]["gatewayIdentityVerified"] is True and all(inner[key]==a[key] for key in ("container","image","gateway")),"Inner observation did not verify the exact healthy release")
    finished=datetime.datetime.fromisoformat(inner["finishedAt"].replace("Z","+00:00"))
    require(finished.tzinfo is not None,"Timezone-aware accepted observer time required")
    age=(datetime.datetime.now(datetime.timezone.utc)-finished).total_seconds()
    require(0<=age<=1200,"Accepted observation is stale or in the future; bounded fresh observation required")
    return a
def verify_prior_owned():
    raw=regular(PRIOR_RECEIPT)
    require(sha(raw)==PRIOR_RECEIPT_SHA,"Prior failed-attempt receipt changed")
    prior=json.loads(raw)
    require(prior["status"]=="FAIL" and prior["sourceSha"]==SOURCE and prior["workerImage"]==NEW_IMAGE,"Exact prior attempt identity required")
    require(prior["rollback"]["unitRestored"] is True and prior["rollback"]["timerLeftStopped"] is True and prior["rollback"]["serviceState"]=="inactive" and prior["cleanup"]["removed"] is False,"Exact preserved rollback state required")
    proof_raw=regular(HERE/"phase3-retained-owned-result.json")
    require(sha(proof_raw)==PRIOR_OWNED_PROOF_SHA,"Retained owned result proof changed")
    proof=json.loads(proof_raw)
    require(proof["priorFailureReceiptSha256"]==PRIOR_RECEIPT_SHA and proof["retainedOwnedResultValidated"] is True,"Owned retained-result proof invalid")
    require(proof["tenant"]=="975cf0bc96ad9d54014b0cb115ae3a841ff1f80a72511a3ea428083ce3da4639" and proof["uploadId"]=="c1869a7e-4587-4edd-acc8-c28244723d52","Prior owned fixture identity changed")
    require(set(proof["files"])=={"source.tadazz","request.json","result.json","bundle.json"},"Exact prior owned file inventory required")
    tenant=STORE/proof["tenant"];job=tenant/"jobs"/proof["uploadId"]
    require(not tenant.is_symlink() and not job.parent.is_symlink() and not job.is_symlink() and tenant.stat().st_uid==job.stat().st_uid==0,"Prior owned directory identity changed")
    for name,pin in proof["files"].items():
        blob=regular(job/name,8_000_000)
        require(len(blob)==pin["bytes"] and sha(blob)==pin["sha256"],"Retained owned file changed: "+name)
    return tenant,job,{name:pin["sha256"] for name,pin in proof["files"].items()}
def cleanup_owned(tenant,job,expected,owned):
    require(owned and tenant==STORE/job.parent.parent.name and job.parent.parent==tenant,"Owned fixture path mismatch")
    require(tenant.stat().st_uid==0 and job.stat().st_uid==0 and not tenant.is_symlink() and not job.parent.is_symlink() and not job.is_symlink(),"Owned directory identity changed")
    require(set(p.name for p in job.iterdir())==set(expected),"Unexpected files in owned synthetic job")
    for name,pin in expected.items():
        blob=regular(job/name,8_000_000)
        require(sha(blob)==pin,"Owned fixture file changed before cleanup: "+name)
    for name in sorted(expected): (job/name).unlink()
    job.rmdir();job.parent.rmdir();tenant.rmdir()
    require(not tenant.exists(),"Owned fixture cleanup incomplete")
    return {"removed":True,"tenant":tenant.name,"upload":job.name}
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--execute",action="store_true");p.add_argument("--admission-sha256")
    a=p.parse_args()
    if not a.execute:
        print(json.dumps({"status":"PREPARED_NOT_EXECUTED","phase":3,"workerImage":NEW_IMAGE,"requiresSuccessfulNewAppObservation":True}));return 0
    require(sys.platform=="linux" and os.geteuid()==0 and Path(__file__).resolve().parent==HERE,"Reviewed Linux operator namespace required")
    admission=load_admission(a.admission_sha256 or "")
    cache_stopped();runtime_unchanged()
    prior=regular(COMPILE_RECEIPT)
    require(sha(prior)==COMPILE_SHA,"Accepted phase 2 receipt changed")
    compiled=json.loads(prior)
    require(compiled["status"]=="PASS" and compiled["image"]==NEW_IMAGE and compiled["compilePerformed"] is True and compiled["mediaValidated"] is True and compiled["cleanup"]["removed"] is True,"Actual compiled-worker proof required")
    require(docker(["image","inspect","--format","{{.Id}}",NEW_IMAGE])==NEW_IMAGE,"Proven worker image missing")
    require(docker(["image","inspect","--format",'{{index .Config.Labels "org.tadazz.package-worker.source-manifest-sha256"}}',NEW_IMAGE])==SOURCE_PINS,"Proven image source label mismatch")
    require(sha(regular(BROKER))==BROKER_SHA,"Reviewed broker changed")
    original=regular(UNIT);info=UNIT.stat()
    require(sha(original)==UNIT_BEFORE and stat.S_IMODE(info.st_mode)==0o644 and info.st_uid==info.st_gid==0,"Exact prior service unit required")
    replacement=original.replace(OLD_IMAGE.encode(),NEW_IMAGE.encode())
    require(original.count(OLD_IMAGE.encode())==1 and sha(replacement)==UNIT_AFTER and replacement.replace(NEW_IMAGE.encode(),OLD_IMAGE.encode())==original,"Only reviewed image substitution allowed")
    before_service=service();before_timer=timer();before_binding=app_binding(admission)
    require(before_service["image"]==OLD_IMAGE and before_service["ActiveState"]=="inactive" and before_timer["UnitFileState"]=="enabled" and before_timer["ActiveState"]=="inactive","Exact first-attempt rollback service/timer state required")
    prior_tenant,prior_job,prior_pins=verify_prior_owned()
    manifest_data=regular(HERE/"timer-input-manifest-r2.json")
    require(sha(manifest_data)==INPUT_MANIFEST_SHA,"Timer input manifest changed")
    manifest=json.loads(manifest_data);fixture=manifest["fixture"]
    require(re.fullmatch("[a-f0-9]{64}",fixture["tenant"]) and re.fullmatch("[a-f0-9-]{36}",fixture["uploadId"]),"Unique fixture identity required")
    inputs={}
    for name,pin in manifest["files"].items():
        require(name in ("source.tadazz","request.json","fixture-summary.json"),"Unexpected timer input")
        blob=regular(confined(HERE/"timer-fixture-r2",name))
        require(len(blob)==pin["bytes"] and sha(blob)==pin["sha256"],"Timer input pin mismatch")
        inputs[name]=blob
    require(set(inputs)=={"source.tadazz","request.json","fixture-summary.json"},"Complete pinned fixture required")
    tenant=STORE/fixture["tenant"];job=tenant/"jobs"/fixture["uploadId"]
    require(tenant!=prior_tenant and job.name!=prior_job.name,"Recovery requires a separate fresh synthetic job")
    require(not tenant.exists() and not tenant.is_symlink(),"Synthetic tenant must be fresh; never reuse a customer path")
    require(not RUN.exists() and not RUN.is_symlink(),"Fresh phase 3 evidence namespace required")
    RUN.mkdir(mode=0o700)
    write_exclusive(RUN/"prior-unit.service",original)
    report={"status":"FAIL","phase":3,"asanaTaskId":"1220708526935641","startedAt":now(),"sourceSha":SOURCE,"workerImage":NEW_IMAGE,"admissionSha256":a.admission_sha256,"unitBeforeSha256":UNIT_BEFORE,"unitAfterSha256":UNIT_AFTER,"beforeService":before_service,"beforeTimer":before_timer,"beforeBinding":before_binding,"tenant":fixture["tenant"],"uploadId":fixture["uploadId"],"customerDataAccessed":False,"runtimeFlagsChanged":False,"cleanup":{"removed":False},"serviceImageChanged":False,"recoveryFromReceiptSha256":PRIOR_RECEIPT_SHA,"priorOwnedProofSha256":PRIOR_OWNED_PROOF_SHA,"priorOwnedCleanup":{"removed":False}}
    stopped=False;changed=False;created=False;published=False;result_complete=False
    try:
        load_admission(a.admission_sha256);app_binding(admission);cache_stopped();runtime_unchanged()
        stopped=True;report["timerStopRequested"]=True
        command(["/usr/bin/systemctl","stop",TIMER])
        require(timer()["ActiveState"]=="inactive","Future timer triggers did not stop")
        drained=drain_service()
        require(effective_static(drained)==effective_static(before_service) and drained["image"]==OLD_IMAGE,"Prior effective service properties changed")
        require(sha(regular(UNIT))==UNIT_BEFORE and sha(regular(BROKER))==BROKER_SHA,"Operator inputs changed before mutation")
        load_admission(a.admission_sha256);app_binding(admission);runtime_unchanged();verify_prior_owned()
        replace_unit(replacement,UNIT_BEFORE);changed=True;report["serviceImageChanged"]=True
        command(["/usr/bin/systemctl","daemon-reload"])
        effective=service()
        require(effective["image"]==NEW_IMAGE and sha(regular(UNIT))==UNIT_AFTER and effective_static(effective)==effective_static(before_service),"Effective service changed beyond the exact image substitution")
        tenant.mkdir(mode=0o700);created=True
        (tenant/"jobs").mkdir(mode=0o700);job.mkdir(mode=0o700)
        write_exclusive(job/"source.tadazz",inputs["source.tadazz"],0o444)
        write_exclusive(job/"request.ready",inputs["request.json"],0o444)
        require(sha(regular(job/"source.tadazz"))==fixture["archiveSha256"],"Staged source changed")
        os.replace(job/"request.ready",job/"request.json");published=True
        report["requestPublishedLast"]=True;report["publishedAt"]=now()
        command(["/usr/bin/systemctl","start",TIMER])
        deadline=time.monotonic()+MAX_TIMER_WAIT
        while not (job/"result.json").exists():
            require(time.monotonic()<deadline,"Timer result deadline expired; owned inputs retained")
            time.sleep(1)
        command(["/usr/bin/systemctl","stop",TIMER])
        require(timer()["ActiveState"]=="inactive","Future timer triggers did not pause for completion proof")
        completed_service=drain_service()
        require(completed_service["ActiveState"]=="inactive" and completed_service["Result"]=="success" and completed_service["ExecMainStatus"]=="0","Completed broker did not succeed")
        report["timerStoppedForCompletionProof"]=True
        result_bytes=regular(job/"result.json",8_000_000)
        result=json.loads(result_bytes);bundle_bytes=regular(job/"bundle.json",8_000_000);bundle=json.loads(bundle_bytes)
        require(not result.get("error") and result["sourceDigest"]==fixture["archiveSha256"],"Real broker rejected or mismatched the synthetic source")
        require(result["outputDigest"]==sha(bundle_bytes) and result["mediaValidated"] is True,"Actual broker output/media validation failed")
        require(sorted(bundle)==fixture["expectedCompiledThemeIds"] and all(isinstance(value.get("js"),str) and value["js"] and isinstance(value.get("css"),str) and isinstance(value.get("assets"),dict) for value in bundle.values()),"Actual compiled theme output missing")
        require(sha(regular(job/"source.tadazz"))==fixture["archiveSha256"] and regular(job/"request.json")==inputs["request.json"],"Owned timer source/request changed")
        after_timer=timer();after_service=service()
        require(after_timer["ActiveState"]=="inactive" and after_timer["UnitFileState"]=="enabled" and monotonic_microseconds(after_timer["LastTriggerUSecMonotonic"])>monotonic_microseconds(before_timer["LastTriggerUSecMonotonic"]),"Actual enabled timer did not advance")
        require(after_service["image"]==NEW_IMAGE and after_service["ActiveState"]=="inactive" and after_service["Result"]=="success" and after_service["ExecMainStatus"]=="0" and effective_static(after_service)==effective_static(before_service),"Completed broker/static service health failed")
        require(sha(regular(BROKER))==BROKER_SHA and sha(regular(UNIT))==UNIT_AFTER,"Operator pins changed after timer run")
        after_binding=app_binding(admission);cache_stopped();runtime_unchanged()
        write_exclusive(RUN/"result.json",result_bytes);write_exclusive(RUN/"bundle.json",bundle_bytes)
        result_complete=True
        expected={"source.tadazz":fixture["archiveSha256"],"request.json":sha(inputs["request.json"]),"result.json":sha(result_bytes),"bundle.json":sha(bundle_bytes)}
        report["cleanup"]=cleanup_owned(tenant,job,expected,created)
        report["priorOwnedCleanup"]=cleanup_owned(prior_tenant,prior_job,prior_pins,True)
        report["bothOwnedFixturesRemoved"]=True
        report["timerTriggerMicroseconds"]={"before":monotonic_microseconds(before_timer["LastTriggerUSecMonotonic"]),"after":monotonic_microseconds(after_timer["LastTriggerUSecMonotonic"])}
        command(["/usr/bin/systemctl","start",TIMER])
        final_timer=timer();final_service=service()
        require(final_timer["ActiveState"]=="active" and final_timer["UnitFileState"]=="enabled" and final_service["image"]==NEW_IMAGE and effective_static(final_service)==effective_static(before_service),"Final enabled timer/service state changed")
        require(final_service["ActiveState"]!="failed","Restarted timer observed a failed broker")
        if final_service["ActiveState"]=="inactive":
            require(final_service["Result"]=="success" and final_service["ExecMainStatus"]=="0","Restarted timer's completed broker failed")
        require(sha(regular(UNIT))==UNIT_AFTER and sha(regular(BROKER))==BROKER_SHA,"Final operator pins changed")
        final_binding=app_binding(admission);cache_stopped();runtime_unchanged()
        report.update({"status":"PASS","actualTimerBuild":True,"mediaValidated":True,"sourceUnchanged":True,"outputDigest":sha(bundle_bytes),"bundleBytes":len(bundle_bytes),"compiledThemeIds":sorted(bundle),"completedTimer":after_timer,"completedService":after_service,"afterTimer":final_timer,"afterService":final_service,"afterBinding":final_binding,"cacheRestoredStopped":True,"runtimeConfigHashUnchanged":True,"effectiveServicePropertiesUnchanged":True})
    except BaseException as error:
        report["error"]=type(error).__name__+": "+str(error)[:1200]
        rollback={"attempted":False,"runningBrokerKilled":False,"customerJobsTouched":False}
        try:
            current_sha=sha(regular(UNIT))
            if changed or current_sha==UNIT_AFTER:
                rollback["attempted"]=True
                command(["/usr/bin/systemctl","stop",TIMER])
                require(timer()["ActiveState"]=="inactive","Rollback could not stop future timer triggers")
                if current_sha==UNIT_AFTER:replace_unit(original,UNIT_AFTER)
                require(sha(regular(UNIT))==UNIT_BEFORE,"Unknown unit mutation; backup retained")
                command(["/usr/bin/systemctl","daemon-reload"])
                restored=service()
                require(restored["image"]==OLD_IMAGE and effective_static(restored)==effective_static(before_service),"Effective prior service properties were not restored")
                require(timer()["ActiveState"]=="inactive" and sha(regular(UNIT))==UNIT_BEFORE,"Rollback state changed before confirmation")
                rollback.update({"unitRestored":True,"timerLeftStopped":True,"oldImageStillMissing":True,"serviceState":restored["ActiveState"],"ownedFixtureRetained":created and tenant.exists(),"priorOwnedFixtureRetained":prior_tenant.exists()})
            elif stopped:
                require(current_sha==UNIT_BEFORE and sha(regular(BROKER))==BROKER_SHA,"Unknown operator change; prior timer will not be restarted")
                prior_effective=service()
                require(prior_effective["image"]==OLD_IMAGE and effective_static(prior_effective)==effective_static(before_service),"Unknown effective service change; prior timer will not be restarted")
                require(before_timer["ActiveState"]=="inactive" and timer()["ActiveState"]=="inactive","Preserved paused timer state changed")
                rollback.update({"unitRestored":True,"priorTimerRestored":True,"priorTimerState":"inactive","missingImageTimerWasNotStarted":True})
        except BaseException as rollback_error:rollback["error"]=type(rollback_error).__name__+": "+str(rollback_error)[:800]
        report["rollback"]=rollback
        if created and not published:
            try:
                if job.exists():
                    names=set(p.name for p in job.iterdir())
                    require(names.issubset({"source.tadazz","request.ready"}),"Unexpected partial fixture files")
                    original_pins={"source.tadazz":fixture["archiveSha256"],"request.ready":sha(inputs["request.json"])}
                    report["cleanup"]=cleanup_owned(tenant,job,{name:original_pins[name] for name in names},created)
                else:
                    require(not tenant.is_symlink() and tenant.stat().st_uid==0,"Partial tenant ownership changed")
                    jobs=tenant/"jobs"
                    if jobs.exists():
                        require(not jobs.is_symlink() and jobs.stat().st_uid==0,"Partial jobs ownership changed")
                        jobs.rmdir()
                    tenant.rmdir()
                    report["cleanup"]={"removed":True,"partialBeforePublication":True}
            except BaseException as cleanup_error:report["cleanup"]={"removed":False,"reason":str(cleanup_error)[:800]}
        elif created and not result_complete:report["cleanup"]={"removed":False,"retainedForSafeFollowUp":True,"reason":"Published job outcome is incomplete or failed; no active inputs removed"}
    finally:
        report["finishedAt"]=now()
        write_exclusive(RUN/"receipt.json",(json.dumps(report,indent=2)+"\n").encode())
        print(json.dumps({"status":report["status"],"receipt":str(RUN/"receipt.json"),"workerImage":NEW_IMAGE,"cleanup":report["cleanup"],"error":report.get("error"),"rollback":report.get("rollback")}))
    return 0 if report["status"]=="PASS" else 1
if __name__=="__main__":
    try:raise SystemExit(main())
    except (RuntimeError,OSError,ValueError,KeyError,subprocess.TimeoutExpired) as error:
        print(json.dumps({"status":"ABORTED","error":str(error)[:1200],"serviceStateRequiresInspection":True}));raise SystemExit(2)
