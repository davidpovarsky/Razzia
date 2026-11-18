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
SIZE_RECEIPT = "ff28b4363b86e3f7430ccc895872d0390c5943c6955f8f5e9003b83232ab99d9"
OLD_INDEX = "81a5fbe942c74398e002a17205bba112b9e021cef416b83756aa8fd2e76fdf6e"
NEW_INDEX = "9a9edaf33fbcdddc569b66fb1044c2280eb83732c958653019fb499c05681f71"
MAX_PAYLOAD = 128 * 1024 * 1024
MAX_TAR = 6 * 1024 * 1024
MAX_MANIFEST = 256 * 1024
MAX_FILE = 8 * 1024 * 1024  # Measured max 5,028,530 bytes; bounded headroom.
EXPECTED_MOUNTS = [("bind", "/app/config", "/var/lib/tadazz-release-5312660/config", True)]
REVIEW_GATE = False  # Source draft: no production execution until independent review.
LOCK_DIR = "/home/ubuntu/tadazz-release-control"
LOCK_NAME = "production-release.lock"


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


def read_regular(path, limit=MAX_FILE, expected_size=None):
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
        item = os.open(relative.parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            info = os.fstat(item)
            if not stat.S_ISREG(info.st_mode) or info.st_dev != device:
                raise ValueError("operator input is not a same-device regular file")
            if info.st_size > limit:
                raise ValueError("operator input exceeds size bound")
            if expected_size is not None and info.st_size != expected_size:
                raise ValueError("operator input size mismatch")
            chunks = []
            total = 0
            while True:
                chunk = os.read(item, min(1048576, limit - total + 1))
                if not chunk:
                    break
                total += len(chunk)
                if total > limit:
                    raise ValueError("operator input exceeds size bound")
                chunks.append(chunk)
            if expected_size is not None and total != expected_size:
                raise ValueError("operator input size changed")
            return b"".join(chunks)
        finally:
            os.close(item)
    finally:
        os.close(fd)


def load_inputs():
    base_raw = read_regular(OPERATOR / "base-web-inventory.json", MAX_MANIFEST)
    new_raw = read_regular(OPERATOR / "candidate-web-inventory.json", MAX_MANIFEST)
    artifact_raw = read_regular(OPERATOR / "artifact.sha256", MAX_MANIFEST)
    sizes_raw = read_regular(OPERATOR / "public-file-sizes-and-controls.json", MAX_MANIFEST)
    if sha(sizes_raw) != SIZE_RECEIPT:
        raise ValueError("size receipt hash mismatch")
    sizes = json.loads(sizes_raw)
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
    for section, expected in (("base", base), ("candidate", new), ("artifact", artifact)):
        records = sizes[section]["files"]
        if set(records) != set(expected):
            raise ValueError("size receipt inventory mismatch")
        if any(records[n]["sha256"] != digest or type(records[n]["bytes"]) is not int
               or not 0 <= records[n]["bytes"] <= MAX_FILE for n, digest in expected.items()):
            raise ValueError("size receipt record mismatch")
        if (sum(x["bytes"] for x in records.values()) != sizes[section]["total_bytes"]
                or sizes[section]["total_bytes"] > MAX_PAYLOAD):
            raise ValueError("size receipt total mismatch")
    web = OPERATOR / "web"
    actual = set()
    wanted_dirs = set()
    for name in artifact:
        parts = name.split("/")
        wanted_dirs.update("/".join(parts[:i]) for i in range(1, len(parts)))
    def walk_error(error):
        raise error
    for root, dirs, files in os.walk(web, followlinks=False, onerror=walk_error):
        for name in dirs + files:
            item = Path(root) / name
            info = os.lstat(item)
            relative = item.relative_to(web).as_posix()
            if stat.S_ISLNK(info.st_mode) or not (
                stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)
            ):
                raise ValueError("unsafe operator artifact")
            if (stat.S_ISDIR(info.st_mode) and relative not in wanted_dirs) or (
                stat.S_ISREG(info.st_mode) and relative not in artifact
            ):
                raise ValueError("unexpected operator artifact path")
        actual.update((Path(root) / name).relative_to(web).as_posix() for name in files)
    if len(artifact) != 152 or actual != set(artifact):
        raise ValueError("artifact inventory mismatch")
    for name, expected in artifact.items():
        length = sizes["artifact"]["files"][name]["bytes"]
        if sha(read_regular(web / name, expected_size=length)) != expected or new.get(name) != expected:
            raise ValueError("artifact bytes mismatch")
    return base_raw, new_raw, added, sizes_raw, sizes


