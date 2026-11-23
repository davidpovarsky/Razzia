import { harness, show, newKey, data, code, MemoryDrafts } from "/work/extensions/src/mcp-app/tests/server/fixtures.ts"
const store = new MemoryDrafts()
let saves = 0, exports = 0
const h = await harness({
 drafts: store,
 storage: { async createNewWithConsent(_p, d) { saves++; return {draftId:d.draftId,revision:d.revision,quizId:"synthetic",savedRevision:1,studioUrl:"https://studio.example.invalid/studio/games"} } },
 exports: { async createAuthorizedDownload(_p,d,format) { exports++; return {exportId:newKey(),draftId:d.draftId,revision:d.revision,format,downloadUrl:"https://studio.example.invalid/download/test",expiresAt:"2030-01-01T00:00:00Z",sha256:"a".repeat(64),bytes:10} } }
})
try {
 const item=show(), created=data(await h.call("create_game_draft",{authoredShowJson:JSON.stringify(item),idempotencyKey:newKey()}))
 const save={draftId:created.draftId,expectedRevision:1,idempotencyKey:newKey(),intent:"createNew"}
 const exp={draftId:created.draftId,expectedRevision:1,idempotencyKey:newKey(),format:"tada-json"}
 const s1=await h.call("save_game",save), e1=await h.call("export_game",exp)
 item.cards[0].question="changed"
 const edit=await h.call("update_game_draft",{draftId:created.draftId,expectedRevision:1,idempotencyKey:newKey(),authoredShowJson:JSON.stringify(item)})
 const s2=await h.call("save_game",save), e2=await h.call("export_game",exp)
 console.log(JSON.stringify({case:"retry-after-edit",firstSaveOK:!s1.isError,firstExportOK:!e1.isError,editOK:!edit.isError,replaySave:s2.isError?code(s2):"OK",replayExport:e2.isError?code(e2):"OK",saveAdapterCalls:saves,exportAdapterCalls:exports}))
 const forged=show(); (forged.cards[0] as any).unknownNested="synthetic-canary"
 const invalid=await h.call("create_game_draft",{authoredShowJson:JSON.stringify(forged),idempotencyKey:newKey()})
 console.log(JSON.stringify({case:"nested-unknown",isError:invalid.isError===true,error:invalid.isError?code(invalid):null}))
} finally { await h.close() }
let authorizerCalls=0
const a=await harness({authorize:async()=>{authorizerCalls++; throw new Error("synthetic-auth-denial")}})
try {
 let reply
 try {reply=await a.call("get_game_draft",{draftId:newKey(),synthetic_secret_key:"synthetic-secret-value"})} catch(e) {reply={thrown:String(e)}}
 const serialized=JSON.stringify(reply)
 console.log(JSON.stringify({case:"sdk-invalid-before-auth",authorizerCalls,reflectedCanaryKey:serialized.includes("synthetic_secret_key"),reflectedCanaryValue:serialized.includes("synthetic-secret-value"),reply}))
} finally {await a.close()}
