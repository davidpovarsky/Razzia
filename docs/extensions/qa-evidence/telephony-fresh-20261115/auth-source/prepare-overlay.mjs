import {execFileSync} from "node:child_process"
import {createHash} from "node:crypto"
import {readFileSync,mkdirSync,writeFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {resolve} from "node:path"
const root=fileURLToPath(new URL("../../../../../",import.meta.url))
const git=(...args)=>execFileSync("git",args,{cwd:root,maxBuffer:8*1024*1024})
const sha=String(git("rev-parse",(process.argv[2]??"HEAD")+"^{commit}")).trim()
if(!/^[0-9a-f]{40}$/u.test(sha))throw Error("Immutable candidate SHA required")
const paths=["extensions/src/server/phone-lifecycle-v2","extensions/src/telephony/pilot-runtime/service-auth-v2","docs/extensions/qa-evidence/telephony-fresh-20261115/auth-source"]
const hash=bytes=>createHash("sha256").update(bytes).digest("hex")
const files=String(git("ls-tree","-r",sha,"--",...paths)).trim().split("\n").map(line=>{
  const [meta,path]=line.split("\t"),[mode,type,blob]=meta.split(" ")
  if(type!=="blob"||!["100644","100755"].includes(mode))throw Error("Regular immutable source only")
  const bytes=git("cat-file","blob",blob)
  return {path,mode,bytes:bytes.length,sha256:hash(bytes)}
})
for(const name of ["contracts.ts","store.ts","prototype.ts","game-facade.ts"]){
  const path="extensions/src/server/phone-lifecycle-v2/"+name
  if(!git("show",sha+":"+path).equals(git("show","0ad2f09e25daf56dee3fa3c17d7b67b3b8407894:"+path)))throw Error("Accepted V2-A core changed")
}
const output=resolve(root,"docs/extensions/qa-evidence/telephony-fresh-20261115/delivery/phone-auth-"+sha)
mkdirSync(output,{recursive:false})
const archive=resolve(output,"source.tar")
git("archive","--format=tar","--output="+archive,sha,"--",...paths)
const manifest=JSON.stringify({schema:1,review_sha:sha,base_sha:"003cf88b6cba19989388dca20efcfaa01cc8f9ad",accepted_core:"0ad2f09e25daf56dee3fa3c17d7b67b3b8407894",scope:"unmounted authority and actual auth/SQLite regression batch; owner-activated isolated synthetic execution",files},null,2)+"\n"
writeFileSync(resolve(output,"source-manifest.json"),manifest,{flag:"wx"})
const extractor=git("show",sha+":docs/extensions/qa-evidence/telephony-fresh-20261115/auth-source/safe-extract.py")
writeFileSync(resolve(output,"safe-extract.py"),extractor,{flag:"wx"})
const receipt={sha,files:files.length,archive_bytes:readFileSync(archive).length,archive_sha256:hash(readFileSync(archive)),manifest_sha256:hash(manifest),extractor_sha256:hash(extractor)}
if(receipt.archive_bytes>524288)throw Error("Source delta exceeds proposed512KiB cap")
writeFileSync(resolve(output,"delivery.json"),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"})
console.log(JSON.stringify({output,...receipt}))
