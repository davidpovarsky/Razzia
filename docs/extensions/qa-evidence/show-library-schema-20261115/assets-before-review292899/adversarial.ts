import { createHash } from "node:crypto"
import { authoredFixture,previewInputFixture,snapshotFixture } from "/workspace/extensions/src/core/show-library/preview-fixtures.ts"
import { derivePreviewIdentityMap, normalizePreviewDraft, getPreviewIdentityId } from "/workspace/extensions/src/core/show-library/identity.ts"
import { identityPreimage } from "/workspace/extensions/src/core/show-library/identity-rule.ts"
import { projectShowBindings } from "/workspace/extensions/src/core/show-library/projection.ts"
import { resolvePreviewPlan } from "/workspace/extensions/src/core/show-library/preview-resolve.ts"
const keys=["\ud800","\ud801","\udc00","\udc01","\ufffd","\ud83d\ude00","\u00e9","e\u0301","constructor","prototype","__proto__"]
const show=authoredFixture(2,keys.length);keys.forEach((k,i)=>show.cards[i].key=k)
const map=derivePreviewIdentityMap(JSON.stringify(show))
const consistent=map.cards.every(e=>e.previewId==="preview-card-"+createHash("sha256").update(identityPreimage("card",e.authoredKey),"ascii").digest("hex"))
const draft=normalizePreviewDraft(previewInputFixture(show))
console.log(JSON.stringify({case:"keys",count:keys.length,unique:new Set(map.cards.map(e=>e.previewId)).size,consistent,normalized:!!draft,deepFrozen:Object.isFrozen(draft.show.cards[0])}))
const original=authoredFixture(2,1), input=previewInputFixture(original);input.context.role="player"
const d=normalizePreviewDraft(input), plan=resolvePreviewPlan(d),card=d.show.cards[0],id=getPreviewIdentityId(d.input.identityMap,"questions",card.key),clock=snapshotFixture().clock
const snapshot={portVersion:3,identityRuleVersion:2,source:"deterministic-fixture",phase:"voting",clock,canAnswer:true,question:{id,text:card.question,questionType:card.questionType,playMode:card.kind,choices:card.answers.map((a,i)=>({id:id+".choice."+(i+1),label:a.text})),solutionAnswerIds:[]}}
const binding={draft:d,plan,currentQuestionId:id,phase:"voting",clock}
const valid=projectShowBindings(snapshot,input.context,binding)
const fake={assetId:"foreign-asset",sha256:"a".repeat(64)}
const altered={...snapshot,question:{...snapshot.question,image:fake,choices:snapshot.question.choices.map((c,i)=>i?c:{...c,asset:fake})}}
let alteredView, alteredError
try{alteredView=projectShowBindings(altered,input.context,binding)}catch(e){alteredError=String(e)}
console.log(JSON.stringify({case:"foreign-assets-in-genuine-binding",declaredAssetCount:d.input.assets.length,accepted:!!alteredView,questionAsset:alteredView?.question?.image,choiceAsset:alteredView?.choices?.[0]?.asset,canAnswer:alteredView?.canAnswer,readiness:alteredView?.answerReadiness,error:alteredError}))
const missing={portVersion:3,identityRuleVersion:2,source:"deterministic-fixture",phase:"voting",clock,canAnswer:true}
const empty=projectShowBindings(missing,input.context,binding)
console.log(JSON.stringify({case:"no-question",canAnswer:empty.canAnswer,reason:empty.answerReadiness,plan:plan.resolution.kind,normalCanAnswer:valid.canAnswer}))
const media=authoredFixture(2,1);media.cards.push({key:"empty-media",kind:"media"} as any)
let blank;try{blank=normalizePreviewDraft(previewInputFixture(media));}catch(e){blank=String(e)}
console.log(JSON.stringify({case:"blank-media",accepted:typeof blank==="object"}))
const unknown=authoredFixture(2,1);Object.assign(unknown.cards[0].answers[0],{imageUrl:"https://foreign.invalid/a.png"});let denied=false
try{normalizePreviewDraft(previewInputFixture(unknown))}catch{denied=true}
console.log(JSON.stringify({case:"foreign-url",denied}))
