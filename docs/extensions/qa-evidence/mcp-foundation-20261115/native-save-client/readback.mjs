import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
const root=process.argv[2]
if(path.dirname(root??'')!=='/home/david/tadazz-f-native-save-evidence-20261115'||!/^tadazz-m3a-synthetic-[A-Za-z0-9]+$/.test(path.basename(root??'')))throw Error('Refusing foreign root')
const marker=fs.readFileSync(path.join(root,'.f-native-save-client-fixture.json'))
if(JSON.parse(marker).kind!=='F-real-E-native-save-client')throw Error('Foreign fixture marker')
const hash=b=>createHash('sha256').update(b).digest('hex'),files=[]
function walk(dir){if(!fs.existsSync(dir))return;for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())walk(full);else if(item.isFile()){const bytes=fs.readFileSync(full),stat=fs.statSync(full);files.push({path:path.relative(root,full),bytes:bytes.length,mode:stat.mode&0o777,sha256:hash(bytes)})}else throw Error('Unexpected fixture link')}}
for(const owner of fs.readdirSync(path.join(root,'tenants')))for(const suffix of ['quizz','native-sentinels','extensions/quizzes','extensions/mcp-oauth'])walk(path.join(root,'tenants',owner,suffix))
walk(path.join(root,'native-sentinels'));walk(path.join(root,'.tadazz-creation-operations-v1'))
const receipt=fs.readFileSync(path.join(root,'public-native-client-results.json'))
console.log(JSON.stringify({root,runtime:process.version,platform:process.platform,kernel:os.release(),filesystemMagic:fs.statfsSync(root).type,markerSha256:hash(marker),publicReceiptSha256:hash(receipt),publicReceipt:JSON.parse(receipt),files,privateKeysTokensAndAccountDatabaseExcluded:true},null,2))
