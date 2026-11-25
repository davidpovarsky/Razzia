import fs from "node:fs";
import path from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
const root=path.dirname(fileURLToPath(import.meta.url));
export async function resolve(spec,context,next){
 if(spec.endsWith(".json")) return {...await next(spec,context),importAttributes:{type:"json"}};
 if(spec.startsWith("@razzia/common/")) {const base=path.join(root,"packages/common/src",spec.slice(15)); const name=[base+".ts",path.join(base,"index.ts")].find(p=>fs.existsSync(p)); if(!name) throw new Error("Missing real source "+base); return {url:pathToFileURL(name).href,shortCircuit:true}};
 if(spec.startsWith(".") && context.parentURL?.startsWith("file:")){
  const url=new URL(spec,context.parentURL), name=fileURLToPath(url);
  if(!fs.existsSync(name)) for(const candidate of [name+".ts",name.replace(/\.js$/,".ts")])
   if(fs.existsSync(candidate)) return {url:pathToFileURL(candidate).href,shortCircuit:true};
 }
 return next(spec,context);
}
