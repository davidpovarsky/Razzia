// Retains the first TS diagnostic and proves the sole test-only DOM type cast
// erases to the same JS before using the corrected focused TS result.
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
const source = readFileSync("extensions/qa/theme-builder/account-boundary.spec.ts", "utf8")
const program = `
import fs from 'node:fs';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';import{createHash}from'node:crypto';
const require=createRequire('/work/extensions/package.json'),vite=require('vite'),{parse}=require('@babel/parser');
const sha=body=>createHash('sha256').update(body).digest('hex');
const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['start','end','loc','extra','comments','tokens','leadingComments','trailingComments','innerComments'].includes(key)).map(([key,child])=>[key,clean(child)])):value;
const ast=source=>JSON.stringify(clean(parse(source,{sourceType:'module'})));
const root='/out/corrected';fs.mkdirSync(root);
const source=${JSON.stringify(source)},path='extensions/qa/theme-builder/account-boundary.spec.ts';
const original=fs.readFileSync('/work/'+path,'utf8');
const emit=async(source,path)=>(await vite.transformWithOxc(source,'/work/'+path,{lang:path.endsWith('.tsx')?'tsx':path.endsWith('.mjs')?'js':'ts',jsx:{runtime:'automatic'},sourcemap:false})).code;
const originalJs=await emit(original,path),correctedJs=await emit(source,path);
if(ast(originalJs)!==ast(correctedJs))throw Error('Test type cast changed executable AST');
fs.writeFileSync(root+'/canonical-spec.ts',source);
const adapted=source.replaceAll('../../../node_modules/','/work/node_modules/').replaceAll('"../../src/','"/work/extensions/src/');fs.writeFileSync(root+'/account-boundary.spec.ts',adapted);
const config=JSON.parse(fs.readFileSync('/out/tsconfig-focused.json'));config.exclude=['/work/'+path];config.include.push(root+'/account-boundary.spec.ts');fs.writeFileSync(root+'/tsconfig.json',JSON.stringify(config));
const tc=spawnSync(process.execPath,['/work/extensions/node_modules/typescript/bin/tsc','-p',root+'/tsconfig.json'],{encoding:'utf8'});fs.writeFileSync(root+'/typescript.log',(tc.stdout??'')+(tc.stderr??''));fs.writeFileSync(root+'/typescript.exit',String(tc.status));
const pretty=spawnSync(process.execPath,['/work/node_modules/.pnpm/prettier@3.9.10/node_modules/prettier/bin/prettier.cjs','--config','/out/prettier.json','--stdin-filepath','/work/'+path],{input:source,encoding:'utf8'});if(pretty.status!==0)throw Error('Format failed');fs.writeFileSync(root+'/formatted-spec.ts',pretty.stdout);
const receipts=JSON.parse(fs.readFileSync('/out/format-receipts.json')),sourceHashes=JSON.parse(fs.readFileSync('/out/source-sha256.json'));const formatted=[];
for(const record of receipts){const before=fs.readFileSync('/work/'+record.path,'utf8'),after=record.path===path?pretty.stdout:fs.readFileSync('/out/formatted/'+record.path,'utf8');if(sha(before)!==sourceHashes[record.path])throw Error('Executed input changed');const a=await emit(before,record.path),b=await emit(after,record.path);if(ast(a)!==ast(b))throw Error('Format changed executable AST');formatted.push({path:record.path,beforeSha256:sha(before),afterSha256:sha(after),sameExecutableAst:true,sameEmittedJs:a===b});}
const builds=[];for(const mode of ['baseline','fixed']){const receipt=JSON.parse(fs.readFileSync('/out/boundary-'+mode+'-closure.json'));const physical=[],virtual=[];for(const id of [...new Set(receipt.modules.map(id=>id.split('?')[0]))]){if(id.startsWith('/')&&fs.existsSync(id)&&fs.statSync(id).isFile()){const body=fs.readFileSync(id);physical.push({id,realpath:fs.realpathSync(id),bytes:body.length,sha256:sha(body)});}else virtual.push(id);}
const outputs=[];const dir='/out/boundary-'+mode;for(const name of fs.readdirSync(dir,{recursive:true})){const path=dir+'/'+name;if(!fs.statSync(path).isFile())continue;const body=fs.readFileSync(path);outputs.push({name,bytes:body.length,sha256:sha(body)});}
builds.push({mode,studioSource:receipt.studioSource,forbidden:receipt.forbidden,physical,virtual,outputs});}
fs.writeFileSync(root+'/source-bridge.json',JSON.stringify({testOnlyCast:{originalSha256:sha(original),correctedSha256:sha(source),sameEmittedJs:originalJs===correctedJs,sameExecutableAst:true},formatted},null,2));fs.writeFileSync('/out/build-inputs-and-outputs.json',JSON.stringify(builds,null,2));
console.log(JSON.stringify({typescript:tc.status,testCastSameExecutableAst:true,testCastSameEmittedJs:originalJs===correctedJs,formatted:formatted.length,builds:builds.map(b=>({mode:b.mode,physical:b.physical.length,virtual:b.virtual.length,forbidden:b.forbidden.length}))}));
`
const result = spawnSync("ssh", ["-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes", "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168", "sudo -n docker exec -i tadazz-show-ui-E-boundary27 node --input-type=module"], { input: program, encoding: "utf8" })
process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "")
process.exitCode = result.status ?? 1
