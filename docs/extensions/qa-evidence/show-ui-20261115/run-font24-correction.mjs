// Correct only the direct V2 fixture selector; preserve font23 and its failure.
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
const tag = process.argv[2] ?? "font24"
if (!["font24", "font25", "font26"].includes(tag)) throw new Error("Invalid correction namespace")
const source = readFileSync("docs/extensions/qa-evidence/show-ui-20261115/qa-native-font.spec.ts", "utf8")
const program = `
import fs from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const qa='/work/docs/extensions/qa-evidence/show-ui-20261115';
const root='/tmp/font24';fs.mkdirSync(root);fs.mkdirSync('/out/font24');
const source=${JSON.stringify(source)};
fs.writeFileSync('/out/font24/canonical-spec.ts',source);
const adapted=source.replaceAll('../../../../node_modules/', '/work/node_modules/').replaceAll('"./qa-localized-content"','"'+qa+'/qa-localized-content.ts"').replaceAll('"./qa-rubik-resources"','"'+qa+'/qa-rubik-resources.ts"');
fs.writeFileSync(root+'/qa-native-font.spec.ts',adapted);
fs.writeFileSync(root+'/config.ts', 'import base from "'+qa+'/qa-native-font.config.ts";export default {...base,testDir:"/tmp/font24",outputDir:"/out/font24-browser-results"}');
fs.writeFileSync('/out/font24/adapter-receipt.json',JSON.stringify({canonicalSha256:createHash('sha256').update(source).digest('hex'),adaptedSha256:createHash('sha256').update(adapted).digest('hex'),meaning:'Only three import paths made absolute for the RAM correction view. First six-test run and failures preserved; rerun only two positive cases.'},null,2));
fs.writeFileSync('/out/font24/adapted-spec.ts',adapted);
fs.writeFileSync('/out/font24/tsconfig.json',JSON.stringify({extends:'/work/extensions/tsconfig.json',include:[root+'/qa-native-font.spec.ts'],compilerOptions:{typeRoots:['/work/extensions/node_modules/@types']}}));
const run=(name,args,env=process.env)=>{const p=spawnSync(process.execPath,args,{encoding:'utf8',env});fs.writeFileSync('/out/font24/'+name+'.log',(p.stdout??'')+(p.stderr??''));fs.writeFileSync('/out/font24/'+name+'.exit',String(p.status));return p.status};
run('typescript',['/work/extensions/node_modules/typescript/bin/tsc','-p','/out/font24/tsconfig.json']);
const format=spawnSync(process.execPath,['/work/node_modules/.pnpm/prettier@3.9.10/node_modules/prettier/bin/prettier.cjs','--config','/out/prettier.json','--stdin-filepath',qa+'/qa-native-font.spec.ts'],{input:source,encoding:'utf8'});
fs.writeFileSync('/out/font24/formatted-spec.ts',format.stdout);fs.writeFileSync('/out/font24/format.exit',String(format.status));
const host=await import('node:child_process').then(({spawn})=>spawn(process.execPath,['/out/harness-server-build/qa-fixture-server.js','/tmp/native-font-fixture',fs.readFileSync('/out/font-browser-sha.txt','utf8'),'/out/font-artifact-index.json','v2','rubik'],{stdio:['ignore','pipe','pipe']}));
let log='';const ready=new Promise((resolve,reject)=>{host.stdout.on('data',b=>{log+=b.toString();if(log.includes('QA_PORT='))resolve()});host.stderr.on('data',b=>{log+=b.toString()});host.on('exit',code=>reject(Error('host early '+code)));});
await ready;const port=log.match(/QA_PORT=(\\d+)/u)[1];
const status=run('browser',['/work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js','test','--config',root+'/config.ts','--grep','decoded exact'],{...process.env,TADAZZ_QA_BASE:'http://127.0.0.1:'+port});
host.kill();fs.writeFileSync('/out/font24/host.log',log);console.log(JSON.stringify({browser:status}));
`
const result = spawnSync("ssh", ["-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes", "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168", "sudo -n docker exec -i tadazz-show-ui-E-font23 node --input-type=module"], { input: program.replaceAll("font24", tag), encoding: "utf8" })
process.stdout.write(result.stdout ?? "")
process.stderr.write(result.stderr ?? "")
process.exitCode = result.status ?? 1
