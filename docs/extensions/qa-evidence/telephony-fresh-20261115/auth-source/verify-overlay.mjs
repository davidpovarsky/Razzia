import {createHash} from "node:crypto"
import {readFileSync,lstatSync,realpathSync} from "node:fs"
import {resolve,sep} from "node:path"
const manifest=JSON.parse(readFileSync("/input-auth/source-manifest.json","utf8")),root="/delta"
if(manifest.review_sha!==process.env.PHONE_REVIEW_SHA)throw Error("Authority overlay SHA mismatch")
for(const item of manifest.files){
  const path=resolve(root,item.path),bytes=readFileSync(path)
  if(!path.startsWith(root+sep)||!lstatSync(path).isFile()||realpathSync(path)!==path||bytes.length!==item.bytes||createHash("sha256").update(bytes).digest("hex")!==item.sha256)throw Error("Changed authority overlay input")
}
if(realpathSync("/delta/node_modules")!=="/work/extensions/node_modules")throw Error("Dependencies must be verified S02 read-only workspace")
console.log(JSON.stringify({status:"AUTHORITY_OVERLAY_HASHES_VERIFIED",sha:manifest.review_sha,files:manifest.files.length,accepted_core:manifest.accepted_core}))
