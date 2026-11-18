#!/usr/bin/env python3
"""Review-only web publication proposal. Never run without independent QA/approval.

The CLI has fixed production identities and paths; the internal functions can be
called with synthetic constants by an isolated QA harness. No production command
is executed at import time. All payloads and backups contain public web files.
"""

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
import tarfile

CONTAINER = "dd1401638311a15212e52dcf0153b759003feb83fbce89c6b2756c9ff6732891"
IMAGE = "sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346"
STARTED = "2026-11-12T03:38:48.157101207Z"
OPERATOR = Path("/home/ubuntu/tadazz-unified-site-20261115-31b3cb0")
BASE_MANIFEST = "f79f270e5be9662e3f5b36c7de9bebb7077da387d92cfd37ddceaac7e1817ca9"
CANDIDATE_MANIFEST = "3f7b3942cca983f09a6fd15d335ac7b01895fc5c9530dd339ac0721a59a20b57"
ARTIFACT_MANIFEST = "406a22eadb840f0ac0c8fd269ed2444287157eadbbf15f1779c4a967d2507730"
OLD_INDEX = "81a5fbe942c74398e002a17205bba112b9e021cef416b83756aa8fd2e76fdf6e"
NEW_INDEX = "9a9edaf33fbcdddc569b66fb1044c2280eb83732c958653019fb499c05681f71"
MAX_PAYLOAD = 128 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(name):
    path = PurePosixPath(name)
    return (
        bool(name)
        and not path.is_absolute()
        and "\\" not in name
        and all(part not in ("", ".", "..") for part in name.split("/"))
        and str(path) == name
    )


def read_regular(path):
    # Resolve from / with no-follow directory/file descriptors; never follow a
    # raced symlink or cross a mount below the fixed operator directory.
    relative = path.relative_to(OPERATOR)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open("/", flags)
    try:
        for part in OPERATOR.parts[1:]:
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        device = os.fstat(fd).st_dev
        for part in relative.parts[:-1]:
            child = os.open(part, flags, dir_fd=fd)
            if os.fstat(child).st_dev != device:
                os.close(child)
                raise ValueError("operator input device crossing")
            os.close(fd)
            fd = child
        item = os.open(relative.parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        try:
            info = os.fstat(item)
            if not stat.S_ISREG(info.st_mode) or info.st_dev != device:
                raise ValueError("operator input is not a same-device regular file")
            chunks = []
            while True:
                chunk = os.read(item, 1048576)
                if not chunk:
                    break
                chunks.append(chunk)
            return b"".join(chunks)
        finally:
            os.close(item)
    finally:
        os.close(fd)


def load_inputs():
    base_raw = read_regular(OPERATOR / "base-web-inventory.json")
    new_raw = read_regular(OPERATOR / "candidate-web-inventory.json")
    artifact_raw = read_regular(OPERATOR / "artifact.sha256")
    if (sha(base_raw), sha(new_raw), sha(artifact_raw)) != (
        BASE_MANIFEST,
        CANDIDATE_MANIFEST,
        ARTIFACT_MANIFEST,
    ):
        raise ValueError("operator manifest hash mismatch")
    base_doc, new_doc = json.loads(base_raw), json.loads(new_raw)
    if base_doc["special"] or new_doc["special"]:
        raise ValueError("special image entries")
    base, new = base_doc["files"], new_doc["files"]
    if len(base) != 202 or len(new) != 242:
        raise ValueError("unexpected image inventory size")
    if any(not safe_name(name) for name in set(base) | set(new)):
        raise ValueError("unsafe inventory path")
    if set(base) - set(new):
        raise ValueError("candidate removed prior web files")
    if [name for name in base if base[name] != new[name]] != ["index.html"]:
        raise ValueError("unexpected shared file change")
    added = sorted(set(new) - set(base))
    if len(added) != 40 or any(
        not name.startswith("assets/") or name.count("/") != 1 for name in added
    ):
        raise ValueError("unexpected additions")
    if base["index.html"] != OLD_INDEX or new["index.html"] != NEW_INDEX:
        raise ValueError("unexpected entry hashes")
    artifact = {}
    for line in artifact_raw.decode("utf-8").splitlines():
        digest, name = line.split("  ", 1)
        if not safe_name(name) or name in artifact:
            raise ValueError("invalid artifact manifest")
        artifact[name] = digest
    web = OPERATOR / "web"
    actual = set()
    for root, dirs, files in os.walk(web, followlinks=False):
        for name in dirs + files:
            item = Path(root) / name
            info = os.lstat(item)
            if stat.S_ISLNK(info.st_mode) or not (
                stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)
            ):
                raise ValueError("unsafe operator artifact")
        actual.update((Path(root) / name).relative_to(web).as_posix() for name in files)
    if len(artifact) != 152 or actual != set(artifact):
        raise ValueError("artifact inventory mismatch")
    for name, expected in artifact.items():
        if sha(read_regular(web / name)) != expected or new.get(name) != expected:
            raise ValueError("artifact bytes mismatch")
    return base_raw, new_raw, added


