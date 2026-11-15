// Unmounted source candidate. No default lease store, credentials or endpoint.
import { createHash, timingSafeEqual } from "node:crypto"
import { performance } from "node:perf_hooks"
import type Game from "@razzia/socket/services/game"
import { Denied, identifier, validateContext, type Action, type VerifiedServiceContext } from "../../../server/phone-lifecycle-v2/contracts"
import type { RealGameFacade } from "../../../server/phone-lifecycle-v2/game-facade"
import { NativeAccountAuthority } from "./native-account-authority"

export interface ServiceAddress {
  readonly owner:string
  readonly game:string
  readonly provider:string
  // Stable server-side lease identity, not a display label.
  readonly service:string
  readonly version:number
}
export interface ServiceCredentialBinding extends ServiceAddress {
  readonly issuerSid:string
  readonly executorId:string
  readonly expiresAt:number
  readonly initialActions:readonly Action[]
}
export interface ServiceLeaseRecord extends ServiceCredentialBinding {
  readonly currentActions:readonly Action[]
  readonly state:"PENDING_DELIVERY"|"ACTIVE"|"REVOKED"
  readonly revokedAt:number|null
  readonly capabilityHash:string
}
export interface SynchronousServiceLeaseReader {
  // REQUIRED future concrete SQL reader. Query exact owner/game/provider/service
  // and CURRENT authority version, never a historical row that remains active.
  // No filesystem path derives from this untrusted candidate address.
  readCurrent(address:ServiceAddress):ServiceLeaseRecord|undefined
}
interface RequestProof {
  readonly address:ServiceAddress
  readonly suppliedHash:string
  readonly nativeGame:Game
  readonly facade:RealGameFacade
  readonly deadline:number
}
const PHONE_ACTIONS:readonly Action[]=["register","poll","answer","hangup"]
const REQUEST_LIFETIME_MS=30000
const DUMMY_HASH="0".repeat(64)
function denied():never{throw new Denied("service_denied")}
function copyAddress(input:ServiceAddress):ServiceAddress{
  const address=Object.freeze({owner:input.owner,game:input.game,provider:input.provider,service:input.service,version:input.version})
  for(const part of [address.owner,address.game,address.provider,address.service])identifier(part)
  if(!Number.isSafeInteger(address.version)||address.version<1)denied()
  return address
}
function canonicalActions(actions:readonly Action[]):readonly Action[]{
  if(!Array.isArray(actions)||actions.length!==new Set(actions).size||actions.some(action=>!PHONE_ACTIONS.includes(action)))denied()
  return Object.freeze([...actions].sort())
}
function sameHash(a:string,b:string){
  return /^[0-9a-f]{64}$/u.test(a)&&/^[0-9a-f]{64}$/u.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"))
}

// No secret is generated or persisted by this read-side leaf. A future approved
// authority writer must use this same domain/scope/version-bound representation.
export function serviceCapabilityHash(input:ServiceCredentialBinding,capability:string):string{
  const address=copyAddress(input)
  if(typeof capability!=="string"||!/^[0-9a-f]{64}$/u.test(capability))denied()
  identifier(input.issuerSid);identifier(input.executorId)
  if(!Number.isSafeInteger(input.expiresAt)||input.expiresAt<0)denied()
  const initial=canonicalActions(input.initialActions)
  return createHash("sha256").update("tadazz:phone-service:v2\0")
    .update(JSON.stringify([address.owner,address.game,address.provider,address.service,address.version,
      input.issuerSid,input.executorId,input.expiresAt,initial]))
    .update("\0").update(Buffer.from(capability,"hex")).digest("hex")
}

export class RequestBoundServiceVerifier {
  private readonly requests=new WeakMap<VerifiedServiceContext,RequestProof>()
  private readonly accounts=new NativeAccountAuthority()
  constructor(private readonly leases:SynchronousServiceLeaseReader){}

  private read(address:ServiceAddress):ServiceLeaseRecord{
    const record=this.leases.readCurrent(address)
    // A future async adapter cannot enter a synchronous transaction by returning
    // a truthy Promise. No callback result is trusted through an await.
    if(record&&"then" in record)denied()
    if(!record)denied()
    return record
  }

