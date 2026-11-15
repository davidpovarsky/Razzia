import {harness,newKey} from '/work/extensions/src/mcp-app/tests/server/fixtures.ts'
const h=await harness({authorize:undefined})
try { console.log(JSON.stringify(await h.call('get_game_draft',{draftId:newKey()}),null,2)) } finally {await h.close()}