def inspect_identity():
    output = subprocess.check_output(
        ["sudo", "-n", "docker", "inspect", "--format",
         "{{.Id}} {{.Image}} {{.State.Running}} {{.State.StartedAt}}", CONTAINER],
        text=True,
    ).strip().split()
    if output != [CONTAINER, IMAGE, "true", STARTED]:
        raise ValueError("container identity/image/start mismatch")


# Executed in the selected container with a public-only tar on stdin. It uses
# fixed paths, dirfd operations and O_NOFOLLOW; no config or environment reads.
INNER = r'''import hashlib,io,json,os,stat,sys,tarfile,time
APP="/app"; WEB="web"; STAGE=".tadazz-web-release-31b3cb0"
BASE="f79f270e5be9662e3f5b36c7de9bebb7077da387d92cfd37ddceaac7e1817ca9"
NEW="3f7b3942cca983f09a6fd15d335ac7b01895fc5c9530dd339ac0721a59a20b57"
OLD_INDEX="81a5fbe942c74398e002a17205bba112b9e021cef416b83756aa8fd2e76fdf6e"
NEW_INDEX="9a9edaf33fbcdddc569b66fb1044c2280eb83732c958653019fb499c05681f71"
CAP=128*1024*1024
def digest(data): return hashlib.sha256(data).hexdigest()
def valid(n): return bool(n) and not n.startswith("/") and "\\" not in n and all(x not in ("",".","..") for x in n.split("/"))
payload=sys.stdin.buffer.read(CAP+1)
if len(payload)>CAP: raise ValueError("payload too large")
items={}
with tarfile.open(fileobj=io.BytesIO(payload),mode="r:") as archive:
 for m in archive:
  if not m.isfile() or not valid(m.name) or m.name in items or m.size>CAP: raise ValueError("unsafe payload")
  items[m.name]=archive.extractfile(m).read()
if digest(items["base.json"])!=BASE or digest(items["candidate.json"])!=NEW: raise ValueError("manifest mismatch")
base_doc=json.loads(items["base.json"]);new_doc=json.loads(items["candidate.json"])
if base_doc["special"] or new_doc["special"]: raise ValueError("special manifest entry")
base=base_doc["files"];new=new_doc["files"]
if len(base)!=202 or len(new)!=242 or any(not valid(n) for n in set(base)|set(new)): raise ValueError("inventory")
added=sorted(set(new)-set(base))
if set(base)-set(new) or [n for n in base if base[n]!=new[n]]!=["index.html"] or len(added)!=40 or any(not n.startswith("assets/") or n.count("/")!=1 for n in added): raise ValueError("unexpected delta")
if base["index.html"]!=OLD_INDEX or new["index.html"]!=NEW_INDEX: raise ValueError("entry hashes")
if set(items)!={"base.json","candidate.json"}|{"payload/"+n for n in added+["index.html"]}: raise ValueError("payload inventory")
for n in added+["index.html"]:
 if digest(items["payload/"+n])!=new[n]: raise ValueError("payload hash")
flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
if os.geteuid()!=0: raise ValueError("container root required")
app=os.open(APP,flags); web=os.open(WEB,flags,dir_fd=app); dev=os.fstat(web).st_dev
if os.fstat(app).st_dev!=dev: raise ValueError("different app/web devices")
def readfd(parent,name):
 f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent)
 try:
  st=os.fstat(f)
  if not stat.S_ISREG(st.st_mode) or st.st_dev!=dev: raise ValueError("nonregular/device")
  chunks=[]
  while True:
   b=os.read(f,1048576)
   if not b: break
   chunks.append(b)
  return b"".join(chunks)
 finally: os.close(f)
def walk(fd,prefix="",dirs=None):
 if dirs is None: dirs=set()
 result={}
 for entry in os.scandir(fd):
  n=entry.name; name=prefix+n
  if not valid(name): raise ValueError("invalid path")
  info=entry.stat(follow_symlinks=False)
  if info.st_dev!=dev or stat.S_ISLNK(info.st_mode): raise ValueError("symlink/device")
  if stat.S_ISDIR(info.st_mode):
   child=os.open(n,flags,dir_fd=fd)
   if os.fstat(child).st_dev!=dev: os.close(child);raise ValueError("device crossing")
   dirs.add(name)
   try: result.update(walk(child,name+"/",dirs))
   finally: os.close(child)
  elif stat.S_ISREG(info.st_mode): result[name]=digest(readfd(fd,n))
  else: raise ValueError("special file")
 return result
def matches(fd,expected):
 dirs=set(); actual=walk(fd,dirs=dirs); wanted=set()
 for name in expected:
  parts=name.split("/")
  for i in range(1,len(parts)): wanted.add("/".join(parts[:i]))
 return actual==expected and dirs==wanted
def dir_for(root,path,create=False):
 parts=path.split("/"); fd=os.dup(root)
 try:
  for part in parts[:-1]:
   if create:
    try: os.mkdir(part,0o700,dir_fd=fd);os.fsync(fd)
    except FileExistsError: pass
   child=os.open(part,flags,dir_fd=fd)
   if os.fstat(child).st_dev!=dev: os.close(child);raise ValueError("device crossing")
   os.close(fd);fd=child
  return fd,parts[-1]
 except: os.close(fd);raise
def get(root,path):
 fd,n=dir_for(root,path)
 try: return readfd(fd,n)
 finally: os.close(fd)
def write_new(root,path,data,mode=0o600):
 fd,n=dir_for(root,path,True)
 try:
  f=os.open(n,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode,dir_fd=fd)
  try:
   os.fchmod(f,mode)
   view=memoryview(data)
   while view:
    count=os.write(f,view)
    if count<=0: raise OSError("short write")
    view=view[count:]
   os.fsync(f)
  finally: os.close(f)
  os.fsync(fd)
 finally: os.close(fd)
def journal(stage,name,extra=None):
 body={"phase":name,"oldIndex":OLD_INDEX,"newIndex":NEW_INDEX,"baseManifest":BASE,"candidateManifest":NEW,"backendImage":"sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346","effectiveWebCandidate":"sha256:54d162faae23681b56279d85b8dfa1243c6a9fb8fd62f5bb87c91479f7f4a79d","sourceRevision":"31b3cb084efeb50dced6952498e9703cb47dc45c","appRevision":"9b221bc0edabe449cdf27bc818ae77acbc676bae","utc":time.time(),"extra":extra}
 write_new(stage,"journal-"+name+".json",(json.dumps(body,sort_keys=True)+"\n").encode())
def stage_open():
 stage=os.open(STAGE,flags,dir_fd=app)
 info=os.fstat(stage)
 if info.st_dev!=dev or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700: os.close(stage);raise ValueError("stage ownership/mode/device")
 return stage
phase="preflight"; stage=None
try:
 mode=sys.argv[1]
 if mode=="publish":
  if not matches(web,base): raise ValueError("live tree is not exact old inventory")
  phase="stage-create-uncertain"
  os.mkdir(STAGE,0o700,dir_fd=app);os.fsync(app);stage=stage_open();phase="backup"
  for n,h in base.items():
   data=get(web,n)
   if digest(data)!=h: raise ValueError("old file changed during backup")
   write_new(stage,"backup/"+n,data)
  backup=os.open("backup",flags,dir_fd=stage)
  try:
   if not matches(backup,base): raise ValueError("backup verification")
  finally: os.close(backup)
  write_new(stage,"base.json",items["base.json"]);write_new(stage,"candidate.json",items["candidate.json"])
  for n in added+["index.html"]: write_new(stage,"incoming/"+n,items["payload/"+n],0o644)
  journal(stage,"backup-verified");phase="assets"
  for n in added:
   srcfd,srcname=dir_for(stage,"incoming/"+n);dstfd,dstname=dir_for(web,n)
   try: os.link(srcname,dstname,src_dir_fd=srcfd,dst_dir_fd=dstfd,follow_symlinks=False);os.fsync(dstfd)
   finally: os.close(srcfd);os.close(dstfd)
  interim=dict(new);interim["index.html"]=OLD_INDEX
  if not matches(web,interim): raise ValueError("pre-swap live inventory mismatch")
  journal(stage,"assets-verified");phase="index-replace-uncertain"
  srcfd,srcname=dir_for(stage,"incoming/index.html")
  try: os.replace(srcname,"index.html",src_dir_fd=srcfd,dst_dir_fd=web);os.fsync(web)
  finally: os.close(srcfd)
  if not matches(web,new): raise ValueError("post-swap live inventory mismatch")
  phase="published";journal(stage,"published")
 elif mode=="rollback":
  if not matches(web,new): raise ValueError("live tree is not exact published inventory")
  stage=stage_open()
  if digest(get(stage,"base.json"))!=BASE or digest(get(stage,"candidate.json"))!=NEW: raise ValueError("stage manifest mismatch")
  if not json.loads(get(stage,"journal-published.json"))["phase"]=="published": raise ValueError("publish not confirmed")
  backup=os.open("backup",flags,dir_fd=stage)
  try:
   if not matches(backup,base): raise ValueError("backup mismatch")
   old=get(backup,"index.html")
  finally: os.close(backup)
  write_new(stage,"rollback-index.html",old,0o644);journal(stage,"rollback-ready");phase="rollback-replace-uncertain"
  os.replace("rollback-index.html","index.html",src_dir_fd=stage,dst_dir_fd=web);os.fsync(web)
  restored=dict(new);restored["index.html"]=OLD_INDEX
  if not matches(web,restored): raise ValueError("post-rollback inventory mismatch")
  phase="rolled-back";journal(stage,"rolled-back")
 else: raise ValueError("unknown action")
 print(json.dumps({"status":"ok","phase":phase,"oldIndex":OLD_INDEX,"newIndex":NEW_INDEX}))
except Exception as e:
 if stage is not None:
  try: journal(stage,"failure-"+str(time.time_ns()),{"phase":phase,"error":type(e).__name__})
  except Exception: pass
 print(json.dumps({"status":"failed","phase":phase,"error":type(e).__name__,"message":str(e),"durabilityUncertain":"uncertain" in phase or isinstance(e,OSError)}),file=sys.stderr)
 sys.exit(1)
finally:
 if stage is not None: os.close(stage)
 os.close(web);os.close(app)
'''