def inspect_identity():
    output = subprocess.check_output(
        ["sudo", "-n", "docker", "inspect", "--format",
         "{{.Id}} {{.Image}} {{.State.Running}} {{.State.StartedAt}}", CONTAINER],
        text=True,
    ).strip().split()
    if output != [CONTAINER, IMAGE, "true", STARTED]:
        raise ValueError("container identity/image/start mismatch")
    mounts = json.loads(subprocess.check_output(
        ["sudo", "-n", "docker", "inspect", "--format", "{{json .Mounts}}", CONTAINER],
        text=True,
    ))
    observed = [(m.get("Type"), m.get("Destination"), m.get("Source"), m.get("RW"))
                for m in mounts]
    if sorted(observed) != sorted(EXPECTED_MOUNTS):
        raise ValueError("mount tuple differs from approved allowlist")


# Executed in the selected container with a public-only tar on stdin. It uses
# fixed paths, dirfd operations and O_NOFOLLOW; no config or environment reads.
INNER = r'''import hashlib,io,json,os,stat,sys,tarfile,time
APP="/app"; WEB="web"; STAGE=".tadazz-web-release-31b3cb0"
BASE="f79f270e5be9662e3f5b36c7de9bebb7077da387d92cfd37ddceaac7e1817ca9"
NEW="3f7b3942cca983f09a6fd15d335ac7b01895fc5c9530dd339ac0721a59a20b57"
SIZES="ff28b4363b86e3f7430ccc895872d0390c5943c6955f8f5e9003b83232ab99d9"
OLD_INDEX="81a5fbe942c74398e002a17205bba112b9e021cef416b83756aa8fd2e76fdf6e"
NEW_INDEX="9a9edaf33fbcdddc569b66fb1044c2280eb83732c958653019fb499c05681f71"
CAP=6*1024*1024
FILE_CAP=8*1024*1024
def digest(data): return hashlib.sha256(data).hexdigest()
def valid(n): return bool(n) and not n.startswith("/") and "\\" not in n and all(x not in ("",".","..") for x in n.split("/"))
payload=sys.stdin.buffer.read(CAP+1)
if len(payload)>CAP: raise ValueError("payload too large")
items={};members={}
with tarfile.open(fileobj=io.BytesIO(payload),mode="r:") as archive:
 for m in archive:
  if not m.isfile() or not valid(m.name) or m.name in members or m.size>FILE_CAP: raise ValueError("unsafe payload")
  members[m.name]=m
 if not {"base.json","candidate.json","sizes.json"}<=set(members): raise ValueError("missing manifest")
 for n in ("base.json","candidate.json","sizes.json"):
  if members[n].size>256*1024: raise ValueError("manifest bound")
  items[n]=archive.extractfile(members[n]).read()
 if digest(items["base.json"])!=BASE or digest(items["candidate.json"])!=NEW or digest(items["sizes.json"])!=SIZES: raise ValueError("manifest mismatch")
 base_doc=json.loads(items["base.json"]);new_doc=json.loads(items["candidate.json"])
 sizes=json.loads(items["sizes.json"])
 expected_payload={"payload/"+n for n in set(new_doc["files"])-set(base_doc["files"])}|{"payload/index.html"}
 if set(members)!={"base.json","candidate.json","sizes.json"}|expected_payload: raise ValueError("payload inventory")
 for n in expected_payload:
  if members[n].size!=sizes["candidate"]["files"][n[8:]]["bytes"]: raise ValueError("payload size")
  items[n]=archive.extractfile(members[n]).read()
if base_doc["special"] or new_doc["special"]: raise ValueError("special manifest entry")
base=base_doc["files"];new=new_doc["files"]
if len(base)!=202 or len(new)!=242 or any(not valid(n) for n in set(base)|set(new)): raise ValueError("inventory")
added=sorted(set(new)-set(base))
if set(base)-set(new) or [n for n in base if base[n]!=new[n]]!=["index.html"] or len(added)!=40 or any(not n.startswith("assets/") or n.count("/")!=1 for n in added): raise ValueError("unexpected delta")
if base["index.html"]!=OLD_INDEX or new["index.html"]!=NEW_INDEX: raise ValueError("entry hashes")
if set(items)!={"base.json","candidate.json","sizes.json"}|{"payload/"+n for n in added+["index.html"]}: raise ValueError("payload inventory")
for label,inventory in (("base",base),("candidate",new)):
 records=sizes[label]["files"]
 if set(records)!=set(inventory) or any(records[n]["sha256"]!=h or type(records[n]["bytes"]) is not int or not 0<=records[n]["bytes"]<=FILE_CAP for n,h in inventory.items()): raise ValueError("size receipt inventory")
 if sum(r["bytes"] for r in records.values())!=sizes[label]["total_bytes"]: raise ValueError("size total")
allowed_sizes={}
for label in ("base","candidate"):
 for n,r in sizes[label]["files"].items(): allowed_sizes.setdefault(n,set()).add(r["bytes"])
for n in added+["index.html"]:
 if digest(items["payload/"+n])!=new[n]: raise ValueError("payload hash")
flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
if os.geteuid()!=0: raise ValueError("container root required")
app=os.open(APP,flags); web=os.open(WEB,flags,dir_fd=app); dev=os.fstat(web).st_dev
if os.fstat(app).st_dev!=dev: raise ValueError("different app/web devices")
def readfd(parent,name):
 f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
 try:
  st=os.fstat(f)
  if not stat.S_ISREG(st.st_mode) or st.st_dev!=dev: raise ValueError("nonregular/device")
  if st.st_size>FILE_CAP: raise ValueError("file size bound")
  chunks=[]
  total=0
  while True:
   b=os.read(f,min(1048576,FILE_CAP-total+1))
   if not b: break
   total+=len(b)
   if total>FILE_CAP: raise ValueError("file size bound")
   chunks.append(b)
  return b"".join(chunks)
 finally: os.close(f)
def hashfd(parent,name,allowed):
 f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
 try:
  st=os.fstat(f)
  if not stat.S_ISREG(st.st_mode) or st.st_dev!=dev or st.st_size not in allowed: raise ValueError("nonregular/device/size")
  h=hashlib.sha256();total=0
  while True:
   b=os.read(f,min(1048576,FILE_CAP-total+1))
   if not b:
    if total!=st.st_size: raise ValueError("size changed")
    return h.hexdigest()
   total+=len(b)
   if total>FILE_CAP: raise ValueError("file size bound")
   h.update(b)
 finally: os.close(f)
def walk(fd,expected,wanted,prefix="",dirs=None):
 if dirs is None: dirs=set()
 result={}
 for entry in os.scandir(fd):
  n=entry.name; name=prefix+n
  if not valid(name): raise ValueError("invalid path")
  info=entry.stat(follow_symlinks=False)
  if info.st_dev!=dev or stat.S_ISLNK(info.st_mode): raise ValueError("symlink/device")
  if stat.S_ISDIR(info.st_mode):
   if name not in wanted: raise ValueError("unexpected directory")
   child=os.open(n,flags,dir_fd=fd)
   if os.fstat(child).st_dev!=dev: os.close(child);raise ValueError("device crossing")
   dirs.add(name)
   try: result.update(walk(child,expected,wanted,name+"/",dirs))
   finally: os.close(child)
  elif stat.S_ISREG(info.st_mode):
   if name not in expected: raise ValueError("unexpected file")
   result[name]=hashfd(fd,n,allowed_sizes[name])
  else: raise ValueError("special file")
 return result
def matches(fd,expected):
 dirs=set(); wanted=set()
 for name in expected:
  parts=name.split("/")
  for i in range(1,len(parts)): wanted.add("/".join(parts[:i]))
 actual=walk(fd,expected,wanted,dirs=dirs)
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
def classify():
 wanted=set()
 for name in new:
  parts=name.split("/")
  for i in range(1,len(parts)): wanted.add("/".join(parts[:i]))
 actual=walk(web,new,wanted)
 if any(actual.get(n)!=h for n,h in base.items() if n!="index.html"): return "foreign-ambiguous"
 if any(n not in new or (n!="index.html" and h!=new[n]) for n,h in actual.items()): return "foreign-ambiguous"
 if actual.get("index.html")==OLD_INDEX:
  count=len(set(actual)&set(added))
  return "old-entry-full-additions" if count==len(added) else "old-entry-partial-additions"
 if actual.get("index.html")==NEW_INDEX and actual==new: return "new-entry-complete"
 return "foreign-ambiguous"
def verified_backup(stage):
 if digest(get(stage,"base.json"))!=BASE or digest(get(stage,"candidate.json"))!=NEW: raise ValueError("stage manifest mismatch")
 backup=os.open("backup",flags,dir_fd=stage)
 try:
  if not matches(backup,base): raise ValueError("backup mismatch")
  return get(backup,"index.html")
 finally: os.close(backup)
phase="preflight"; stage=None
try:
 mode=sys.argv[1]
 if mode=="observe":
  observed=classify();backup_status="unavailable"
  try:
   stage=stage_open();verified_backup(stage);backup_status="verified"
  except Exception: pass
  print(json.dumps({"observation":"readback","classification":observed,"backup":backup_status}))
 elif mode=="publish":
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
  journal(stage,"assets-verified");phase="replacement-attempted"
  srcfd,srcname=dir_for(stage,"incoming/index.html")
  try:
   os.replace(srcname,"index.html",src_dir_fd=srcfd,dst_dir_fd=web);phase="visible-unfenced"
   os.fsync(web);os.fsync(srcfd);phase="directories-fenced"
  finally: os.close(srcfd)
  if not matches(web,new): raise ValueError("post-swap live inventory mismatch")
  journal(stage,"published");phase="journal-fenced"
 elif mode=="rollback":
  if classify()!="new-entry-complete": raise ValueError("live tree is not exact published inventory")
  stage=stage_open()
  old=verified_backup(stage)
  try: write_new(stage,"rollback-index.html",old,0o644)
  except FileExistsError:
   if get(stage,"rollback-index.html")!=old: raise ValueError("foreign rollback staging")
   f=os.open("rollback-index.html",os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=stage)
   try:
    st=os.fstat(f)
    if not stat.S_ISREG(st.st_mode) or st.st_dev!=dev: raise ValueError("unsafe rollback staging")
    os.fsync(f)
   finally: os.close(f)
   os.fsync(stage)
  journal(stage,"rollback-ready-"+str(time.time_ns()));phase="replacement-attempted"
  os.replace("rollback-index.html","index.html",src_dir_fd=stage,dst_dir_fd=web);phase="visible-unfenced"
  os.fsync(web);os.fsync(stage)
  incoming=os.open("incoming",flags,dir_fd=stage)
  try: os.fsync(incoming)
  finally: os.close(incoming)
  phase="directories-fenced"
  restored=dict(new);restored["index.html"]=OLD_INDEX
  if not matches(web,restored): raise ValueError("post-rollback inventory mismatch")
  journal(stage,"rolled-back-"+str(time.time_ns()));phase="journal-fenced"
 elif mode=="reconcile":
  state=classify();stage=stage_open();verified_backup(stage)
  if state=="foreign-ambiguous": raise ValueError("foreign or ambiguous public tree")
  os.fsync(web);os.fsync(stage)
  assets=os.open("assets",flags,dir_fd=web)
  try: os.fsync(assets)
  finally: os.close(assets)
  incoming=os.open("incoming",flags,dir_fd=stage)
  try: os.fsync(incoming)
  finally: os.close(incoming)
  phase="directories-fenced"
  journal(stage,"reconciled-"+str(time.time_ns()),{"observed":state});phase="journal-fenced"
 else: raise ValueError("unknown action")
 if mode!="observe": print(json.dumps({"observation":"complete","phase":phase,"classification":classify(),"oldIndex":OLD_INDEX,"newIndex":NEW_INDEX}))
except Exception as e:
 if stage is not None and mode!="observe":
  try: journal(stage,"failure-"+str(time.time_ns()),{"phase":phase,"error":type(e).__name__})
  except Exception: pass
 print(json.dumps({"observation":"failed","phase":phase,"error":type(e).__name__,"message":str(e)}),file=sys.stderr)
 sys.exit(1)
finally:
 if stage is not None: os.close(stage)
 os.close(web);os.close(app)
'''


