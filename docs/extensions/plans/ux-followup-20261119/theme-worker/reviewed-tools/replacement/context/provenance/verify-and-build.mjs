import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {execFileSync,spawnSync} from "node:child_process";
const EXPECTED_MANIFEST="751fa33e6591657fa40d14f99eb0f6eca775787e7ff5f0b18989bb69c73a89dd";
const manifestFile="/opt/tadazz-package-worker-provenance/worker-source-pins.json";
const [input,output,mode]=process.argv.slice(2);
const verifyOnly=mode==="--verify-only";
if(mode&&!verifyOnly) throw new Error("Unknown verifier mode");
if(process.platform!=="linux"||process.getuid?.()!==65534||process.env.TADAZZ_BUILD_SANDBOX!=="1"||input!=="/input/source.tadazz"||output!=="/output"||process.cwd()!=="/cleanup"){
 throw new Error("Exact unprivileged worker invocation required");
}
const sha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const manifestBytes=fs.readFileSync(manifestFile);
if(sha(manifestBytes)!==EXPECTED_MANIFEST) throw new Error("Worker source manifest pin mismatch");
const manifest=JSON.parse(manifestBytes);
const report={
 format:"tadazz-fresh-worker-provenance-v1",
 status:"FAIL",sourceManifestSha256:EXPECTED_MANIFEST,
 verifierSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
 sourceCandidate:manifest.sourceCandidate,baseImage:manifest.baseImage,
 asanaTaskId:manifest.asanaTaskId,
 uid:process.getuid(),platform:process.platform,
 files:{},packages:[],executables:{},failures:[],compileAdmitted:false,
 cacheBindUsed:false,customerDataAccessed:false,
};
function fail(check,error){report.failures.push({check,error:String(error).slice(0,500)});}
for(const [relative,pin] of Object.entries(manifest.files)){
 try{
  const file=path.join("/cleanup",relative);
  if(!relative||relative.startsWith("/")||relative.includes("\\")||relative.split("/").includes("..")) throw new Error("Unsafe manifest path");
  if(fs.lstatSync(file).isSymbolicLink()) throw new Error("Source symlink denied");
  const bytes=fs.readFileSync(file),actual=sha(bytes);
  report.files[relative]={sha256:actual,bytes:bytes.length};
  if(actual!==pin.sha256||bytes.length!==pin.bytes) throw new Error("Source hash/size mismatch");
 }catch(error){fail(relative,error)}
}
function resolveMetadata(origin,spec,resolution){
 let req=createRequire(path.join("/cleanup",origin));
 if(resolution==="vite-resolved") req=createRequire(req.resolve("vite"));
 let parent=path.dirname(fs.realpathSync(req.resolve(spec)));
 while(parent!==path.dirname(parent)){
  const file=path.join(parent,"package.json");
  if(fs.existsSync(file)){
   const bytes=fs.readFileSync(file),value=JSON.parse(bytes);
   if(value.name&&value.version) return {name:value.name,version:value.version,root:parent,packageJsonSha256:sha(bytes)};
  }
  parent=path.dirname(parent);
 }
 throw new Error("Package metadata unavailable");
}
let esbuildRoot;
for(const expected of manifest.packages){
 try{
  const actual=resolveMetadata(expected.origin,expected.spec,expected.resolution);
  report.packages.push({origin:expected.origin,spec:expected.spec,resolution:expected.resolution,name:actual.name,version:actual.version,packageJsonSha256:actual.packageJsonSha256});
  if(actual.name!==expected.name||actual.version!==expected.version) throw new Error("Package version/name mismatch");
  if(expected.name==="esbuild") esbuildRoot=actual.root;
 }catch(error){fail("package "+expected.spec+" from "+expected.origin,error)}
}
const versions=manifest.executableVersions;
report.executables.node={version:process.versions.node,sha256:sha(fs.readFileSync(process.execPath))};
if(process.versions.node!==versions.node) fail("node","Expected "+versions.node);
function run(command,args){
 return execFileSync(command,args,{encoding:"utf8",timeout:5000,maxBuffer:100000}).trim();
}
for(const name of ["ffmpeg","ffprobe"]){
 try{
  const first=run(name,["-version"]).split(/\r?\n/)[0];
  const version=first.match(new RegExp("^"+name+" version ([0-9]+\\.[0-9]+\\.[0-9]+)"))?.[1];
  report.executables[name]={version,banner:first};
  if(version!==versions[name]) throw new Error("Decoder version mismatch");
 }catch(error){fail(name,error)}
}
try{
 const banner=run("python3",["--version"]),version=banner.match(/^Python ([0-9.]+)/)?.[1];
 report.executables.python={version,banner};
 if(version!==versions.python) throw new Error("Python version mismatch");
}catch(error){fail("python3",error)}
try{
 const code="import ctypes,json; lib=ctypes.CDLL('libfreetype.so.6'); h=ctypes.c_void_p(); assert lib.FT_Init_FreeType(ctypes.byref(h))==0; a=ctypes.c_int(); b=ctypes.c_int(); c=ctypes.c_int(); lib.FT_Library_Version(h,ctypes.byref(a),ctypes.byref(b),ctypes.byref(c)); lib.FT_Done_FreeType(h); print(json.dumps({'version':str(a.value)+'.'+str(b.value)+'.'+str(c.value)}))";
 const value=JSON.parse(run("python3",["-c",code]));
 report.executables.freetype=value;
 if(value.version!==versions.freetype) throw new Error("FreeType version mismatch");
}catch(error){fail("freetype",error)}
try{
 if(!esbuildRoot) throw new Error("esbuild package root unavailable");
 const binary=path.join(esbuildRoot,"bin/esbuild");
 const version=run(binary,["--version"]);
 report.executables.esbuild={version,entrySha256:sha(fs.readFileSync(binary))};
 if(version!==versions.esbuild) throw new Error("Actual compiler executable version mismatch");
}catch(error){fail("esbuild executable",error)}
if(report.failures.length){
 fs.writeFileSync(path.join(output,"provenance.json"),JSON.stringify(report,null,2)+"\n");
 console.error("TADAZZ_WORKER_PROVENANCE_FAILED",JSON.stringify(report.failures));
 process.exit(3);
}
report.status="PASS";
report.compileAdmitted=!verifyOnly;
report.mode=verifyOnly?"provenance-only":"provenance-and-compile";
report.verifiedAt=new Date().toISOString();
fs.writeFileSync(path.join(output,"provenance.json"),JSON.stringify(report,null,2)+"\n");
console.log("TADAZZ_WORKER_PROVENANCE_PASS",JSON.stringify({sourceFiles:Object.keys(report.files).length,packages:report.packages.length,executableVersions:Object.fromEntries(Object.entries(report.executables).map(([name,item])=>[name,item.version]))}));
if(verifyOnly) process.exit(0);
const child=spawnSync(process.execPath,[
 "--import","/cleanup/extensions/node_modules/tsx/dist/loader.mjs",
 "/cleanup/extensions/qa/package-builder.ts",input,output
],{stdio:"inherit",timeout:40000,env:process.env});
if(child.error) throw child.error;
process.exit(child.status??1);
