from pathlib import Path
import subprocess,tempfile,os,json,time,urllib.request,socket,secrets
root=Path(r'C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119')
node=Path(r'C:\Users\DAVID\.local\tools\node-v24.22.1-win-x64\node.exe')
work=root/'work/ux-followup-20261119/billing'
out=root/'docs/extensions/plans/ux-followup-20261119/billing/browser-final'
assert not out.exists(), 'PRESERVE_PRIOR_BROWSER_EVIDENCE'
for port in (4392,4393):
 with socket.socket() as check: check.bind(('127.0.0.1',port))
config=Path(tempfile.mkdtemp(prefix='tadazz-billing-public-browser-'))
(config/'branding').mkdir()
(config/'branding/theme.json').write_text('{}\n',encoding='utf-8')
env=dict(os.environ);env.update({'PATH':str(node.parent)+os.pathsep+env.get('PATH',''),'CONFIG_PATH':str(config),'TADAZZ_SITE_ENABLED':'true','TADAZZ_ACCOUNTS_ENABLED':'true','TADAZZ_BILLING_ENABLED':'false','PADDLE_ENVIRONMENT':'live','PADDLE_API_KEY':'synthetic-unused-api','PADDLE_WEBHOOK_SECRET':'synthetic-unused-webhook','TADAZZ_BILLING_CATALOG_PATH':str(config/'catalog.json'),'TADAZZ_PUBLIC_BILLING_FIXTURE':'isolated-test-only','TADAZZ_PUBLIC_BILLING_QA_SECRET':secrets.token_hex(20),'JWT_SECRET':'billing-public-fixture-only-at-least-32-characters','RESEND_API_KEY':'synthetic-unused','TADAZZ_AUTH_EMAIL_FROM':'test@example.invalid','SOCKET_PORT':'4393','WEB_PORT':'4392','TSX_TSCONFIG_PATH':str(root/'tsconfig.json')})
children=[];handles=[];cleanup=[]
try:
 for name,args,cwd in [
  ('api',[str(node),'--import','tsx',str(root/'extensions/qa/billing-public-server.ts')],root/'extensions'),
  ('web',[str(node),'--experimental-strip-types','node_modules/vite/bin/vite.js','--config','../../extensions/qa/billing-public.vite.config.ts','--host','127.0.0.1','--port','4392','--strictPort'],root/'packages/web')]:
  log=(work/(name+'-final.log')).open('wb');handles.append(log)
  child=subprocess.Popen(args,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,creationflags=subprocess.CREATE_NEW_PROCESS_GROUP);children.append((name,child))
 deadline=time.monotonic()+90
 pending={4392,4393}
 while pending and time.monotonic()<deadline:
  failed=[{'name':name,'exit':child.poll()} for name,child in children if child.poll() is not None]
  assert not failed, 'OWNED_FIXTURE_EXITED:'+json.dumps(failed)
  for port in tuple(pending):
   try:
    with urllib.request.urlopen('http://127.0.0.1:'+str(port)+('/api/health' if port==4393 else '/'),timeout=2) as response:
     if response.status==200:pending.remove(port)
   except Exception:pass
  if pending:time.sleep(.25)
 assert not pending, 'OWNED_FIXTURE_STARTUP_TIMEOUT:'+str(pending)
 result=subprocess.run([str(node),str(work/'public-browser-check.mjs')],cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=180)
 print(json.dumps({'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr[-3000:]}),flush=True)
 code=result.returncode
 if code==0:
  site_out=root/'docs/extensions/plans/ux-followup-20261119/site-browser-with-fonts'
  assert not site_out.exists(), 'PRESERVE_PRIOR_SITE_EVIDENCE'
  env['TADAZZ_UX_BASE_URL']='http://127.0.0.1:4392'
  env['TADAZZ_UX_EVIDENCE']=str(site_out)
  site=subprocess.run([str(node),str(root/'extensions/qa/ux-followup-site-smoke.mjs')],cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=180)
  (work/'site-with-fonts.log').write_text(site.stdout+site.stderr,encoding='utf-8')
  print(json.dumps({'siteExit':site.returncode,'stdout':site.stdout,'stderr':site.stderr[-3000:]}),flush=True)
  code=site.returncode
finally:
 for name,child in reversed(children):
  if child.poll() is None:
   killed=subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],capture_output=True,text=True,timeout=15)
   child.wait(timeout=10)
   cleanup.append({'name':name,'ownedPid':child.pid,'stopped':child.poll() is not None,'taskkillExit':killed.returncode})
  else:cleanup.append({'name':name,'ownedPid':child.pid,'stopped':True,'priorExit':child.returncode})
 for handle in handles:handle.close()
 if out.exists():(out/'cleanup.json').write_text(json.dumps({'children':cleanup,'allStopped':all(x['stopped'] for x in cleanup)},indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'cleanup':cleanup}),flush=True)
raise SystemExit(code)
