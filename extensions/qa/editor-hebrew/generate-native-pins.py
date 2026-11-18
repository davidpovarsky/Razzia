"""Generate native renderer pins from committed source in an isolated offline Linux build.

This is a preparation receipt, not release qualification. Only the generated
manifest is copied back; the existing immutable release gates must then verify it.
"""
import base64
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import tarfile
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[3]
CONTAINER = "tadazz-phase2-20261116"
SSH = ["ssh", "-i", str(Path.home() / ".ssh/tadazz_oracle_2026"), "-o", "BatchMode=yes",
       "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "ubuntu@132.145.25.168"]
SHA = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
subprocess.run(["git", "diff", "--exit-code", "HEAD", "--", "extensions", "packages"], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
RUN = "tadazz-editor-pins-" + SHA[:12] + "-" + uuid.uuid4().hex[:8]
EVIDENCE = ROOT / "docs/extensions/plans/editor-hebrew-20261118" / RUN
EVIDENCE.mkdir(exist_ok=False)
source_paths = ["extensions", "packages", "package.json", "tsconfig.json",
                "pnpm-workspace.yaml", "pnpm-lock.yaml", "oxlint.config.ts", ".prettierrc.json"]
tracked = subprocess.check_output(["git", "ls-files", *source_paths], cwd=ROOT, text=True).splitlines()
archive_path = Path(tempfile.mkdtemp(prefix=RUN)) / "source.tar.gz"
subprocess.run(["git", "archive", "--format=tar.gz", "-o", str(archive_path), SHA,
                "--", *sorted({p.split("/")[0] for p in tracked})], cwd=ROOT, check=True)
with tarfile.open(archive_path, "r:gz") as archive:
    manifest = {}
    for member in archive:
        if member.isfile():
            manifest[member.name] = hashlib.sha256(archive.extractfile(member).read()).hexdigest()
        elif not member.isdir():
            raise RuntimeError("Nonregular source archive member")
(EVIDENCE / "input-manifest.json").write_text(json.dumps({"sha": SHA, "files": manifest}, indent=2) + "\n", encoding="utf8", newline="\n")
extract = r"""
from pathlib import Path, PurePosixPath
import sys, tarfile
base=Path(sys.argv[1]);base.mkdir(mode=0o700,parents=False,exist_ok=False)
source=base/"source";source.mkdir()
count=total=0
with tarfile.open(fileobj=sys.stdin.buffer,mode="r|gz") as archive:
 for member in archive:
  relative=PurePosixPath(member.name)
  assert not relative.is_absolute() and ".." not in relative.parts and (member.isfile() or member.isdir())
  target=source.joinpath(*relative.parts)
  if member.isdir():target.mkdir(parents=True,exist_ok=True);continue
  total+=member.size;count+=1
  assert total<512*1024**2 and count<20000
  target.parent.mkdir(parents=True,exist_ok=True)
  with target.open("xb") as output:output.write(archive.extractfile(member).read())
"""
command = "sudo -n docker exec -i " + CONTAINER + " python3 -c " + shlex.quote(extract) + " " + shlex.quote("/evidence/" + RUN)
with archive_path.open("rb") as stream:
    transferred = subprocess.run([*SSH, command], stdin=stream, capture_output=True, timeout=150)
if transferred.returncode:
    (EVIDENCE / "transfer-error.log").write_bytes(transferred.stderr)
    raise SystemExit("Native pin source transfer failed")
remote = r"""
import hashlib,json,pathlib,subprocess,time
c=CONFIG
facts=json.loads(subprocess.check_output(["docker","inspect","tadazz-phase2-20261116"]))[0]
assert facts["State"]["Running"] and facts["HostConfig"]["NetworkMode"]=="none" and not facts["HostConfig"].get("PortBindings")
rootfs=pathlib.Path("/var/lib/docker/rootfs/overlayfs")/facts["Id"]
host_evidence=pathlib.Path(next(m["Source"] for m in facts["Mounts"] if m["Destination"]=="/evidence"))
owned=host_evidence/c["run"];source=owned/"source"
assert owned.is_dir() and not owned.is_symlink() and source.is_dir() and (rootfs/"cleanup").is_dir()
def hashes():
 return {p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c["manifest"]}
assert hashes()==c["manifest"]
internal="/evidence/"+c["run"]
name=c["run"]+"-build"
cmd=["docker","run","--detach","--pull=never","--init","--read-only","--name",name,
     "--network","none","--cpus","1","--memory","2g","--memory-swap","2g","--pids-limit","256",
     "--tmpfs","/tmp:rw,nosuid,nodev,size=536870912","--label","com.tadazz.qa=editor-native-pins",
     "--mount","type=bind,source="+str(owned)+",target="+internal,
     "--mount","type=bind,source="+str(rootfs/"cleanup")+",target=/cleanup,readonly",
     "--entrypoint","/bin/sleep",facts["Image"],"infinity"]
subprocess.run(cmd,check=True,stdout=subprocess.DEVNULL)
try:
 setup=r'''
import pathlib,sys
root=pathlib.Path(sys.argv[1])
for directory in ["","extensions","packages/common","packages/socket","packages/web"]:
 target=root/directory/"node_modules";dep=pathlib.Path("/cleanup")/directory/"node_modules"
 if dep.is_dir():
  assert not target.exists()
  target.symlink_to(dep,target_is_directory=True)
'''
 subprocess.run(["docker","exec",name,"python3","-c",setup,internal+"/source"],check=True)
 started=time.time()
 q=subprocess.run(["docker","exec","-w",internal+"/source","-e","NODE_OPTIONS=--max-old-space-size=1024",
                   name,"nice","-n","19","timeout","-k","5","300","node","extensions/qa/build-application-preview.mjs"],
                  capture_output=True,text=True,timeout=320)
 (owned/"build.stdout.log").write_text(q.stdout)
 (owned/"build.stderr.log").write_text(q.stderr)
 assert q.returncode==0,"PIN_GENERATION_FAILED"
 target="extensions/src/core/show-library/application-preview-build.json"
 after=hashes()
 assert all(after[p]==value for p,value in c["manifest"].items() if p!=target),"SOURCE_CHANGED"
 verification=json.loads((source/"extensions/dist/application-preview/verification.json").read_text())
 assert verification["mode"]=="generate-manifest" and not verification["productionChanged"] and not verification["liveAuthorityInputs"]
 report={"kind":"editor-native-pin-preparation","sourceSha":c["sha"],"run":c["run"],
         "seconds":round(time.time()-started,3),"qaImage":facts["Image"],
         "sourceUnchangedExceptGeneratedManifest":True,"productionChanged":False,"releaseQualified":False,
         "verification":verification,"generatedManifest":(source/target).read_text()}
 print(json.dumps(report))
finally:
 subprocess.run(["docker","stop","--time","10",name],check=True,stdout=subprocess.DEVNULL,timeout=25)
"""
configuration = {"sha": SHA, "run": RUN, "manifest": manifest}
q = subprocess.run([*SSH, "sudo -n python3 -"], input=remote.replace("c=CONFIG", "c="+repr(configuration)),
                   capture_output=True,text=True,encoding="utf8",timeout=400)
(EVIDENCE / "controller.stdout.log").write_text(q.stdout,encoding="utf8",newline="\n")
(EVIDENCE / "controller.stderr.log").write_text(q.stderr,encoding="utf8",newline="\n")
if q.returncode:
    raise SystemExit("Native pin generation failed; inspect the preparation logs")
report=json.loads(q.stdout)
generated=report.pop("generatedManifest")
assert report["sourceSha"]==SHA and report["sourceUnchangedExceptGeneratedManifest"]
assert json.loads(generated)["available"] is True and len(json.loads(generated)["pins"])==2
assert subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()==SHA
subprocess.run(["git","diff","--exit-code","HEAD","--","extensions","packages"],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
(ROOT/"extensions/src/core/show-library/application-preview-build.json").write_text(generated,encoding="utf8",newline="\n")
(EVIDENCE/"receipt.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8",newline="\n")
print(json.dumps({"prepared":True,"sourceSha":SHA,"evidence":str(EVIDENCE),"manifestSha256":report["verification"]["manifestSha256"],"releaseQualified":False}))