def _run_locked(action):
    base_raw, new_raw, added, sizes_raw, sizes = load_inputs()
    inspect_identity()  # No target writes precede identity verification.
    exact_bodies = sum(sizes["candidate"]["files"][n]["bytes"] for n in added + ["index.html"])
    # Covers tar headers/padding and end blocks; enforced on every write.
    tar_limit = exact_bodies + len(base_raw) + len(new_raw) + len(sizes_raw) + 1024 * 1024
    if tar_limit > MAX_TAR:
        raise ValueError("calculated payload exceeds maximum")
    class BoundedBuffer(io.BytesIO):
        def write(self, data):
            if self.tell() + len(data) > tar_limit:
                raise ValueError("tar budget exceeded")
            return super().write(data)
    payload = BoundedBuffer()
    with tarfile.open(fileobj=payload, mode="w") as tar:
        members = {"base.json": base_raw, "candidate.json": new_raw, "sizes.json": sizes_raw}
        total = len(base_raw) + len(new_raw) + len(sizes_raw)
        for name in added + ["index.html"]:
            remaining = tar_limit - total - 1024 * 1024
            if remaining < 0:
                raise ValueError("payload budget exhausted")
            length = sizes["candidate"]["files"][name]["bytes"]
            data = read_regular(OPERATOR / "web" / name, min(MAX_FILE, remaining), length)
            total += len(data)
            members["payload/" + name] = data
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    if payload.tell() > MAX_TAR:
        raise ValueError("payload too large")
    inspect_identity()  # Reject restart/replacement immediately before exec.
    result = None
    exec_error = None
    try:
        result = subprocess.run(
            ["sudo", "-n", "docker", "exec", "-i", CONTAINER,
             "python3", "-B", "-c", INNER, action],
            input=payload.getvalue(), capture_output=True, check=False,
        )
    except Exception as error:
        exec_error = type(error).__name__
    try: 
        inspect_identity(); identity = "verified"
    except Exception:
        identity = "unverified"
    observation = None
    if result is not None:
        try: observation = json.loads((result.stdout if result.returncode == 0 else result.stderr).decode("utf-8"))
        except (ValueError, UnicodeError): pass
    ok = (result is not None and result.returncode == 0 and identity == "verified"
          and isinstance(observation, dict) and observation.get("observation") == "complete"
          and observation.get("phase") == "journal-fenced")
    readback = None
    readback_error = None
    if not ok and identity == "verified":
        try:
            scoped = subprocess.run(
                ["sudo", "-n", "docker", "exec", "-i", CONTAINER,
                 "python3", "-B", "-c", INNER, "observe"],
                input=payload.getvalue(), capture_output=True, check=False, timeout=30,
            )
            if scoped.returncode == 0:
                readback = json.loads(scoped.stdout.decode("utf-8"))
        except Exception as error:
            readback_error = type(error).__name__
        try:
            inspect_identity()
        except Exception:
            identity = "unverified"
    verdict = {"action": action, "status": "verified" if ok else "indeterminate", "identity": identity,
               "execReturnCode": result.returncode if result is not None else None,
               "execError": exec_error, "filesystemObservation": observation,
               "scopedReadback": readback, "readbackError": readback_error,
               "readbackMayRaceLostExec": not ok}
    print(json.dumps(verdict))
    if not ok:
        raise HostIndeterminate()


