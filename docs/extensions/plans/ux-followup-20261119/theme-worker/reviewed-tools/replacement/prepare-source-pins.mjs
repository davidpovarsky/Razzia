import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire, isBuiltin} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../../../..");
const req=createRequire(path.join(root,"package.json"));
const parser=createRequire(path.join(root,"extensions/package.json"))("@babel/parser");
const digest=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const slash=(name)=>name.split(path.sep).join("/");

const aliases=JSON.parse(fs.readFileSync(path.join(root,"tsconfig.json"),"utf8")).compilerOptions.paths;
function sourceCandidate(base){
 const stem=base.replace(/\.(?:mjs|cjs|js)$/,"");
 const options=[base,base+".ts",base+".tsx",base+".mts",base+".cts",base+".json",path.join(base,"index.ts"),path.join(base,"index.tsx"),stem+".ts",stem+".tsx"];
 return options.find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
}
function aliasSource(spec){
 for(const [pattern,targets] of Object.entries(aliases)){
  const star=pattern.indexOf("*");
  if(star<0&&spec!==pattern) continue;
  if(star>=0&&(!spec.startsWith(pattern.slice(0,star))||!spec.endsWith(pattern.slice(star+1)))) continue;
  const middle=star<0?"":spec.slice(star,pattern.length-star-1?-(pattern.length-star-1):undefined);
  for(const target of targets){
   const found=sourceCandidate(path.resolve(root,target.replace("*",middle)));
   if(found) return found;
  }
 }
}
const queue=["extensions/qa/package-builder.ts","extensions/qa/package-media-probe.ts","extensions/src/presentation/package-runtime/sdk.tsx"];
const visited=new Set(), external=new Map(), failures=[];
function packageInfo(origin,spec,mode="normal"){
 let r=createRequire(path.join(root,origin));
 if(mode==="vite-resolved") r=createRequire(r.resolve("vite"));
 let resolved=r.resolve(spec);
 let parent=path.dirname(fs.realpathSync(resolved));
 while(parent!==path.dirname(parent)){
  const candidate=path.join(parent,"package.json");
  if(fs.existsSync(candidate)){
   const data=JSON.parse(fs.readFileSync(candidate,"utf8"));
   if(data.name&&data.version) return {origin,spec,resolution:mode,name:data.name,version:data.version};
  }
  parent=path.dirname(parent);
 }
 throw new Error("No package metadata for "+spec);
}
while(queue.length){
 const relative=queue.shift();
 if(visited.has(relative)) continue;
 if(visited.size>=250) throw new Error("Source closure unexpectedly exceeds 250 files");
 const filename=path.join(root,relative);
 if(!fs.existsSync(filename)||fs.lstatSync(filename).isSymbolicLink()) throw new Error("Missing regular source: "+relative);
 visited.add(relative);
 if(relative.endsWith(".json")||relative.endsWith(".css")) continue;
 const text=fs.readFileSync(filename,"utf8");
 const ast=parser.parse(text,{sourceType:"module",plugins:["typescript","jsx"],createImportExpressions:true});
 const names=new Set();
 function walk(node){
  if(!node||typeof node!=="object") return;
  if(Array.isArray(node)){node.forEach(walk);return}
  if(["ImportDeclaration","ExportNamedDeclaration","ExportAllDeclaration"].includes(node.type)&&node.source?.type==="StringLiteral"&&node.importKind!=="type"&&node.exportKind!=="type") names.add(node.source.value);
  if(node.type==="ImportExpression"&&node.source?.type==="StringLiteral") names.add(node.source.value);
  if(node.type==="CallExpression"&&node.callee?.type==="Identifier"&&node.callee.name==="require"&&node.arguments?.length===1&&node.arguments[0].type==="StringLiteral") names.add(node.arguments[0].value);
  Object.values(node).forEach(walk);
 }
 walk(ast);
 for(const spec of names){
  if(isBuiltin(spec)) continue;
  let found=aliasSource(spec);
  if(!found){try{found=createRequire(filename).resolve(spec)}catch{}}
  if(found&&fs.existsSync(found)) found=fs.realpathSync(found);
  if(found&&!found.includes(path.sep+"node_modules"+path.sep)&&found.startsWith(root+path.sep)&&!found.endsWith(".d.ts")){
   queue.push(slash(path.relative(root,found)));
  }else if(spec.startsWith(".")){
   const base=path.resolve(path.dirname(filename),spec);
   const direct=sourceCandidate(base);
   if(direct) queue.push(slash(path.relative(root,direct))); else failures.push({origin:relative,spec});
  }else{
   try{const info=packageInfo(relative,spec);external.set(info.origin+"|"+spec,info)}catch(error){failures.push({origin:relative,spec,error:String(error)})}
  }
 }
}
for(const [origin,spec,mode] of [["packages/web/package.json","vite","normal"],["packages/web/package.json","esbuild","vite-resolved"],["extensions/qa/package-builder.ts","tsx","normal"],["extensions/src/presentation/package-runtime/sdk.tsx","react/jsx-runtime","normal"],["extensions/src/presentation/package-runtime/sdk.tsx","react-dom/client","normal"]]){
 const info=packageInfo(origin,spec,mode); external.set(origin+"|"+spec+"|"+mode,info);
}
if(failures.length) throw new Error(JSON.stringify({unresolved:failures}));
for(const relative of ["pnpm-lock.yaml","package.json","tsconfig.json","extensions/package.json","extensions/tsconfig.json","packages/web/package.json","packages/common/package.json","packages/common/tsconfig.json","scripts/qa/package-build-worker.py"]){
 if(fs.existsSync(path.join(root,relative))) visited.add(relative);
}
const files={};
for(const relative of [...visited].sort()){
 const source=path.join(root,relative);
 const bytes=fs.readFileSync(source);
 const target=path.join(here,"context/source",relative);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,bytes,{flag:"wx"});
 files[relative]={sha256:digest(bytes),bytes:bytes.length};
}
const manifest={
 format:"tadazz-package-worker-source-provenance-v1",
 sourceCandidate:"34568c5c937a51d236a440513adeb9bf93637525",
 baseImage:"sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647",
 sourceSelection:"Static value import/export closure of builder, media probe and SDK, plus explicit runtime manifests/configuration and broker reference. No cache filesystem copied.",
 files,packages:[...external.values()].sort((a,b)=>(a.origin+a.spec).localeCompare(b.origin+b.spec)),
 executableVersions:{node:"24.22.2",ffmpeg:"5.1.9",ffprobe:"5.1.9",python:"3.11.2",esbuild:"0.28.2"},
 codeCopiedFromFrozenRepository:true,dependenciesCopiedFromCache:false,
 compilerOrImageBuilt:false,customerDataIncluded:false,
};
fs.mkdirSync(path.join(here,"context/provenance"),{recursive:true});
fs.writeFileSync(path.join(here,"context/provenance/worker-source-pins.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({files:Object.keys(files).length,bytes:Object.values(files).reduce((sum,f)=>sum+f.bytes,0),packageChecks:manifest.packages.length,packageVersions:[...new Set(manifest.packages.map(p=>p.name+"@"+p.version))],manifestSha256:digest(Buffer.from(JSON.stringify(manifest,null,2)+"\n"))}));
