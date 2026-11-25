const fs=require('node:fs'),crypto=require('node:crypto');
const m=JSON.parse(fs.readFileSync('/inputs/staged-manifest.json','utf8'));
const mismatches=[];
for(const f of [...m.files,...m.aux]){try{const b=fs.readFileSync('/work/'+f.path);if(b.length!==f.size||crypto.createHash('sha256').update(b).digest('hex')!==f.sha256)mismatches.push(f.path)}catch(e){mismatches.push(f.path+': '+e.code)}}
console.log(JSON.stringify({commit:m.commit,verifiedFiles:m.files.length,auxFiles:m.aux.length,mismatches,at:new Date().toISOString()}));
if(mismatches.length)process.exitCode=1;