  private validLease(record:ServiceLeaseRecord,address:ServiceAddress,action:Action,suppliedHash:string){
    if(!PHONE_ACTIONS.includes(action)||record.owner!==address.owner||record.game!==address.game||
      record.provider!==address.provider||record.service!==address.service||record.version!==address.version||
      record.state!=="ACTIVE"||record.revokedAt!==null||!Number.isSafeInteger(record.expiresAt)||
      record.expiresAt<=Date.now()||!sameHash(suppliedHash,record.capabilityHash))denied()
    identifier(record.issuerSid);identifier(record.executorId)
    const initial=canonicalActions(record.initialActions),current=canonicalActions(record.currentActions)
    if(!initial.includes("register")||!initial.includes(action)||!current.includes(action)||current.some(a=>!initial.includes(a)))denied()
    return initial
  }

  begin(input:ServiceAddress,capability:string,action:Action,facade:RealGameFacade):VerifiedServiceContext{
    try{
      this.accounts.assertStrictProfile()
      if(!PHONE_ACTIONS.includes(action))denied()
      const address=copyAddress(input)
      if(typeof capability!=="string"||!/^[0-9a-f]{64}$/u.test(capability))denied()
      const candidate=this.leases.readCurrent(address)
      if(candidate&&"then" in candidate)denied()
      const suppliedHash=serviceCapabilityHash(candidate??{...address,issuerSid:"absent",executorId:"absent",expiresAt:0,initialActions:[]},capability)
      const expected=candidate?.capabilityHash
      // Unknown rows still perform a fixed-length comparison; disclose no row,
      // owner, account, Game or grant metadata to the caller.
      if(!sameHash(suppliedHash,typeof expected==="string"&&/^[0-9a-f]{64}$/u.test(expected)?expected:DUMMY_HASH)||!candidate)denied()
      const initial=this.validLease(candidate,address,action,suppliedHash)
      const owner=this.accounts.assertLiveOwner({owner:candidate.owner,issuerSid:candidate.issuerSid,game:candidate.game,expiresAt:candidate.expiresAt})
      const context:VerifiedServiceContext=Object.freeze({verified:true,owner:owner.owner,
        issuerSid:owner.issuerSid,game:owner.game,provider:candidate.provider,service:candidate.service,
        executorId:candidate.executorId,actions:initial,expiresAt:candidate.expiresAt})
      if(facade.executorId!==candidate.executorId||!facade.exists(context))denied()
      this.requests.set(context,Object.freeze({address,suppliedHash,nativeGame:owner.nativeGame,facade,
        deadline:performance.now()+REQUEST_LIFETIME_MS}))
      try{this.assertCurrent(context,action)}catch(error){this.requests.delete(context);throw error}
      return context
    }catch{denied()}
  }

  private assertCurrent(context:VerifiedServiceContext,action:Action){
    const proof=this.requests.get(context)
    if(!proof||performance.now()>=proof.deadline)denied()
    validateContext(context,action)
    this.accounts.assertStrictProfile()
    const record=this.read(proof.address),initial=this.validLease(record,proof.address,action,proof.suppliedHash)
    if(context.owner!==record.owner||context.game!==record.game||context.provider!==record.provider||
      context.service!==record.service||context.issuerSid!==record.issuerSid||context.executorId!==record.executorId||
      context.expiresAt!==record.expiresAt||JSON.stringify(context.actions)!==JSON.stringify(initial))denied()
    this.accounts.assertLiveOwner({owner:record.owner,issuerSid:record.issuerSid,game:record.game,expiresAt:record.expiresAt},proof.nativeGame)
    if(proof.facade.executorId!==record.executorId||!proof.facade.exists(context))denied()
  }

  // Supply this SAME function to the existing store and coordinator. Every call
  // reloads authority and checks the input context's request proof; no cached
  // first-principal lambda, asynchronous verification or durable secret cache.
  readonly verifyCurrent=(context:VerifiedServiceContext,action:Action):boolean=>{
    try{this.assertCurrent(context,action);return true}catch{return false}
  }

  release(context:VerifiedServiceContext){this.requests.delete(context)}
}
