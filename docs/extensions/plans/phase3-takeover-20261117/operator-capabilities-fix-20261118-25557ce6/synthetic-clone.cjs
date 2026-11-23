
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

const origin = "https://tadazz.com";
const expectedX = "synthetic-public";
const nativeFiles = [];
const packagePolicy = {"accountsEnabled": true, "installerEnabled": true, "expectedStatus": 401}, routes = {};
const crypto = require("node:crypto");
const fail = () => { throw new Error("clone probe failed"); };
function req(path, status=200, limit=1048576) {
  // Undici may replace caller Host with the loopback transport host. The raw
  // request exercises the exact production Host boundary through local Nginx.
  return new Promise((resolve,reject)=>{
    const q=require("node:http").request({host:"127.0.0.1",port:3000,path,
      headers:{Host:"tadazz.com"},timeout:2500},r=>{
      const chunks=[];let size=0;
      r.on("data",b=>{size+=b.length;if(size>limit){q.destroy();reject(Error("probe limit"));}else chunks.push(b);});
      r.on("end",()=>{routes['GET '+path.split('?')[0]]={status:r.statusCode,expectedStatus:status,
          contentType:String(r.headers['content-type']??'').split(';')[0].trim().toLowerCase()};
        if(r.statusCode!==status){reject(Error("probe status"));return;}
        const body=Buffer.concat(chunks);resolve({body,json:async()=>JSON.parse(body),
          headers:{get:name=>r.headers[name.toLowerCase()]??null}});});
      r.on("error",reject);
    });
    q.on("timeout",()=>q.destroy(Error("probe timeout")));q.on("error",reject);q.end();
  });
}
(async()=>{
  const end=Date.now()+20000; let healthy=false;
  while(Date.now()<end){try{if((await (await req("/api/health")).json()).status==="ok"){healthy=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,250));}
  if(!healthy)fail();
  if((await (await req("/api/auth/mode")).json()).accountsEnabled!==true)fail();
  if((await (await req("/api/billing/config")).json()).enabled!==false)fail();
  await req("/api/billing",401);await req("/api/accounts/me",401);
  if(packagePolicy.accountsEnabled!==true||process.env.TADAZZ_ACCOUNTS_ENABLED!=="true"||
     packagePolicy.installerEnabled!==(process.env.TADAZZ_PACKAGE_INSTALLER_ENABLED==="true")||
     packagePolicy.expectedStatus!==(packagePolicy.installerEnabled?401:404))fail();
  const capabilityResponse=await req("/api/packages/capabilities",packagePolicy.expectedStatus);
  if(!capabilityResponse.headers.get("content-type")?.startsWith("application/json"))fail();
  const capabilities=await capabilityResponse.json();
  if(capabilities?.error!==(packagePolicy.installerEnabled?"errors:auth.unauthorized":"not-found")||Object.keys(capabilities).length!==1)fail();
  const packageCapabilities={...packagePolicy,...routes['GET /api/packages/capabilities']};
  const metadata=await(await req("/.well-known/oauth-protected-resource")).json();
  if(metadata.resource!==origin+"/mcp")fail();
  const jwks=await(await req("/oauth/jwks.json")).json();
  if(jwks.keys?.length!==1||jwks.keys[0].x!==expectedX||"d" in jwks.keys[0])fail();
  const mcp=await req("/mcp",401);
  if(mcp.headers.get("www-authenticate")!=='Bearer resource_metadata="'+origin+'/.well-known/oauth-protected-resource", scope="tadazz.catalog.read"')fail();
  const consent=await req("/studio/oauth-consent?oauth_request=isolated-restore-proof");
  if(consent.headers.get("x-frame-options")!=="DENY"||consent.headers.get("cache-control")!=="no-store")fail();
  if(process.env.TADAZZ_INLINE_GAME_PREVIEW_ENABLED!=="true")fail();
  for(const f of nativeFiles){
    const r=await req("/tadazz-application-runtime/"+f.name,200,f.bytes);
    if(r.body.length!==f.bytes||crypto.createHash("sha256").update(r.body).digest("hex")!==f.sha256)fail();
    await req("/api/extensions/preview/runtime/"+f.sha256+"/"+f.name,401);
    await req("/api/extensions/preview/public-runtime/"+f.sha256+"/"+f.name,404);
  }
  const nativeApplicationPreview={files:nativeFiles,inlinePreviewEnabled:true,packagedHttpBytes:true,privateRuntimeUnauthorized:true,publicRuntimeDisabled:true,authenticatedStudioRender:false};
  process.stdout.write(JSON.stringify({ok:true,nativeApplicationPreview,packageCapabilities,routes}));
})().catch(()=>{process.stdout.write(JSON.stringify({ok:false,routes}));process.exitCode=1;});
