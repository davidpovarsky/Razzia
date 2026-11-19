from pathlib import Path
import copy,hashlib,json
folder=Path(__file__).resolve().parent
helper=folder/"activate_and_verify_timer.py"
helper_bytes=helper.read_bytes()
namespace={"__name__":"worker_phase3_offline_guards","__file__":str(helper)}
exec(compile(helper_bytes,str(helper),"exec"),namespace)
namespace["HERE"]=folder
def prohibited(*args,**kwargs):raise AssertionError("No Linux or operator command permitted in offline guards")
namespace["command"]=prohibited;namespace["docker"]=prohibited
original_regular=namespace["regular"];virtual={}
def virtual_regular(file,limit=2_000_000):
    return virtual[str(file)] if str(file) in virtual else original_regular(file,limit)
namespace["regular"]=virtual_regular
admission_bytes=(folder/"phase3-admission.json").read_bytes()
admission=json.loads(admission_bytes);admission_sha=hashlib.sha256(admission_bytes).hexdigest()
records_folder=folder/"phase3-admission-records"
raw={name:(records_folder/name).read_bytes() for name in admission["records"]}
records={name:json.loads(blob) for name,blob in raw.items()}
passed=[]
namespace["load_admission"](admission_sha);passed.append("accepted exact canonical release records")
def prepare(mutator):
    altered=copy.deepcopy(records);new_a=copy.deepcopy(admission);mutator(altered,new_a)
    virtual.clear()
    for name,value in altered.items():
        blob=raw[name] if value==records[name] else (json.dumps(value,indent=2)+"\n").encode()
        new_a["records"][name]=hashlib.sha256(blob).hexdigest()
        virtual[str(records_folder/name)]=blob
    blob=(json.dumps(new_a,indent=2)+"\n").encode();virtual[str(folder/"phase3-admission.json")]=blob
    return hashlib.sha256(blob).hexdigest()
namespace["load_admission"](prepare(lambda r,a:None));passed.append("virtual negative-case harness accepts unchanged records")
def bad(label,expected,mutator):
    digest=prepare(mutator)
    try:namespace["load_admission"](digest)
    except RuntimeError as error:
        assert expected in str(error),(label,str(error))
        passed.append(label)
    else:raise AssertionError("Invalid record accepted: "+label)
bad("outer deployment failure rejected","Deployment outer",lambda r,a:r["deployment-deploy-execution.json"].update(exit=1))
def remote_bad(r,a):
    value=json.loads(r["deployment-deploy-execution.json"]["stdout"]);value["childExit"]=1;r["deployment-deploy-execution.json"]["stdout"]=json.dumps(value)
bad("remote child failure rejected","Deployment remote",remote_bad)
def core_change(r,changes):
    outer=r["deployment-deploy-execution.json"];remote=json.loads(outer["stdout"]);core=json.loads(remote["stdout"]);core.update(changes);remote["stdout"]=json.dumps(core);outer["stdout"]=json.dumps(remote)
bad("failed deployment core rejected","Deployment core",lambda r,a:core_change(r,{"success":False}))
bad("wrong qualified app image rejected","Deployment core",lambda r,a:core_change(r,{"image":"sha256:"+"0"*64}))
def stale(r,a):
    observation=r["post-deploy-observation.json"];observation["observation"]["finishedAt"]="2026-11-18T00:00:00+00:00";r["post-deploy-execution.json"]["stdout"]=json.dumps(observation)
bad("stale accepted observation rejected","observation is stale",stale)
def runtime_bad(r,a):
    value=json.loads(r["stage-execution.json"]["stdout"]);value["runtimeConfigSha256"]="0"*64;r["stage-execution.json"]["stdout"]=json.dumps(value)
bad("changed stage or runtime pin rejected","Qualified stage receipt changed",runtime_bad)
virtual.clear();seen=[]
def mock_docker(args):
    fmt=args[args.index("--format")+1];target=args[-1]
    if target=="tadazz-phone-gateway":return json.dumps({"id":admission["gateway"],"running":True})
    if '"workingDir"' in fmt:return json.dumps({"id":admission["container"],"image":admission["image"],"workingDir":"/","running":True,"restarts":0})
    if "CONFIG_PATH" in fmt:return "CONFIG_PATH=/app/config"
    if ".Mounts" in fmt:
        assert '"/app/config/extensions/packages"' in fmt;seen.append(True)
        return "\n".join(json.dumps(item) for item in [{"type":"bind","source":"/var/lib/tadazz-release-5312660/config","destination":"/app/config","rw":True},{"type":"bind","source":"/other-store","destination":"/app/config/extensions/packages","rw":True}])
    raise AssertionError("Unexpected Docker metadata call")
namespace["docker"]=mock_docker
try:namespace["app_binding"](admission)
except RuntimeError as error:
    assert "binding differs" in str(error) and seen;passed.append("deeper package-store mount override rejected")
else:raise AssertionError("Deeper store override accepted")
namespace["props"]=lambda name,keys:{"Triggers":"unrelated.service","Unit":"unrelated.service"}
try:namespace["timer"]()
except RuntimeError as error:
    assert "trigger the reviewed broker" in str(error);passed.append("unrelated timer target rejected")
else:raise AssertionError("Unrelated timer target accepted")
guard={"status":"PASS","helperSha256":hashlib.sha256(helper_bytes).hexdigest(),"admissionSha256":admission_sha,"passed":passed,"count":len(passed),"executionScope":"Pure admission checks with exact local canonical records and mocked metadata only; each negative case asserts its intended failure","linuxCommandExecuted":False,"sourceChanged":False,"serviceChanged":False}
(folder/"phase3-offline-guards.json").write_text(json.dumps(guard,indent=2)+"\n",encoding="utf-8")
print(json.dumps(guard))
