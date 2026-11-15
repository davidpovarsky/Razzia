import fs from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
const base = "96767de6d40b594324687e15b0f386b87dd7ef19"
const git = (...args) => execFileSync("git", args, {encoding:"utf8"}).trim()
const before = (file) => execFileSync("git", ["show", `${base}:${file}`], {encoding:"utf8"})
const read = (file) => fs.readFileSync(file,"utf8")
const config = "packages/socket/src/services/config.ts"
let text = read(config)
const start = text.indexOf("/** C1 allocation only."), end = text.indexOf("export const saveQuizz",start)
if(start<0||end<0)throw Error("Missing exact preparer")
text=(text.slice(0,start)+text.slice(end)).replace('import { accountsEnabled, activeAccount } from "./account-scope"\n',"")
if(text!==before(config))throw Error("Native CRUD changed outside additive preparer")
const api="packages/socket/src/api/index.ts"
text=read(api).replace('import { createNativeCreationPort } from "@razzia/extensions/server"\n',"").replace('import { accountsEnabled, activeAccount } from "../services/account-scope"\n',"").replace('import { resolveConfigRoot } from "../services/config-scope"\n',"").replace('  prepareNativeQuizCreation,\n',"").replace(/    creation:\n[\s\S]*?        : undefined,\n/u,"")
if(text!==before(api))throw Error("API changed outside lazy optional injection")
const main="packages/socket/src/index.ts"
text=read(main).replace('import { recoverCreationReservations } from "@razzia/extensions/server"\n',"").replace('import { resolveConfigRoot } from "@razzia/socket/services/config-scope"\n',"").replace('// C1 reads only its trusted private registry, including explicit tenant roots.\nrecoverCreationReservations(resolveConfigRoot())\n',"")
if(text!==before(main))throw Error("Startup changed outside pre-listen creation recovery")
const newTest="packages/socket/src/services/quiz-creation-reservation.test.ts"
const allowed=new Set([config,api,main,newTest])
const changes=new Set([...git("diff",base,"--name-only","--","packages").split("\n"),...git("ls-files","--others","--exclude-standard","packages").split("\n")].filter(Boolean))
if([...changes].some(file=>!allowed.has(file)))throw Error("Unleased protected path")
const bounds={ [config]:30,[api]:22,[main]:14 }
const lineCounts={}
for(const [file,max] of Object.entries(bounds)){
 const [added,removed]=git("diff",base,"--numstat","--",file).split(/\s+/).map(Number)
 if(added+removed>max)throw Error("Protected ceiling exceeded "+file)
 lineCounts[file]={added,removed,touched:added+removed,ceiling:max}
}
const testLines=read(newTest).trimEnd().split(/\r?\n/).length
if(testLines>280)throw Error("Native test ceiling exceeded")
lineCounts[newTest]={newLines:testLines,ceiling:280}
if(git("diff",base,"--name-only","--","extensions/src/core","packages/common","extensions/src/editor"))throw Error("Frozen digest/editor/common source changed")
const tests=["extensions/src/server/storage/durable-files.test.ts","extensions/src/server/storage/creation-scope.test.ts","extensions/src/server/storage/creation-reservation.test.ts",newTest]
const countCases=(file)=>{
 const source=read(file)
 let count=[...source.matchAll(/\bit\(/gu)].length
 for(const match of source.matchAll(/\bit\.each\(\s*(\[[\s\S]*?\])(?:\s+as const)?\s*\)/gu))
  count+=JSON.parse(match[1].replace(/,\s*\]/gu,"]")).length
 return count
}
const sourceFiles=[config,api,main,newTest,"extensions/src/server/index.ts","extensions/src/server/storage/service.ts","extensions/src/server/storage/sidecar.ts",...git("ls-files","--cached","--others","--exclude-standard","extensions/src/server/storage/creation-*.ts","extensions/src/server/storage/durable-files*.ts").split("\n").filter(Boolean)]
console.log(JSON.stringify({baseCommit:base,protectedChanges:[...changes],lineCounts,nativeCrudAndOriginalApiStartupByteIdenticalOutsideExactHooks:true,frozenDigestEditorCommonUnchanged:true,preparedCases:Object.fromEntries(tests.map(file=>[file,countCases(file)])),runtimeTestsExecuted:false,scope:"Prototype A: single synchronous cooperating writer only; B/production enablement not claimed",files:[...new Set(sourceFiles)].map(file=>{const bytes=fs.readFileSync(file);return{file,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")}})},null,2))
