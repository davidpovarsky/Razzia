import {harness,show,newKey,data,MemoryDrafts} from "/work/extensions/src/mcp-app/tests/server/fixtures.ts"
const store=new MemoryDrafts()
let checks=0
const h=await harness({drafts:store,rateLimit:async()=>{checks++;return true}})
try {
 const c=data(await h.call("create_game_draft",{authoredShowJson:JSON.stringify(show()),idempotencyKey:newKey()}))
 const record=[...store.records.values()][0]
 record.summary.title="Different stored summary"
 const got=await h.call("get_game_draft",{draftId:c.draftId})
 const g=data(got)
 console.log(JSON.stringify({case:"inconsistent-stored-summary",ok:!got.isError,summaryTitle:g.summary.title,contentTitle:JSON.parse(g.authoredShowJson).title}))
 const before=checks
 const malformed=await h.call("get_game_draft",{draftId:newKey(),synthetic_secret_key:"x"})
 console.log(JSON.stringify({case:"malformed-rate",limiterCalls:checks-before,isError:malformed.isError===true,hasStructured:!!malformed.structuredContent}))
} finally {await h.close()}