class HostIndeterminate(Exception):
    pass


def run(action):
    if action not in {"publish", "rollback", "reconcile"}:
        raise ValueError("expected publish, rollback or reconcile")
    if not REVIEW_GATE:
        raise ValueError("review gate closed; production execution disabled")
    import fcntl
    parent = os.open(LOCK_DIR, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        d = os.fstat(parent)
        if d.st_uid != os.geteuid() or stat.S_IMODE(d.st_mode) != 0o700:
            raise ValueError("untrusted lock directory")
        fd = os.open(LOCK_NAME, os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            st = os.fstat(fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                    or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) != 0o600):
                raise ValueError("untrusted lock file")
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                return _run_locked(action)
            except HostIndeterminate:
                # Remain under the same flock while an operator establishes that
                # a lost exec has stopped and chooses a bounded disposition.
                # The manager's separate lease must survive process/host failure.
                while True:
                    choice = input("Lease held. After independently confirming the previous exec stopped, "
                                   "enter reconcile, rollback, or retain: ").strip()
                    if choice == "retain":
                        raise HostIndeterminate()
                    if choice not in {"reconcile", "rollback"}:
                        continue
                    try:
                        return _run_locked(choice)
                    except HostIndeterminate:
                        continue
                    except Exception as error:
                        print(json.dumps({"status": "indeterminate", "reconcileError": type(error).__name__}))
        finally:
            os.close(fd)
    finally:
        os.close(parent)


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("usage: atomic-web-publish.py publish|rollback|reconcile")
        run(sys.argv[1])
    except HostIndeterminate:
        sys.exit(1)
    except Exception as error:
        print(json.dumps({"status": "failed", "error": type(error).__name__,
                          "message": str(error)}), file=sys.stderr)
        sys.exit(1)