def run(action):
    if action not in {"publish", "rollback"}:
        raise ValueError("expected publish or rollback")
    base_raw, new_raw, added = load_inputs()
    inspect_identity()  # No target writes precede identity verification.
    payload = io.BytesIO()
    with tarfile.open(fileobj=payload, mode="w") as tar:
        members = {"base.json": base_raw, "candidate.json": new_raw}
        for name in added + ["index.html"]:
            members["payload/" + name] = read_regular(OPERATOR / "web" / name)
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    if payload.tell() > MAX_PAYLOAD:
        raise ValueError("payload too large")
    inspect_identity()  # Reject restart/replacement immediately before exec.
    result = subprocess.run(
        ["sudo", "-n", "docker", "exec", "-i", CONTAINER,
         "python3", "-B", "-c", INNER, action],
        input=payload.getvalue(),
        check=False,
    )
    if result.returncode:
        raise RuntimeError("container operation failed; inspect retained journal")
    try:
        inspect_identity()
    except Exception as error:
        raise RuntimeError(
            "operation reported success but post-operation identity check failed; "
            "state is uncertain, inspect the journal"
        ) from error


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("usage: atomic-web-publish.py publish|rollback")
        run(sys.argv[1])
    except Exception as error:
        print(json.dumps({"status": "failed", "error": type(error).__name__,
                          "message": str(error)}), file=sys.stderr)
        sys.exit(1)
