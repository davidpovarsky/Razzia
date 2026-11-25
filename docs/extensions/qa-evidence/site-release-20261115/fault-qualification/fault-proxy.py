#!/usr/bin/env python3
"""SOURCE REVIEW ONLY. Target-pinned Engine transport for synthetic QA.

No execution is authorized by this file. A dropped acknowledgement is an
instrumented transport event, not an ordinary daemon failure.
"""
import argparse, ast, hashlib, json, os, pathlib, re, select, signal, socket, stat, struct, threading, time

ROOT=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115/fixtures')
SHORT=pathlib.Path('/run/tadazz-atomic-qa')
ENGINE='/var/run/docker.sock'
HELPER='352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2'
BASE='sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346'
PROD='dd1401638311a15212e52dcf0153b759003feb83fbce89c6b2756c9ff6732891'
TUPLES={'e56ad13c4b404aa7a752e0c6e822a61d': 'drop-start-ack', 'f8e1688d4d504cddbf90113c70c26998': 'native-write-eio', '83e631a8f8b94f469665beef772b02b8': 'native-fsync-eio', '2a3e9f85a62f40bfa452c29028d174da': 'native-readonly-erofs'}
MAX_HEADER=65536;MAX_BODY=262144;MAX_JSON=65536;MAX_STREAM=8*1024*1024;MAX_LOG=1024*1024
class DroppedAck(Exception):pass
REASONS={'peer-denied','peer-command','peer-action','peer-namespace-pid','request-line','request-headers','request-bound','route-header-mismatch','route-denied','create-body','create-command','create-already-reserved','create-status','exec-id','exec-inspect-identity','start-body','start-already-reserved','start-framing','running-not-observed','target-mismatch','controller-mismatch','helper-changed','helper-hash','helper-metadata','response-framing','response-length','response-bound','response-truncated','proxy-budget','proxy-privileges','proxy-cgroup','proxy-unit-identity','header-bound','bad-header','duplicate-header','duplicate-json-key','relay-bound'}

def digest(b):return hashlib.sha256(b).hexdigest()
def strict_json(b):
 def pairs(items):
  r={}
  for k,v in items:
   if k in r:raise ValueError('duplicate-json-key')
   r[k]=v
  return r
 return json.loads(b,object_pairs_hook=pairs)
def timed_exact(s,n,deadline):
 out=bytearray()
 while len(out)<n:
  remaining=deadline-time.monotonic()
  if remaining<=0:raise TimeoutError('request-deadline')
  s.settimeout(remaining);part=s.recv(min(n-len(out),65536))
  if not part:raise EOFError('request-eof')
  out.extend(part)
 return bytes(out)
def read_header(s,deadline):
 raw=bytearray()
 while not raw.endswith(b'\r\n\r\n'):
  if len(raw)>=MAX_HEADER:raise ValueError('header-bound')
  raw.extend(timed_exact(s,1,deadline))
 return bytes(raw)
def parse_header(raw):
 lines=raw[:-4].split(b'\r\n');fields={}
 for line in lines[1:]:
  if b':' not in line:raise ValueError('bad-header')
  k,v=line.split(b':',1);k=k.strip().lower()
  if k in fields:raise ValueError('duplicate-header')
  fields[k]=v.strip()
 return lines[0],fields
def engine(deadline=None):
 s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.settimeout(max(.001,min(20,deadline-time.monotonic())) if deadline else 20);s.connect(ENGINE);return s
def read_line(s,deadline):
 data=bytearray()
 while not data.endswith(b'\r\n'):
  if len(data)>=8192:raise ValueError('chunk-line-bound')
  data.extend(timed_exact(s,1,deadline))
 return bytes(data[:-2])
