"""Qualify managed clients in Chromium and WebKit against an immutable native build.

Usage: python extensions/qa/managed-clients/linux-verify.py SOURCE_RUN
The real package builder/SDK come from that candidate; only dependencies and
browser binaries come from the existing read-only cache. No customer mount,
published port, external network or Docker socket is exposed to an app process.
"""
import argparse
import hashlib
import json
import pathlib
import re
import shlex
import subprocess
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("source_run")
parser.add_argument("--workspace-root", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[3])
args = parser.parse_args()
ROOT = args.workspace_root.resolve(strict=True)
harness_root = pathlib.Path(__file__).resolve().parents[3]
harness_revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=harness_root).decode().strip()
assert re.fullmatch(r"[a-f0-9]{40}", harness_revision)
harness_relative = pathlib.Path(__file__).resolve().relative_to(harness_root).as_posix()
assert harness_relative == "extensions/qa/managed-clients/linux-verify.py"
harness_blob = subprocess.check_output(["git", "show", harness_revision + ":" + harness_relative], cwd=harness_root)
assert pathlib.Path(__file__).read_bytes().replace(b"\r\n", b"\n") == harness_blob, "Only the committed QA controller may run"
sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip()
assert re.fullmatch("tadazz-codex-" + sha[:12] + "-[a-f0-9]{8}", args.source_run)
previous = ROOT / "docs/extensions/plans/phase3-takeover-20261117" / args.source_run
source = json.loads((previous / "input-manifest.json").read_text(encoding="utf8"))
build = json.loads((previous / "receipt.json").read_text(encoding="utf8"))
assert source["sha"] == sha and build["sha"] == sha
assert build["allHashesVerifiedBeforeAfter"] and all(item["exit"] == 0 for item in build["checks"])
assert {"native-site-build", "native-application-preview-build"}.issubset(
    {item["label"] for item in build["checks"]}
)
run = "tadazz-managed-clients-" + sha[:12] + "-" + uuid.uuid4().hex[:8]
evidence = ROOT / "extensions/qa/managed-clients/evidence" / run
evidence.mkdir(parents=True, exist_ok=False)
config = {"sha": sha, "sourceRun": args.source_run, "manifest": source["files"], "run": run,
    "harness": {"controllerSha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
                "harnessGitRevision": harness_revision,
                "committedControllerSha256": hashlib.sha256(harness_blob).hexdigest(),
                "candidateControllerSha256": source["files"]["extensions/qa/managed-clients/linux-verify.py"],
                "candidateInputManifestSha256": hashlib.sha256((previous / "input-manifest.json").read_bytes()).hexdigest(),
                "candidateBuildReceiptSha256": hashlib.sha256((previous / "receipt.json").read_bytes()).hexdigest(),
                "qaOnlyReadableSourceView": True, "productSourceModified": False}}
