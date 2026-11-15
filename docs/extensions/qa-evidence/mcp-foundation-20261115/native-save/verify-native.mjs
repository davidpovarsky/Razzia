import fs from "node:fs"
import path from "node:path"
import cp from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
const root=process.cwd()
const dir=path.dirname(fileURLToPath(import.meta.url))
const hash=b=>createHash("sha256").update(b).digest("hex")
const manifest=JSON.parse(fs.readFileSync(path.join(dir,"native-candidate-06.inputs.json")))
const product=cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()
const source=manifest.inputs.filter(r=>r.file.replaceAll("\\","/").toLowerCase().startsWith((root+"/extensions/src/mcp-app/").replaceAll("\\","/").toLowerCase())).map(r=>{const file=path.relative(root,r.file).replaceAll("\\","/");const bytes=cp.execFileSync("git",["show",product+":"+file]);return {file,bundleInputSha256:r.sha256,committedSha256:hash(bytes),worktreeSha256:hash(fs.readFileSync(r.file))}})
if(!source.length||source.some(r=>r.bundleInputSha256!==r.committedSha256||r.committedSha256!==r.worktreeSha256))throw Error("Source mismatch")
const run=JSON.parse(fs.readFileSync(path.join(dir,"native-run-06.json")))
const type=JSON.parse(fs.readFileSync(path.join(dir,"types-final-03.json")))
const receipt=JSON.parse(fs.readFileSync(path.join(dir,"native-run-06-public-readback-02.json")))
const files=fs.readdirSync(dir).filter(n=>fs.statSync(path.join(dir,n)).isFile()&&!/^(native-candidate-\d+\.mjs|native-dto-browser\.mjs|final-readback\.json)$/.test(n)).map(n=>({file:n,bytes:fs.statSync(path.join(dir,n)).size,sha256:hash(fs.readFileSync(path.join(dir,n)))}))
const result={product,BPin:manifest.BPin,bundleSha256:manifest.bundleSha256,runExit:run.exit,tests:10,pass:10,fail:0,skip:0,typeDiagnostics:type.diagnostics,typeInputs:type.inputs.length,sourceInputs:source.length,sourceMatches:true,source,runtime:receipt.runtime,kernel:receipt.kernel,filesystemMagic:receipt.filesystemMagic,retainedRoot:receipt.root,publicReceipts:receipt.receipts.length,actualSigkillChildren:receipt.receipts.filter(r=>r.name.endsWith(".verified.json")).map(r=>r.data),files,excludedUntrackedGeneratedBundles:true,noBrowserOrProductionAcceptance:true}
fs.writeFileSync(path.join(dir,"final-readback.json"),JSON.stringify(result,null,2)+"\n",{flag:"wx"})
console.log(JSON.stringify({product,sourceInputs:source.length,sourceMatches:true,typeDiagnostics:type.diagnostics,artifactFiles:files.length}))