def read_engine_json(s,deadline):
 raw=read_header(s,deadline);line,h=parse_header(raw)
 if not re.fullmatch(rb'HTTP/1\.[01] [1-5][0-9]{2}(?: [\x20-\x7e]*)?',line):raise ValueError('response-status-line')
 status=int(line.split()[1]);length=h.get(b'content-length');encoding=h.get(b'transfer-encoding')
 if length is not None and encoding is not None:raise ValueError('response-framing')
 if length is not None:
  if not length.isdigit() or int(length)>MAX_JSON:raise ValueError('response-length')
  return status,timed_exact(s,int(length),deadline)
 data=bytearray()
 if encoding is not None:
  if encoding.lower()!=b'chunked':raise ValueError('response-framing')
  while True:
   line=read_line(s,deadline);sizepart=line.split(b';',1)[0]
   if not re.fullmatch(rb'[0-9a-fA-F]+',sizepart):raise ValueError('chunk-size')
   size=int(sizepart,16)
   if size>MAX_JSON-len(data):raise ValueError('response-bound')
   if size==0:
    trailers=0
    while True:
     line=read_line(s,deadline);trailers+=len(line)+2
     if trailers>MAX_HEADER:raise ValueError('trailer-bound')
     if not line:break
     if b':' not in line:raise ValueError('trailer-framing')
    return status,bytes(data)
   data.extend(timed_exact(s,size,deadline))
   if timed_exact(s,2,deadline)!=b'\r\n':raise ValueError('chunk-framing')
 while True:
  remaining=deadline-time.monotonic()
  if remaining<=0:raise TimeoutError('response-deadline')
  s.settimeout(remaining);part=s.recv(min(16384,MAX_JSON+1-len(data)))
  if not part:return status,bytes(data)
  data.extend(part)
  if len(data)>MAX_JSON:raise ValueError('response-bound')
def json_request(method,path,body=None,written=None,deadline=None):
 deadline=deadline or time.monotonic()+20;raw=b'' if body is None else json.dumps(body,separators=(',',':')).encode()
 headers=method+' '+path+' HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/json\r\n'
 if body is not None:headers+='Content-Length: '+str(len(raw))+'\r\n'
 with engine(deadline) as s:
  s.settimeout(max(.001,deadline-time.monotonic()));s.sendall((headers+'\r\n').encode()+raw)
  if written is not None:written()
  return read_engine_json(s,deadline)
def inspect(cid):
 status,data=json_request('GET','/v1.52/containers/'+cid+'/json')
 if status!=200:raise ValueError('container-inspect')
 return strict_json(data)
def check_target(d,cid,nonce,started):
 h=d['HostConfig'];n=d['NetworkSettings']
 if (d['Id']!=cid or d['Name']!='/tadazz-atomic-qa-'+nonce or d['Image']!=BASE or not d['State']['Running'] or d['State']['StartedAt']!=started or
 h.get('NetworkMode')!='none' or h.get('PortBindings') or n.get('Ports') or d.get('Mounts') or h.get('Binds') or
 h.get('Privileged') or h.get('ReadonlyRootfs') != (TUPLES[nonce]=='native-readonly-erofs') or h.get('PidMode') not in ('',None) or h.get('UsernsMode') not in ('',None) or h.get('UTSMode') not in ('',None) or
 h.get('IpcMode')!='private' or h.get('CgroupnsMode')!='private' or h.get('CapAdd') or h.get('CapDrop') or h.get('Devices') or h.get('DeviceRequests') or h.get('DeviceCgroupRules') or h.get('GroupAdd') or h.get('SecurityOpt') or
 h.get('Tmpfs')!={'/app/config':'rw,nosuid,nodev,size=128m,mode=0700'} or h.get('NanoCpus')!=250000000 or h.get('Memory')!=256*1024*1024 or
 d['Config'].get('User') not in ('','0','root') or d['Config'].get('Entrypoint') not in (None,[]) or d['Config'].get('Cmd')!=['sleep','infinity'] or
 (d['Config'].get('Labels') or {}).get('codex.synthetic.nonce')!=nonce or (d['Config'].get('Labels') or {}).get('codex.synthetic.role')!='app'):raise ValueError('target-mismatch')
