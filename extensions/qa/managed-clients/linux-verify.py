"""Qualify managed clients in Chromium and WebKit against an immutable native build.

Usage: python extensions/qa/managed-clients/linux-verify.py SOURCE_RUN
The real package builder/SDK come from that candidate; only dependencies and
browser binaries come from the existing read-only cache. No customer mount,
published port, external network or Docker socket is exposed to an app process.
"""
import argparse
import json
import pathlib
import re
import shlex
import subprocess
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("source_run")
args = parser.parse_args()
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
config = {"sha": sha, "sourceRun": args.source_run, "manifest": source["files"], "run": run}
(evidence / "input-manifest.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf8")
SSH = [
    "ssh", "-i", str(pathlib.Path.home() / ".ssh/tadazz_oracle_2026"),
    "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
    "ubuntu@132.145.25.168",
]
REMOTE = r'''
import atexit,hashlib,json,os,pathlib,shutil,subprocess,tempfile,threading,time,uuid
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
# The package compiler remains an unprivileged process. Do not chmod an old
# source/cache to make it readable: fail admission if its bind root is private.
assert source.stat().st_mode&0o005==0o005 and cleanup.stat().st_mode&0o005==0o005
mcp=base/'tadazz-codex-browser-c4125d58a746-8e0c29d3/mcp-deps'
entries={str(p.relative_to(mcp)):('link:'+str(p.readlink()) if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest()) for p in mcp.rglob('*') if p.is_file() or p.is_symlink()}
assert len(entries)==2042 and hashlib.sha256(json.dumps(entries,sort_keys=True).encode()).hexdigest()=='0d1e3e9c089b66a75ff0e6b284f58b94ddb4e4b47b55129d82865980f62d67de'
name=c['run'];config_name='package-staging-managed-'+c['run'].rsplit('-',1)[1]
store=owned/config_name/'extensions/packages'
mounts=[(source,'/source',True),(owned,'/evidence',False),(cleanup,'/cleanup',True),(browsers,'/root/.cache/ms-playwright',True),(mcp,'/tmp/phase3-999ed90c/deps',True)]
argv=['docker','run','--detach','--pull=never','--init','--read-only','--name',name,'--network','none','--cpus','1','--memory','2g','--memory-swap','2g','--pids-limit','512','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=805306368','--label','com.tadazz.qa=managed-clients']
for origin,target,readonly in mounts:argv+=['--mount','type=bind,source='+str(origin)+',target='+target+(',readonly' if readonly else '')]
argv+=['--entrypoint','/bin/sleep',image,'infinity']
subprocess.run(argv,check=True,stdout=subprocess.DEVNULL)
atexit.register(lambda:subprocess.run(['docker','stop','--time','10',name],check=True,stdout=subprocess.DEVNULL,timeout=25))
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
  for host,target in [(source,'/source'),(cleanup,'/cleanup'),(mcp,'/tmp/phase3-999ed90c/deps'),(staged,'/input')]:
   command+=['--mount','type=bind,src='+str(host)+',dst='+target+',readonly']
  command+=['--mount','type=bind,src='+str(out)+',dst=/output','--entrypoint','node',image,'--import','/cleanup/extensions/node_modules/tsx/dist/loader.mjs','/source/extensions/qa/package-builder.ts','/input/source.tadazz','/output']
  start=time.time();exit_code=1
  try:
   result=subprocess.run(command,capture_output=True,timeout=60);exit_code=result.returncode
   with (owned/'isolated-builder.log').open('ab') as log:log.write(result.stdout+result.stderr)
   if result.returncode!=0 or not (out/'result.json').is_file():
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
  builder_receipts.append({'exit':exit_code,'seconds':round(time.time()-start,2),'sourceDigest':hashlib.sha256((staged/'source.tadazz').read_bytes()).hexdigest(),'artifacts':artifacts,'candidateBuilder':True,'candidateSdk':True,'builderSourceSha256':c['manifest']['extensions/qa/package-builder.ts'],'sdkSourceSha256':c['manifest']['extensions/src/presentation/package-runtime/sdk.tsx'],'network':'none','unprivileged':True})
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
report_path=owned/'package-browser-report.json'
playwright=json.loads(report_path.read_text()) if report_path.is_file() else None
proxy_path=owned/'proxy-receipt.json'
proxy=json.loads(proxy_path.read_text()) if proxy_path.is_file() else None
stats=playwright.get('stats',{}) if playwright else {}
projects={project['name'] for project in playwright.get('config',{}).get('projects',[])} if playwright else set()
passed=result_code==0 and probe_code==0 and proxy and proxy.get('passed') is True and not builder_errors and len(builder_receipts)==2 and all(item['exit']==0 for item in builder_receipts) and projects=={'chromium','webkit'} and stats.get('expected')==2 and stats.get('unexpected')==0 and stats.get('skipped')==0 and stats.get('flaky')==0
state=json.loads(subprocess.check_output(['docker','inspect',name]))[0]['State']
report={'sha':c['sha'],'sourceRun':c['sourceRun'],'run':c['run'],'passed':bool(passed),'exit':result_code,'seconds':round(time.time()-started,2),'sourceReadOnly':True,'allSourceHashesVerified':True,'builtArtifactsUnchanged':True,'webArtifactsDigest':hashlib.sha256(json.dumps(web_before,sort_keys=True).encode()).hexdigest(),'productionMountUsed':False,'productionChanged':False,'network':'none','browserImage':image,'oomKilled':state.get('OOMKilled',False),'projects':sorted(projects),'stats':stats,'overlaySha256':hashlib.sha256(overlay.encode()).hexdigest(),'proxyProbeSha256':hashlib.sha256(probe.encode()).hexdigest(),'proxy':proxy,'proxyExit':probe_code,'builder':builder_receipts,'builderErrors':builder_errors,'runtimeTopology':{'web':'http://127.0.0.1:3190','nativeSocket':'http://127.0.0.1:3191','runtimeTls':'https://localhost:3192','runtimeBackend':'http://127.0.0.1:3194','trustedIngress':'synthetic loopback3193; header overwritten from actual TCP peer','deployedCaddyQualified':False},'command':command}
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
