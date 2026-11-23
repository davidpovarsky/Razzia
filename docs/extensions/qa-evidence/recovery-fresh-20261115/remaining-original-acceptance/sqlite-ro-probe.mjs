import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
if (process.argv[2] === 'read') {
  const uri=pathToFileURL(process.argv[3]); uri.searchParams.set('mode','ro'); uri.searchParams.set('readonly_shm','1')
  try { const db=new DatabaseSync(uri.href,{readOnly:true}); const rows=db.prepare('SELECT id FROM accounts').all(); db.close(); console.log(JSON.stringify({rows,node:process.version,sqlite:process.versions.sqlite})); }
  catch(e) { console.log(JSON.stringify({error:e.message,code:e.errcode,node:process.version,sqlite:process.versions.sqlite}));process.exitCode=1 }
} else {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tadazz-owner-ro-probe-')), token=randomUUID()
  fs.writeFileSync(path.join(root,'.probe-owner'),token,{flag:'wx'})
  const file=path.join(root,'accounts.sqlite'), writer=new DatabaseSync(file)
  writer.exec("PRAGMA journal_mode=WAL; CREATE TABLE accounts(id TEXT); INSERT INTO accounts VALUES('wal-committed-owner');")
  const state=()=>Object.fromEntries(fs.readdirSync(root).sort().map(n=>{const s=fs.statSync(path.join(root,n)); return[n,{bytes:s.size,mode:s.mode,mtime:s.mtimeMs,sha:createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex')}]}))
  const cases=[]
  for(const label of ['live-wal','clean-closed-wal']) {
    if(label==='clean-closed-wal')writer.close()
    const before=state(), child=spawnSync(process.execPath,[process.argv[1],'read',file],{encoding:'utf8'}), after=state()
    cases.push({label,code:child.status,stdout:child.stdout,stderr:child.stderr,before,after,unchanged:JSON.stringify(before)===JSON.stringify(after)})
  }
  console.log(JSON.stringify({node:process.version,sqlite:process.versions.sqlite,cases},null,2))
  if(fs.realpathSync(root)!==root||path.dirname(root)!==fs.realpathSync(os.tmpdir())||!path.basename(root).startsWith('tadazz-owner-ro-probe-')||fs.readFileSync(path.join(root,'.probe-owner'),'utf8')!==token)throw Error('Refuse non-owned probe cleanup')
  fs.rmSync(root,{recursive:true})
}