def check_controller(d,cid,nonce,started,fixture,sockdir):
 h=d['HostConfig'];n=d['NetworkSettings'];mounts=sorted((m.get('Type'),m.get('Source'),m.get('Destination'),m.get('RW'),m.get('Propagation')) for m in d.get('Mounts',[]))
 expected=sorted([('bind',str(fixture),str(fixture),False,'rprivate'),('bind',str(fixture/'control'),str(fixture/'control'),True,'rprivate'),('bind',str(sockdir),'/var/run',False,'rprivate')])
 if (d['Id']!=cid or d['Name']!='/tadazz-atomic-controller-'+nonce or d['Image']!='sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647' or not d['State']['Running'] or d['State']['StartedAt']!=started or
 h.get('NetworkMode')!='none' or h.get('PortBindings') or n.get('Ports') or mounts!=expected or
 h.get('NanoCpus')!=62500000 or h.get('Memory')!=512*1024*1024 or not h.get('ReadonlyRootfs') or h.get('Privileged') or
 h.get('PidMode') not in ('',None) or h.get('UsernsMode') not in ('',None) or h.get('UTSMode') not in ('',None) or
 h.get('IpcMode')!='private' or h.get('CgroupnsMode')!='private' or h.get('CapAdd') or h.get('CapDrop') or h.get('Devices') or h.get('DeviceRequests') or h.get('DeviceCgroupRules') or h.get('GroupAdd') or h.get('SecurityOpt')!=['no-new-privileges:true'] or h.get('Tmpfs') or
 d['Config'].get('User') not in ('','0','root') or d['Config'].get('Entrypoint')!=['docker-entrypoint.sh'] or d['Config'].get('Cmd')!=['sleep','infinity'] or
 (d['Config'].get('Labels') or {}).get('codex.synthetic.nonce')!=nonce or (d['Config'].get('Labels') or {}).get('codex.synthetic.role')!='controller'):raise ValueError('controller-mismatch')
def check_paths(path,uid,mode):
 if not path.is_absolute() or str(path.resolve())!=str(path):raise ValueError('path-symlink')
 st=path.lstat()
 if not stat.S_ISDIR(st.st_mode) or st.st_uid!=uid or stat.S_IMODE(st.st_mode)!=mode:raise ValueError('path-owner-mode')
def inner_literal(path):
 s=path.lstat()
 if path.is_symlink() or not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=0o400:raise ValueError('helper-metadata')
 raw=path.read_bytes()
 if digest(raw)!=HELPER:raise ValueError('helper-hash')
 tree=ast.parse(raw);items=[ast.literal_eval(x.value) for x in tree.body if isinstance(x,ast.Assign) and any(isinstance(y,ast.Name) and y.id=='INNER' for y in x.targets)]
 if len(items)!=1 or not isinstance(items[0],str):raise ValueError('inner-literal')
 return items[0]
def peer_matches(pid,cid):
 text=pathlib.Path('/proc',str(pid),'cgroup').read_text()
 lines=text.splitlines()
 if len(lines)!=1 or not lines[0].startswith('0::/'):return False
 components=lines[0][3:].split('/')
 return sum(x in (cid,'docker-'+cid+'.scope') for x in components)==1
def peer_action(pid,fixture):
 cmd=pathlib.Path('/proc',str(pid),'cmdline').read_bytes().rstrip(b'\0').split(b'\0')
 prefix=[b'python3',b'-I',b'-B',os.fsencode(str(fixture/'driver.py')),b'action']
 if len(cmd)!=6 or cmd[:5]!=prefix or cmd[5] not in (b'publish',b'rollback',b'reconcile'):raise ValueError('peer-command')
 return cmd[5].decode('ascii')
def peer_ticks(pid):
 s=pathlib.Path('/proc',str(pid),'stat').read_text();return s[s.rfind(')')+2:].split()[19]
def peer_namespace_pid(pid):
 rows=[x for x in pathlib.Path('/proc',str(pid),'status').read_text().splitlines() if x.startswith('NSpid:')]
 if len(rows)!=1:raise ValueError('peer-namespace-pid')
 fields=rows[0].split()[1:]
 if len(fields)<2 or any(not x.isdigit() for x in fields) or int(fields[0])!=pid:raise ValueError('peer-namespace-pid')
 return int(fields[-1])