(evidence / "input-manifest.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf8")
SSH = [
    "ssh", "-i", str(pathlib.Path.home() / ".ssh/tadazz_oracle_2026"),
    "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
    "ubuntu@132.145.25.168",
]
REMOTE = r'''
import atexit,hashlib,json,os,pathlib,shutil,stat,subprocess,tempfile,threading,time,uuid
c=CONFIG
base=pathlib.Path('/home/ubuntu/tadazz-phase2-20261116/evidence')
source=base/c['sourceRun']/'source'
owned=base/c['run'];owned.mkdir(mode=0o700,exist_ok=False)
assert source.is_dir() and not source.is_symlink()
def source_hashes():return {p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
assert source_hashes()==c['manifest'],'Immutable source differs from admitted Git archive'
def web_hashes():
 root=source/'packages/web/dist';assert root.is_dir() and not root.is_symlink()
 files={};total=0
 for path in sorted(root.rglob('*')):
  assert not path.is_symlink(),'No release artifact symlinks'
  if path.is_dir():continue
  assert path.is_file()
  data=path.read_bytes();total+=len(data)
  assert len(data)<=64*1024*1024 and total<=512*1024*1024 and len(files)<10000
  files[str(path.relative_to(root))]=hashlib.sha256(data).hexdigest()
 assert 'index.html' in files
 assert any(p.startswith('tadazz-application-runtime/') for p in files),'Built native application runtime required'
 return files
web_before=web_hashes()
facts=json.loads(subprocess.check_output(['docker','inspect','tadazz-phase2-20261116']))[0]
image=facts['Image'];assert image.startswith('sha256:') and len(image)==71
rootfs=pathlib.Path('/var/lib/docker/rootfs/overlayfs')/facts['Id']
cleanup=rootfs/'cleanup';browsers=rootfs/'root/.cache/ms-playwright'
assert cleanup.is_dir() and browsers.is_dir()
# The candidate stays untouched. Its private root may not be traversable by
# the package compiler, so give that UID an independently owned, read-only view.
# Only new directory metadata differs; files are hardlinked and never chmodded.
def view_inventory(root):
 assert root.is_dir() and not root.is_symlink()
 content={};metadata={}
 for path in [root,*sorted(root.rglob('*'))]:
  relative=str(path.relative_to(root));facts=path.lstat()
  metadata[relative]={'mode':stat.S_IMODE(facts.st_mode),'uid':facts.st_uid,'gid':facts.st_gid}
  if stat.S_ISLNK(facts.st_mode):content[relative]={'kind':'symlink','target':os.readlink(path)}
  elif stat.S_ISDIR(facts.st_mode):content[relative]={'kind':'directory'}
  else:
   assert stat.S_ISREG(facts.st_mode),'No special source entries'
   content[relative]={'kind':'file','bytes':facts.st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 return {'content':content,'metadata':metadata}
def create_read_view(original,view):
 before=view_inventory(original)
 assert not view.exists() and not view.is_symlink()
 view.mkdir(mode=0o755)
 for relative,entry in before['content'].items():
  if relative=='.':continue
  src=original/relative;target=view/relative
  if entry['kind']=='directory':target.mkdir(mode=before['metadata'][relative]['mode']|0o005)
  elif entry['kind']=='symlink':target.symlink_to(entry['target'])
  else:os.link(src,target,follow_symlinks=False)
 verify_read_view(original,view,before)
 return before
def verify_read_view(original,view,before):
 assert view_inventory(original)==before,'Original source content/permissions changed'
 actual=view_inventory(view)
 assert actual['content']==before['content'],'Read view must preserve every byte and symlink'
 for relative,entry in before['content'].items():
  src=original/relative;target=view/relative;observed=actual['metadata'][relative]
  if entry['kind']=='directory':
   expected_mode=0o755 if relative=='.' else before['metadata'][relative]['mode']|0o005
   assert observed['mode']==expected_mode
   assert (src.stat().st_dev,src.stat().st_ino)!=(target.stat().st_dev,target.stat().st_ino)
  else:
   assert observed==before['metadata'][relative],'No file/link permission or owner change'
   if entry['kind']=='file':
    assert (src.stat().st_dev,src.stat().st_ino)==(target.stat().st_dev,target.stat().st_ino)
 assert view.stat().st_mode&0o005==0o005
 return actual
assert cleanup.stat().st_mode&0o005==0o005
view_parent=base/(c['run']+'-builder-view');view_parent.mkdir(mode=0o700,exist_ok=False)
assert stat.S_IMODE(view_parent.stat().st_mode)==0o700,'Read view must stay behind its private parent'
source_view=view_parent/'readable-source'
assert not source_view.is_relative_to(owned) and not owned.is_relative_to(source_view),'No writable evidence ancestor'
source_inventory=create_read_view(source,source_view)
inventory_bytes=(json.dumps(source_inventory,sort_keys=True,indent=2)+'\n').encode()
(owned/'read-view-source-inventory.json').write_bytes(inventory_bytes)
mcp=base/'tadazz-codex-browser-c4125d58a746-8e0c29d3/mcp-deps'
entries={str(p.relative_to(mcp)):('link:'+str(p.readlink()) if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest()) for p in mcp.rglob('*') if p.is_file() or p.is_symlink()}
assert len(entries)==2042 and hashlib.sha256(json.dumps(entries,sort_keys=True).encode()).hexdigest()=='0d1e3e9c089b66a75ff0e6b284f58b94ddb4e4b47b55129d82865980f62d67de'
def verify_source_mounts(container,expected_source):
 binds=[mount for mount in container['Mounts'] if mount['Type']=='bind']
 selected=[mount for mount in binds if mount['Destination']=='/source']
 assert len(selected)==1 and pathlib.Path(selected[0]['Source']).resolve()==expected_source.resolve() and selected[0]['RW'] is False
 for mount in binds:
  if mount['RW']:
   writable=pathlib.Path(mount['Source']).resolve()
   for protected in [source.resolve(),source_view.resolve()]:
    assert not protected.is_relative_to(writable) and not writable.is_relative_to(protected),'Writable bind aliases immutable source/view'
 return hashlib.sha256(json.dumps(binds,sort_keys=True).encode()).hexdigest()
def create_unprivileged_job(command,job_name):
 assert command[:2]==['docker','run'] and command.count('--rm')==1
 create=command.copy();create[1]='create';create.remove('--rm')
 cid=subprocess.check_output(create,timeout=30).decode().strip()
 actual=json.loads(subprocess.check_output(['docker','inspect',cid],timeout=15))[0]
 assert actual['Name']=='/'+job_name and actual['Image']==image and actual['State']['Status']=='created'
 assert actual['Config']['User']=='65534:65534'
 assert actual['HostConfig']['ReadonlyRootfs'] is True and actual['HostConfig']['NetworkMode']=='none'
 assert actual['HostConfig']['CapDrop']==['ALL'] and 'no-new-privileges' in actual['HostConfig']['SecurityOpt']
 return cid,verify_source_mounts(actual,source_view)
# Prove traversal and file reads as the actual sandbox UID, with the same RO
# source/cache/dependency mounts and security boundary as the candidate builder.
uid_probe=r"""const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
assert.equal(process.getuid(),65534);assert.equal(process.getgid(),65534);
const counts={files:0,directories:0,symlinks:0};
const allowed=new Set(['/cleanup/node_modules','/cleanup/extensions/node_modules','/cleanup/packages/socket/node_modules','/cleanup/packages/common/node_modules','/cleanup/packages/web/node_modules','/tmp/phase3-999ed90c/deps/node_modules']);
function walk(p){const s=fs.lstatSync(p);
 if(s.isSymbolicLink()){const target=fs.readlinkSync(p);assert(allowed.has(target));fs.accessSync(p,fs.constants.R_OK|fs.constants.X_OK);counts.symlinks++;return;}
 if(s.isDirectory()){fs.accessSync(p,fs.constants.R_OK|fs.constants.X_OK);counts.directories++;for(const name of fs.readdirSync(p))walk(path.join(p,name));return;}
 assert(s.isFile());const fd=fs.openSync(p,'r');try{if(s.size)assert.equal(fs.readSync(fd,Buffer.alloc(1),0,1,0),1);}finally{fs.closeSync(fd);}counts.files++;
}
walk('/source');
for(const p of ['/cleanup/extensions/node_modules/tsx/dist/loader.mjs','/source/extensions/qa/package-builder.ts','/source/extensions/src/presentation/package-runtime/sdk.tsx']){assert(fs.readFileSync(p).length>0);}
console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),counts,allSourceEntriesReadable:true}));
"""
probe_name=c['run']+'-read-check'
probe_command=['docker','run','--rm','--pull=never','--name',probe_name,'--network','none','--read-only','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','1','--memory','128m','--memory-swap','128m','--pids-limit','32']
for origin,target in [(source_view,'/source'),(cleanup,'/cleanup'),(mcp,'/tmp/phase3-999ed90c/deps')]:
 probe_command+=['--mount','type=bind,source='+str(origin)+',target='+target+',readonly']
probe_command+=['--entrypoint','node',image,'-e',uid_probe]
try:
 probe_id,probe_mounts_sha=create_unprivileged_job(probe_command,probe_name)
 readable=subprocess.run(['docker','start','--attach',probe_id],capture_output=True,timeout=45)
 probe_state=json.loads(subprocess.check_output(['docker','inspect',probe_id],timeout=15))[0]['State']
 (owned/'uid65534.stdout.log').write_bytes(readable.stdout);(owned/'uid65534.stderr.log').write_bytes(readable.stderr)
 assert readable.returncode==0 and not probe_state['Running'] and not probe_state['OOMKilled'] and probe_state['ExitCode']==0,'UID65534 must traverse and read the exact candidate view'
 uid_receipt=json.loads(readable.stdout)
 expected_counts={kind:sum(entry['kind']==kind for entry in source_inventory['content'].values()) for kind in ['file','directory','symlink']}
 assert uid_receipt=={'uid':65534,'gid':65534,'counts':{'files':expected_counts['file'],'directories':expected_counts['directory'],'symlinks':expected_counts['symlink']},'allSourceEntriesReadable':True}
finally:
 subprocess.run(['docker','rm','-f',probe_name],capture_output=True,timeout=20)
view_receipt={'root':str(source_view),'privateParentMode':stat.S_IMODE(view_parent.stat().st_mode),'originalRootMode':source_inventory['metadata']['.']['mode'],'viewRootMode':stat.S_IMODE(source_view.stat().st_mode),'sourceInventorySha256':hashlib.sha256(inventory_bytes).hexdigest(),'uidProbeSha256':hashlib.sha256(uid_probe.encode()).hexdigest(),'uidReadProof':uid_receipt,'uidProbeMountsSha256':probe_mounts_sha,'uidProbeStopped':not probe_state['Running'],'uidProbeOomKilled':probe_state['OOMKilled'],'outsideAllWritableMounts':True,'regularFilesHardlinked':True,'originalFileContentAndPermissionsUnchanged':True,'fileChmodPerformed':False,'mountReadOnly':True}
name=c['run'];config_name='package-staging-managed-'+c['run'].rsplit('-',1)[1]
store=owned/config_name/'extensions/packages'
mounts=[(source,'/source',True),(owned,'/evidence',False),(cleanup,'/cleanup',True),(browsers,'/root/.cache/ms-playwright',True),(mcp,'/tmp/phase3-999ed90c/deps',True)]
argv=['docker','run','--detach','--pull=never','--init','--read-only','--name',name,'--network','none','--cpus','1','--memory','2g','--memory-swap','2g','--pids-limit','512','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=805306368','--label','com.tadazz.qa=managed-clients']
for origin,target,readonly in mounts:argv+=['--mount','type=bind,source='+str(origin)+',target='+target+(',readonly' if readonly else '')]
argv+=['--entrypoint','/bin/sleep',image,'infinity']
subprocess.run(argv,check=True,stdout=subprocess.DEVNULL)
atexit.register(lambda:subprocess.run(['docker','stop','--time','10',name],check=True,stdout=subprocess.DEVNULL,timeout=25))
browser_mounts_sha=verify_source_mounts(json.loads(subprocess.check_output(['docker','inspect',name],timeout=15))[0],source)
# Reuse the committed three-server topology. Only output paths and explicit
# trusted-ingress settings are overlaid; tests and all application code are exact.
overlay="""import base from '/source/packages/e2e/playwright.package-runtime.config.ts'
export default {
  ...base,
  testDir: '/source/packages/e2e/tests',
  testMatch: ['managed-clients.spec.ts'],
  outputDir: '/evidence/test-results',
  webServer: base.webServer.map((server) => ({
    ...server,
    env: {...server.env, TADAZZ_MANAGED_CLIENT_TRUST_PROXY: 'loopback', TADAZZ_MANAGED_CLIENT_PROXY_HOST: 'tadazz.com'},
  })),
}
"""
(owned/'managed-client.playwright.config.ts').write_text(overlay)
# A real loopback proxy overwrites the dedicated address header with its TCP
# peer. This qualifies the native trust contract, not the deployed Caddy config.
probe=r"""import assert from 'node:assert/strict'
import http from 'node:http'
import { writeFileSync } from 'node:fs'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const request = (options, body) => new Promise((resolve, reject) => {
  const req = http.request({...options, agent:false}, (res) => {
    res.resume(); res.once('end', () => resolve({status:res.statusCode, retryAfter:res.headers['retry-after']}))
  })
  req.setTimeout(5000, () => req.destroy(new Error('HTTP timeout')))
  req.once('error', reject);req.end(body)
})
let ready = false
for (let n=0;n<120;n++) {
  try { if ((await request({hostname:'127.0.0.1',port:3191,path:'/api/health'})).status===200) {ready=true;break} } catch {}
  await wait(1000)
}
assert(ready,'Fresh native server became ready')
const ingress=http.createServer((req,res) => {
  const headers={...req.headers, host:'tadazz.com', origin:'http://tadazz.com', 'x-tadazz-client-ip':req.socket.remoteAddress}
  const up=http.request({hostname:'127.0.0.1',port:3191,method:req.method,path:req.url,headers,agent:false}, (reply) => {
    res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)
  })
  up.on('error',() => {res.statusCode=502;res.end()});req.pipe(up)
})
await new Promise((resolve,reject) => {ingress.once('error',reject);ingress.listen(3193,'127.0.0.1',resolve)})
const attempt=(peer, options={}) => request({
  hostname:'127.0.0.1',port:options.direct?3191:3193,localAddress:peer,method:'POST',path:'/api/client-access/session',
  headers:['Host',options.host??'tadazz.com','Origin','http://'+(options.host??'tadazz.com'),'Content-Type','application/json','X-Tadazz-Session','managed-client',...(options.headers??[])],
},JSON.stringify({code:'not-six-digits'}))
const checks=[]
try {
  for (let i=0;i<30;i++) assert.equal((await attempt('127.0.0.2',{headers:['X-Tadazz-Client-IP','192.0.2.99']})).status,401)
  const exhausted=await attempt('127.0.0.2',{headers:['X-Forwarded-For','192.0.2.88','X-Tadazz-Client-IP','192.0.2.77']})
  assert.equal(exhausted.status,429);assert(Number(exhausted.retryAfter)>0)
  checks.push('ingress-overwrites-spoofed-headers-and-retains-peer-budget')
  assert.equal((await attempt('127.0.0.3')).status,401)
  checks.push('distinct-real-ingress-peers-have-distinct-budgets')
  assert.equal((await attempt('127.0.0.2',{direct:true,headers:['X-Tadazz-Client-IP','127.0.0.3']})).status,429)
  checks.push('non-trusted-tcp-peer-cannot-replace-its-address')
  assert.equal((await attempt('127.0.0.1',{direct:true,host:'preview.example.invalid',headers:['X-Tadazz-Client-IP','127.0.0.2']})).status,401)
  checks.push('non-canonical-host-ignores-dedicated-header')
  assert.equal((await attempt('127.0.0.1',{direct:true,headers:['X-Tadazz-Client-IP','127.0.0.2','x-tadazz-client-ip','127.0.0.2']})).status,401)
  checks.push('actual-node-raw-duplicate-headers-fall-back-to-peer')
  writeFileSync('/evidence/proxy-receipt.json',JSON.stringify({passed:true,scope:'synthetic-loopback-ingress-not-deployed-caddy',checks},null,2)+'\n')
} finally {await new Promise((resolve) => ingress.close(resolve))}
"""
(owned/'proxy-probe.mjs').write_text(probe)
stop=threading.Event();builder_receipts=[];builder_errors=[]
# Mirror the existing operator-side worker policy, invoking the candidate
# package-builder.ts and SDK under /source. Never execute /cleanup source code.
def build_one(request):
 job=request.parent.resolve(strict=True)
 assert store.resolve() in job.parents and owned in job.parents
 assert not request.is_symlink() and not request.parent.is_symlink() and not (job/'source.tadazz').is_symlink()
 if (job/'result.json').exists():return
 with tempfile.TemporaryDirectory(prefix='tadazz-managed-output-') as tmp,tempfile.TemporaryDirectory(prefix='tadazz-managed-input-') as incoming:
  out=pathlib.Path(tmp);out.chmod(0o777)
  staged=pathlib.Path(incoming);staged.chmod(0o755)
  shutil.copyfile(job/'source.tadazz',staged/'source.tadazz');(staged/'source.tadazz').chmod(0o444)
  build_name=c['run']+'-builder-'+uuid.uuid4().hex[:8]
  command=['docker','run','--rm','--pull=never','--name',build_name,'--network','none','--read-only','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','1','--memory','768m','--memory-swap','768m','--pids-limit','48','--ulimit','fsize=100000000:100000000','--tmpfs','/tmp:rw,noexec,nosuid,size=128m','-e','TADAZZ_BUILD_SANDBOX=1','-e','TSX_DISABLE_CACHE=1','--workdir','/source']
  for host,target in [(source_view,'/source'),(cleanup,'/cleanup'),(mcp,'/tmp/phase3-999ed90c/deps'),(staged,'/input')]:
   command+=['--mount','type=bind,src='+str(host)+',dst='+target+',readonly']
  command+=['--mount','type=bind,src='+str(out)+',dst=/output','--entrypoint','node',image,'--import','/cleanup/extensions/node_modules/tsx/dist/loader.mjs','/source/extensions/qa/package-builder.ts','/input/source.tadazz','/output']
  start=time.time();exit_code=1;builder_state=None;builder_mounts_sha=None
  try:
   builder_id,builder_mounts_sha=create_unprivileged_job(command,build_name)
   result=subprocess.run(['docker','start','--attach',builder_id],capture_output=True,timeout=60)
   builder_state=json.loads(subprocess.check_output(['docker','inspect',builder_id],timeout=15))[0]['State']
   exit_code=builder_state['ExitCode'] if result.returncode==0 and not builder_state['Running'] and not builder_state['OOMKilled'] else 1
   with (owned/'isolated-builder.log').open('ab') as log:log.write(result.stdout+result.stderr)
   if exit_code!=0 or not (out/'result.json').is_file():
    if not (out/'result.json').is_file():(out/'result.json').write_text(json.dumps({'error':'BUILD_REJECTED'}))
  except subprocess.TimeoutExpired:
   (out/'result.json').write_text(json.dumps({'error':'BUILD_TIMEOUT'}));exit_code=124
  finally:subprocess.run(['docker','rm','-f',build_name],capture_output=True)
  artifacts={}
  for filename in ['bundle.json','result.json']:
   file=out/filename
   if file.exists():
    assert file.is_file() and not file.is_symlink() and file.stat().st_size<=8_000_000
    content=file.read_bytes();temporary=job/(filename+'.tmp');temporary.write_bytes(content);os.replace(temporary,job/filename)
    artifacts[filename]=hashlib.sha256(content).hexdigest()
  builder_receipts.append({'exit':exit_code,'seconds':round(time.time()-start,2),'sourceDigest':hashlib.sha256((staged/'source.tadazz').read_bytes()).hexdigest(),'artifacts':artifacts,'candidateBuilder':True,'candidateSdk':True,'mountsSha256':builder_mounts_sha,'workerStopped':builder_state is not None and not builder_state['Running'],'oomKilled':builder_state['OOMKilled'] if builder_state is not None else None,'builderSourceSha256':c['manifest']['extensions/qa/package-builder.ts'],'sdkSourceSha256':c['manifest']['extensions/src/presentation/package-runtime/sdk.tsx'],'network':'none','unprivileged':True})
def builds():
 while not stop.is_set():
  try:
   if store.is_dir():
    assert not store.is_symlink() and store.resolve().is_relative_to(owned)
    for request in sorted(store.glob('*/jobs/*/request.json')):
     if stop.is_set():break
     build_one(request)
  except Exception as error:
   builder_errors.append(str(error));stop.set()
  stop.wait(1)
broker=threading.Thread(target=builds);broker.start()
env={'TMPDIR':'/tmp','XDG_CACHE_HOME':'/tmp/cache','PLAYWRIGHT_BROWSERS_PATH':'/root/.cache/ms-playwright','TSX_DISABLE_CACHE':'1','NODE_OPTIONS':'--max-old-space-size=1200','TADAZZ_REMOTE_QA':'1','TADAZZ_PACKAGE_QA_CONFIG_PATH':'/evidence/'+config_name}
prefix=['docker','exec','-w','/source']
for key,value in env.items():prefix+=['-e',key+'='+value]
probe_out=(owned/'proxy.stdout.log').open('wb');probe_err=(owned/'proxy.stderr.log').open('wb')
probe_process=subprocess.Popen(prefix+[name,'node','/evidence/proxy-probe.mjs'],stdout=probe_out,stderr=probe_err)
command=prefix+[name,'nice','-n','19','timeout','-k','5','900','node','/cleanup/extensions/node_modules/@playwright/test/cli.js','test','--config=/evidence/managed-client.playwright.config.ts','managed-clients.spec.ts','--project=chromium','--project=webkit','--workers=1','--output=/evidence/test-results']
started=time.time();result_code=1;probe_code=1
try:
 with (owned/'browser.stdout.log').open('wb') as out,(owned/'browser.stderr.log').open('wb') as err:
  result=subprocess.run(command,stdout=out,stderr=err,timeout=920);result_code=result.returncode
 probe_code=probe_process.wait(timeout=25)
finally:
 stop.set();broker.join(timeout=70)
 if probe_process.poll() is None:probe_process.terminate();probe_process.wait(timeout=10)
 probe_out.close();probe_err.close()
assert not broker.is_alive(),'Only owned broker must stop'
assert source_hashes()==c['manifest'],'Managed browser changed source'
assert web_hashes()==web_before,'Managed browser changed built application'
verify_read_view(source,source_view,source_inventory)
view_receipt['allBytesSymlinksAndSourcePermissionsVerifiedBeforeAfter']=True
report_path=owned/'package-browser-report.json'
playwright=json.loads(report_path.read_text()) if report_path.is_file() else None
proxy_path=owned/'proxy-receipt.json'
proxy=json.loads(proxy_path.read_text()) if proxy_path.is_file() else None
stats=playwright.get('stats',{}) if playwright else {}
projects={project['name'] for project in playwright.get('config',{}).get('projects',[])} if playwright else set()
passed=result_code==0 and probe_code==0 and proxy and proxy.get('passed') is True and not builder_errors and len(builder_receipts)==2 and all(item['exit']==0 for item in builder_receipts) and projects=={'chromium','webkit'} and stats.get('expected')==2 and stats.get('unexpected')==0 and stats.get('skipped')==0 and stats.get('flaky')==0
state=json.loads(subprocess.check_output(['docker','inspect',name]))[0]['State']
report={'sha':c['sha'],'sourceRun':c['sourceRun'],'run':c['run'],'passed':bool(passed),'exit':result_code,'seconds':round(time.time()-started,2),'sourceReadOnly':True,'allSourceHashesVerified':True,'builtArtifactsUnchanged':True,'webArtifactsDigest':hashlib.sha256(json.dumps(web_before,sort_keys=True).encode()).hexdigest(),'productionMountUsed':False,'productionChanged':False,'network':'none','browserImage':image,'oomKilled':state.get('OOMKilled',False),'projects':sorted(projects),'stats':stats,'overlaySha256':hashlib.sha256(overlay.encode()).hexdigest(),'proxyProbeSha256':hashlib.sha256(probe.encode()).hexdigest(),'proxy':proxy,'proxyExit':probe_code,'builder':builder_receipts,'builderErrors':builder_errors,'runtimeTopology':{'web':'http://127.0.0.1:3190','nativeSocket':'http://127.0.0.1:3191','runtimeTls':'https://localhost:3192','runtimeBackend':'http://127.0.0.1:3194','trustedIngress':'synthetic loopback3193; header overwritten from actual TCP peer','deployedCaddyQualified':False},'command':command}
report['harness']=c['harness'];report['builderReadView']=view_receipt;report['browserMountsSha256']=browser_mounts_sha
(owned/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'run':c['run'],'passed':report['passed'],'seconds':report['seconds'],'receipt':str(owned/'receipt.json')}),flush=True)
'''
remote = REMOTE.replace("c=CONFIG", "c=" + repr(config))
result = subprocess.run([*SSH, "sudo -n python3 -"], input=remote.encode(), capture_output=True, timeout=1100)
(evidence / "controller.stdout.log").write_bytes(result.stdout)
(evidence / "controller.stderr.log").write_bytes(result.stderr)
if result.returncode:
    raise SystemExit("Managed-client Linux controller failed; inspect the owned controller log")
receipt_path = "/home/ubuntu/tadazz-phase2-20261116/evidence/" + run + "/receipt.json"
receipt = subprocess.check_output([*SSH, "sudo -n cat " + shlex.quote(receipt_path)], timeout=60)
report = json.loads(receipt)
(evidence / "receipt.json").write_bytes(receipt)
print(json.dumps({"run": run, "passed": report["passed"], "seconds": report["seconds"], "evidence": str(evidence)}), flush=True)
raise SystemExit(0 if report["passed"] else 1)
