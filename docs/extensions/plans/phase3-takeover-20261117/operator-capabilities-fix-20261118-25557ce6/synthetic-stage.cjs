
const Module=require('node:module'),EventEmitter=require('node:events');
const scenario=JSON.parse(process.argv[2]);
const originalLoad=Module._load;
Module._load=function(name,...args){if(name==='node:http')return {request(options,callback){
 const q=new EventEmitter();q.end=()=>queueMicrotask(()=>{
 const r=new EventEmitter();let status=200,type='application/json',body={};
 if(options.path==='/api/health')body={status:'ok'};
 else if(options.path==='/api/auth/mode')body={accountsEnabled:true};
 else if(options.path==='/api/billing/config')body={enabled:false};
 else if(options.path==='/api/packages/capabilities'){status=scenario.status;type=scenario.type;body=scenario.body;}
 else if(options.path.startsWith('/api/')){status=401;body={error:'errors:auth.unauthorized'};}
 r.statusCode=status;r.headers={'content-type':type,'set-cookie':'synthetic-secret-cookie'};
 callback(r);queueMicrotask(()=>{r.emit('data',Buffer.from(JSON.stringify(body)));r.emit('end');});
 });q.destroy=e=>q.emit('error',e||Error('synthetic-destroy'));return q;
 }};return originalLoad.call(this,name,...args)};

const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto');
const origin='https://tadazz.com',routes={},nativeFiles=[],packagePolicy={"accountsEnabled": true, "installerEnabled": true, "expectedStatus": 401};
function req(path,status=200,method='GET',body){return new Promise((resolve,reject)=>{
const q=http.request({host:'127.0.0.1',port:3000,path,method,
 headers:{Host:'tadazz.com',...(body?{'Content-Type':'text/plain;charset=UTF-8'}:{})},timeout:2500},r=>{
 let chunks=[],size=0;r.on('data',b=>{size+=b.length;if(size>8*1024*1024){q.destroy();reject(Error('limit'));}else chunks.push(b)});
 r.on('end',()=>{routes[method+' '+path.split('?')[0]]={status:r.statusCode,expectedStatus:status,contentType:String(r.headers['content-type']??'').split(';')[0].trim().toLowerCase()};
 if(r.statusCode!==status)return reject(Error('status'));const value={body:Buffer.concat(chunks),headers:r.headers};resolve(value)});
});q.on('timeout',()=>q.destroy(Error('timeout')));q.on('error',reject);q.end(body);});}
async function json(path,status=200){const r=await req(path,status);if(!r.headers['content-type']?.startsWith('application/json'))throw Error('type');return JSON.parse(r.body);}
const ok=(v)=>{if(!v)throw Error('probe')}, hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
let ready=false;for(let i=0;i<120;i++){try{ready=(await json('/api/health')).status==='ok';if(ready)break}catch{}await new Promise(r=>setTimeout(r,250))}ok(ready);
ok((await json('/api/auth/mode')).accountsEnabled===true);ok((await json('/api/billing/config')).enabled===false);
for(const p of ['/api/billing','/api/quizz','/api/results','/api/accounts/me'])await req(p,401);
ok(packagePolicy.accountsEnabled===true&&process.env.TADAZZ_ACCOUNTS_ENABLED==='true'&&packagePolicy.installerEnabled===(process.env.TADAZZ_PACKAGE_INSTALLER_ENABLED==='true'));
ok(packagePolicy.expectedStatus===(packagePolicy.installerEnabled?401:404));
const capabilities=await json('/api/packages/capabilities',packagePolicy.expectedStatus);
ok(capabilities?.error===(packagePolicy.installerEnabled?'errors:auth.unauthorized':'not-found')&&Object.keys(capabilities).length===1);
const packageCapabilities={...packagePolicy,...routes['GET /api/packages/capabilities']};
const resource=await json('/.well-known/oauth-protected-resource');ok(resource.resource===origin+'/mcp'&&JSON.stringify(resource.authorization_servers)===JSON.stringify([origin+'/oauth']));
const issuer=await json('/.well-known/oauth-authorization-server/oauth');ok(issuer.issuer===origin+'/oauth'&&issuer.authorization_endpoint===origin+'/oauth/authorize'&&issuer.token_endpoint===origin+'/oauth/token'&&issuer.code_challenge_methods_supported.includes('S256'));
const key=crypto.createPublicKey(JSON.parse(fs.readFileSync('/app/config/extensions/mcp-service/runtime.json')).signingPrivateKeyPem).export({format:'jwk'});
const jwks=await json('/oauth/jwks.json');ok(jwks.keys?.length===1&&jwks.keys[0].x===key.x&&jwks.keys[0].crv==='Ed25519'&&!('d'in jwks.keys[0]));
const mcp=await req('/mcp',401);ok(mcp.headers['www-authenticate']==='Bearer resource_metadata="'+origin+'/.well-known/oauth-protected-resource", scope="tadazz.catalog.read"');ok(mcp.headers['content-type'].startsWith('application/json'));JSON.parse(mcp.body);
for(const p of ['/studio/oauth-consent?oauth_request=stage-smoke','/studio/native-save-consent/'+'a'.repeat(54)])for(const method of ['GET','HEAD']){
 const r=await req(p,200,method);ok(r.headers['content-type'].startsWith('text/html')&&r.headers['cache-control']==='no-store'&&r.headers['x-frame-options']==='DENY'&&r.headers['referrer-policy']==='no-referrer'&&r.headers['content-security-policy'].includes("frame-ancestors 'none'"));ok(method==='GET'?r.body.length>0:r.body.length===0);}
const index=fs.readFileSync('/app/web/index.html');ok(hash((await req('/')).body)===hash(index));
const assets=[...new Set([...index.toString().matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+)/g)].map(m=>m[1]))];ok(assets.length>0&&assets.length<100);
for(const p of assets)ok(hash((await req(p)).body)===hash(fs.readFileSync('/app/web'+p)));
ok(process.env.TADAZZ_INLINE_GAME_PREVIEW_ENABLED==='true');
for(const f of nativeFiles){
 const b=fs.readFileSync('/app/web/tadazz-application-runtime/'+f.name);ok(b.length===f.bytes&&hash(b)===f.sha256);
 const r=await req('/tadazz-application-runtime/'+f.name);ok(r.body.length===f.bytes&&hash(r.body)===f.sha256);
 await req('/api/extensions/preview/runtime/'+f.sha256+'/'+f.name,401);
 await req('/api/extensions/preview/public-runtime/'+f.sha256+'/'+f.name,404);
}
const nativeApplicationPreview={files:nativeFiles,inlinePreviewEnabled:true,packagedHttpBytes:true,privateRuntimeUnauthorized:true,publicRuntimeDisabled:true,authenticatedStudioRender:false};
const query='/ws/?EIO=4&transport=polling&t=stage-smoke';const packet=(await req(query)).body.toString();ok(packet[0]==='0');const handshake=JSON.parse(packet.slice(1));ok(/^[A-Za-z0-9_-]{1,256}$/.test(handshake.sid));await req(query+'&sid='+handshake.sid,200,'POST','1');
process.stdout.write(JSON.stringify({ok:true,routes,engineIoOpenClose:true,indexAndEntryAssets:assets.length,nativeApplicationPreview,packageCapabilities}));
})().catch(()=>{process.stdout.write(JSON.stringify({ok:false,routes}));process.exitCode=1});