def verify_own_budget(nonce):
 lines=pathlib.Path('/proc/self/cgroup').read_text().splitlines()
 if len(lines)!=1 or not lines[0].startswith('0::/'):raise ValueError('proxy-cgroup')
 if ('tadazz-atomic-proxy-'+nonce+'.service') not in lines[0][4:].split('/'):raise ValueError('proxy-unit-identity')
 status=dict(x.split(':',1) for x in pathlib.Path('/proc/self/status').read_text().splitlines() if ':' in x)
 if os.geteuid()!=0 or int(status.get('CapEff','1').strip(),16)!=0 or status.get('NoNewPrivs','0').strip()!='1':raise ValueError('proxy-privileges')
 path=(pathlib.Path('/sys/fs/cgroup')/lines[0][4:]).resolve()
 if not path.is_relative_to('/sys/fs/cgroup'):raise ValueError('proxy-cgroup-path')
 quota,period=(path/'cpu.max').read_text().split();memory=(path/'memory.max').read_text().strip();swap=(path/'memory.swap.max').read_text().strip();tasks=(path/'pids.max').read_text().strip()
 if quota=='max' or memory=='max' or tasks=='max' or int(quota)*8>int(period) or int(memory)>128*1024*1024 or swap!='0' or int(tasks)>32:raise ValueError('proxy-budget')
def relay(client,up,log):
 peers={client:up,up:client};active=set(peers);totals={client:0,up:0};deadline=time.monotonic()+180
 for s in peers:s.settimeout(5)
 while active:
  if time.monotonic()>=deadline:raise TimeoutError('relay-deadline')
  ready,_,_=select.select(list(active),[],[],min(1,deadline-time.monotonic()))
  for src in ready:
   data=src.recv(65536)
   if not data:
    active.remove(src)
    try:peers[src].shutdown(socket.SHUT_WR)
    except OSError:pass
    continue
   totals[src]+=len(data)
   if totals[src]>MAX_STREAM:raise ValueError('relay-bound')
   peers[src].sendall(data)
 log('stream-complete',stdinBytes=totals[client],outputBytes=totals[up])

def main():
 ap=argparse.ArgumentParser()
 for n in ('target','target-started','controller','controller-started','nonce','mode'):ap.add_argument('--'+n,required=True)
 a=ap.parse_args();nonce=a.nonce
 if TUPLES.get(nonce)!=a.mode or any(not re.fullmatch(r'[0-9a-f]{64}',x) for x in (a.target,a.controller)) or a.target in (PROD,a.controller) or a.controller==PROD:raise ValueError('identity-arguments')
 fixture=ROOT/('atomic-3527-fault-'+nonce);sockdir=SHORT/nonce/'s';logdir=SHORT/nonce/'l'
 # The zero-capability service does not traverse UID-1001 private fixture
 # ancestors; the separate root binder validates them before any action.
 for p,uid in ((SHORT,0),(SHORT/nonce,0),(sockdir,0),(logdir,0)):check_paths(p,uid,0o700)
 sockpath=sockdir/'docker.sock';logpath=logdir/'transcript.jsonl';finish=logdir/'transcript.sha256'
 if len(os.fsencode(str(sockpath)))>107 or any(p.exists() or p.is_symlink() for p in (sockpath,logpath,finish)):raise ValueError('socket-path-or-used-namespace')
 verify_own_budget(nonce);inner=inner_literal(logdir/'atomic-web-publish.py');check_target(inspect(a.target),a.target,nonce,a.target_started);check_controller(inspect(a.controller),a.controller,nonce,a.controller_started,fixture,sockdir)
 fd=os.open(logpath,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);mutex=threading.RLock();slots=threading.BoundedSemaphore(2);start=time.monotonic();shutdown=threading.Event()
 signal.signal(signal.SIGTERM,lambda *_:shutdown.set());signal.signal(signal.SIGINT,lambda *_:shutdown.set())
 state={'sequence':0,'connections':0,'activeConnections':0,'createAttempts':0,'createReserved':False,'createSendAttempted':0,'createWritten':0,'createResponse':0,'createDelivered':0,'startAttempts':0,'startReserved':False,'startSendAttempted':0,'startWritten':0,'startResponse':0,'startDelivered':0,'unclassified':0,'denials':0,'transportErrors':0,'targetInspects':0,'execInspects':0,'execId':None,'dispatchPeerPid':None,'dispatchPeerStart':None}
 def log(kind,**v):
  with mutex:
   state['sequence']+=1;row={'sequence':state['sequence'],'time':time.time(),'kind':kind,'state':dict(state),**v};raw=(json.dumps(row,sort_keys=True)+'\n').encode()
   if os.fstat(fd).st_size+len(raw)>MAX_LOG:shutdown.set();raise ValueError('log-bound')
   view=memoryview(raw)
   while view:
    count=os.write(fd,view)
    if count<=0:raise OSError('short-transcript-write')
    view=view[count:]
   os.fsync(fd)
 def revalidate():
  verify_own_budget(nonce)
  if inner_literal(logdir/'atomic-web-publish.py')!=inner:raise ValueError('helper-changed')
  check_target(inspect(a.target),a.target,nonce,a.target_started);check_controller(inspect(a.controller),a.controller,nonce,a.controller_started,fixture,sockdir)
 def serve(client):
  upgraded=False;classified=False
  with client:
   try:
    peerpid,uid,_=struct.unpack('3i',client.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
    if uid!=0 or not peer_matches(peerpid,a.controller):raise ValueError('peer-denied')
    requested=peer_action(peerpid,fixture);peerstart=peer_ticks(peerpid);peernspid=peer_namespace_pid(peerpid);log('peer-authenticated',peerPid=peerpid,peerNamespacePid=peernspid,peerStart=peerstart,peerUid=uid,peerAction=requested)
    raw=read_header(client,time.monotonic()+15);line,fields=parse_header(raw);parts=line.decode('ascii').split()
    if len(parts)!=3 or parts[2]!='HTTP/1.1':raise ValueError('request-line')
    method,path,_=parts;create=('/containers/' in path and '/exec' in path);start_request=('/exec/' in path and '/start' in path)
    with mutex:
     if create:state['createAttempts']+=1;classified=True;log('create-attempt')
     if start_request:state['startAttempts']+=1;classified=True;log('start-attempt')
    allowed_headers={b'host',b'accept-encoding',b'content-type',b'content-length',b'connection',b'upgrade'}
    if set(fields)-allowed_headers or fields.get(b'host')!=b'localhost' or fields.get(b'content-type')!=b'application/json' or fields.get(b'accept-encoding',b'identity')!=b'identity' or b'transfer-encoding' in fields:raise ValueError('request-headers')
    length=int(fields.get(b'content-length',b'0'))
    if not 0<=length<=MAX_BODY:raise ValueError('request-bound')
    body=timed_exact(client,length,time.monotonic()+15);kind=None;eid=None
    with mutex:known=state['execId']
    if method=='GET' and path=='/v1.52/containers/'+a.target+'/json' and length==0:kind='target-inspect'
    elif method=='GET' and known and path=='/v1.52/exec/'+known+'/json' and length==0:kind='exec-inspect'
    elif method=='POST' and path=='/v1.52/containers/'+a.target+'/exec':
     if requested!='publish':raise ValueError('peer-action')
     obj=strict_json(body);expected={'AttachStdin':True,'AttachStdout':True,'AttachStderr':True,'Tty':False}
     if set(obj)!=set(expected)|{'Cmd'} or any(type(obj[k]) is not bool or obj[k] is not v for k,v in expected.items()):raise ValueError('create-body')
     cmd=obj['Cmd']
     if not isinstance(cmd,list) or cmd!=['python3','-B','-c',inner,'publish']:raise ValueError('create-command')
     with mutex:
      if state['createReserved']:raise ValueError('create-already-reserved')
      state['createReserved']=True;state['dispatchPeerPid']=peerpid;state['dispatchPeerStart']=peerstart;log('create-reserved',peerPid=peerpid,peerNamespacePid=peernspid,peerStart=peerstart)
     kind='create'
    elif method=='POST' and known and path=='/v1.52/exec/'+known+'/start':
     obj=strict_json(body)
     if set(obj)!={'Detach','Tty'} or any(type(obj[k]) is not bool or obj[k] is not False for k in obj) or fields.get(b'connection',b'').lower()!=b'upgrade' or fields.get(b'upgrade',b'').lower()!=b'tcp':raise ValueError('start-body')
     with mutex:
      if state['startReserved']:raise ValueError('start-already-reserved')
      if requested!='publish' or state['dispatchPeerPid']!=peerpid or state['dispatchPeerStart']!=peerstart:raise ValueError('start-peer-mismatch')
      state['startReserved']=True;log('start-reserved',peerPid=peerpid,peerNamespacePid=peernspid,peerStart=peerstart)
     kind='start';eid=known
    if kind is None:raise ValueError('route-denied')
    if kind!='start' and (b'upgrade' in fields or fields.get(b'connection',b'').lower() not in (b'',b'close')):raise ValueError('route-header-mismatch')
    classified=True
    if kind in ('create','start'):revalidate()
    if kind!='start':
     if kind=='create':
      with mutex:state['createSendAttempted']+=1;log('create-send-attempted')
     def created_written():
      with mutex:state['createWritten']+=1;log('create-written')
     status,data=json_request(method,path,strict_json(body) if kind=='create' else None,created_written if kind=='create' else None)
     if kind=='create':
      with mutex:state['createResponse']+=1;log('create-response-received',status=status)
      if status!=201:raise ValueError('create-status')
      result=strict_json(data);eid=result.get('Id')
      if not isinstance(eid,str) or not re.fullmatch(r'[0-9a-f]{64}',eid):raise ValueError('exec-id')
      with mutex:state['execId']=eid;log('create-response',execId=eid,status=status)
     message=('HTTP/1.1 '+str(status)+' Engine\r\nContent-Type: application/json\r\nContent-Length: '+str(len(data))+'\r\nConnection: close\r\n\r\n').encode()+data
     client.sendall(message)
     if kind=='create':
      with mutex:state['createDelivered']+=1;log('create-delivered',execId=eid)
     else:
      info={}
      if kind=='exec-inspect':
       obj=strict_json(data)
       if status!=200 or obj.get('ID')!=known or obj.get('ContainerID')!=a.target or type(obj.get('Running')) is not bool:raise ValueError('exec-inspect-identity')
       info={'execId':known,'running':obj['Running'],'exitCode':obj.get('ExitCode')}
      with mutex:
       if kind=='target-inspect':state['targetInspects']+=1
       else:state['execInspects']+=1
       log(kind+'-delivered',status=status,peerPid=peerpid,peerStart=peerstart,peerAction=requested,**info)
    else:
     with mutex:state['startSendAttempted']+=1;log('start-send-attempted',execId=eid)
     with engine() as up:
      canonical=('POST '+path+' HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Type: application/json\r\nContent-Length: '+str(len(body))+'\r\n\r\n').encode()+body
      up.sendall(canonical)
      with mutex:state['startWritten']+=1;log('start-written',execId=eid)
      answer=read_header(up,time.monotonic()+20);line,h=parse_header(answer);p=line.split()
      tokens={x.strip().lower() for x in h.get(b'connection',b'').split(b',')}
      if len(p)<2 or p[0]!=b'HTTP/1.1' or p[1] not in (b'101',b'200') or b'content-length' in h or b'transfer-encoding' in h or (p[1]==b'101' and (h.get(b'upgrade',b'').lower()!=b'tcp' or b'upgrade' not in tokens)) or (p[1]==b'200' and h.get(b'content-type',b'').split(b';')[0]!=b'application/vnd.docker.raw-stream'):raise ValueError('start-framing')
      with mutex:state['startResponse']+=1;log('real-start-response',execId=eid,status=int(p[1]))
      if a.mode!='drop-start-ack':
       code,pidraw=json_request('GET','/v1.52/exec/'+eid+'/json');child=strict_json(pidraw)
       if code!=200 or child.get('ID')!=eid or child.get('ContainerID')!=a.target or child.get('Running') is not True or type(child.get('Pid')) is not int or child['Pid']<=0:raise ValueError('native child identity')
       log('native-trace-request',execId=eid,hostPid=child['Pid'],mode=a.mode,acknowledgementDelivered=False,stdinBytes=0)
       marker=logdir/'trace-ready.json';deadline=time.monotonic()+45
       while not marker.exists() and time.monotonic()<deadline:time.sleep(.02)
       raw=marker.read_bytes();st=marker.stat();bound=strict_json(raw)
       if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or stat.S_IMODE(st.st_mode)!=0o400 or bound.get('execId')!=eid or bound.get('hostPid')!=child['Pid'] or bound.get('target')!=a.target or bound.get('mode')!=a.mode or type(bound.get('tracerPid')) is not int or bound['tracerPid']<=0:raise ValueError('native trace marker')
       log('native-trace-bound',execId=eid,hostPid=child['Pid'],tracerPid=bound['tracerPid'],mode=a.mode)
      if a.mode=='drop-start-ack':
       deadline=time.monotonic()+10;status,data=json_request('GET','/v1.52/exec/'+eid+'/json',deadline=deadline);ob=strict_json(data)
       if status!=200 or ob.get('ID')!=eid or ob.get('ContainerID')!=a.target or ob.get('Running') is not True:raise ValueError('running-not-observed')
       log('real-running-before-drop',execId=eid,running=True,downstreamAckBytes=0,upstreamStdinBytes=0)
       upgraded=True
       try:client.shutdown(socket.SHUT_RDWR)
       except OSError:pass
       client.close();up.close();observed='unknown';exitcode=None
       for _ in range(10):
        if time.monotonic()>=deadline:break
        try:
         code,raw=json_request('GET','/v1.52/exec/'+eid+'/json',deadline=deadline);after=strict_json(raw)
         if code==200 and after.get('ID')==eid and after.get('ContainerID')==a.target and type(after.get('Running')) is bool:
          observed='running' if after['Running'] else 'stopped';exitcode=after.get('ExitCode')
          if observed=='stopped':break
        except Exception:observed='unknown'
        time.sleep(.2)
       log('post-drop-inspection',execId=eid,execState=observed,exitCode=exitcode)
       raise DroppedAck()
      upgraded=True;client.sendall(answer)
      with mutex:state['startDelivered']+=1;log('start-delivered',execId=eid)
      relay(client,up,log)
   except DroppedAck:
    pass
   except Exception as error:
    with mutex:
     if not classified:state['unclassified']+=1
     state['denials']+=1
     if isinstance(error,(OSError,EOFError,TimeoutError)):state['transportErrors']+=1
     reason=str(error) if type(error) is ValueError and str(error) in REASONS else type(error).__name__;log('denied-or-error',reason=reason,upgraded=upgraded)
    if not upgraded:
     try:client.sendall(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
     except OSError:pass
  with mutex:state['activeConnections']-=1;log('connection-finished')
  slots.release()
 server=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);server.bind(str(sockpath));os.chmod(sockpath,0o600);server.listen(2);server.settimeout(1)
 log('ready',target=a.target,controller=a.controller,nonce=nonce,mode=a.mode,targetStarted=a.target_started,controllerStarted=a.controller_started,helperSha256=HELPER)
 threads=[]
 try:
  while not shutdown.is_set() and time.monotonic()-start<600:
   try:client,_=server.accept()
   except socket.timeout:continue
   with mutex:state['connections']+=1;state['activeConnections']+=1;count=state['connections'];log('accepted')
   if count>256:
    with mutex:state['activeConnections']-=1;log('connection-limit')
    shutdown.set();client.close();break
   if not slots.acquire(blocking=False):
    with mutex:state['denials']+=1;state['unclassified']+=1;state['activeConnections']-=1;log('concurrency-denied')
    client.close();continue
   t=threading.Thread(target=serve,args=(client,),daemon=True);threads.append(t);t.start()
 finally:
  server.close()
  for t in threads:t.join(timeout=185)
  if any(t.is_alive() for t in threads):raise RuntimeError('unfinished-handler')
  log('final');os.close(fd);raw=logpath.read_bytes();f=os.open(finish,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  try:os.write(f,(digest(raw)+'\n').encode());os.fsync(f)
  finally:os.close(f)
  parent=os.open(logdir,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(parent)
  finally:os.close(parent)

if __name__=='__main__':main()
