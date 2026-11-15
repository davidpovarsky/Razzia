// Unmounted read-side preparation only. No route, credential issuance or storage.
import { SESSION_ROLES } from "@razzia/common/constants"
import { jwtSecret as existingVerificationSecret } from "@razzia/socket/env"
import { accountsEnabled } from "@razzia/socket/services/account-scope"
import { activeAccount, isAccountSessionValid } from "@razzia/socket/services/account-auth"
import { verifyToken } from "@razzia/socket/services/auth"
import Registry from "@razzia/socket/services/registry"
import type Game from "@razzia/socket/services/game"
import { Denied, identifier } from "../../../server/phone-lifecycle-v2/contracts"

export interface OwnerSessionBinding {
  readonly owner:string
  readonly issuerSid:string
  readonly game:string
  readonly expiresAt:number
}
export interface LiveOwnedAuthority extends OwnerSessionBinding {
  // Server-only object identity, never an HTTP claim or serialized response.
  readonly nativeGame:Game
}
export interface PreparedManagerAuthority { readonly kind:"prepared-manager-authority" }

export class NativeAccountAuthority {
  private readonly preparations=new WeakMap<PreparedManagerAuthority,LiveOwnedAuthority>()

  assertStrictProfile(){
    const configured=process.env.JWT_SECRET
    if(accountsEnabled()!==true||typeof configured!=="string"||configured.length<32||configured!==existingVerificationSecret)
      throw new Denied("owner_authority_denied")
  }

  // This is deliberately async and MUST finish before a lifecycle transaction
  // or owning dispatch turn. A prepared ticket is not a cached permission.
  async prepareManager(token:string,game:string):Promise<PreparedManagerAuthority>{
    try{
      this.assertStrictProfile()
      identifier(game)
      if(typeof token!=="string"||token.length===0||token.length>16384)throw new Denied("owner_authority_denied")
      const claims=await verifyToken(token)
      if(claims.role!==SESSION_ROLES.MANAGER||!claims.sid||!Number.isSafeInteger(claims.exp)||!Number.isSafeInteger(claims.exp*1000))
        throw new Denied("owner_authority_denied")
      const live=this.assertLiveOwner({owner:claims.sub,issuerSid:claims.sid,game,expiresAt:claims.exp*1000})
      const prepared=Object.freeze({kind:"prepared-manager-authority" as const})
      this.preparations.set(prepared,live)
      return prepared
    }catch{
      // Do not expose JWT/library diagnostics or the incoming Bearer value.
      throw new Denied("owner_authority_denied")
    }
  }

  revalidateManager(prepared:PreparedManagerAuthority):LiveOwnedAuthority{
    const prior=this.preparations.get(prepared)
    if(!prior)throw new Denied("owner_authority_denied")
    return this.assertLiveOwner(prior,prior.nativeGame)
  }

  releaseManager(prepared:PreparedManagerAuthority){this.preparations.delete(prepared)}

  // Synchronous REAL account/session/Registry checks, suitable for the existing
  // V2-A callback boundary. Binding must first come from an authenticated lease
  // or the private manager preparation above, never body/journal assertions.
  assertLiveOwner(binding:OwnerSessionBinding,expectedGame?:Game):LiveOwnedAuthority{
    try{
      this.assertStrictProfile()
      identifier(binding.owner);identifier(binding.issuerSid);identifier(binding.game)
      if(!Number.isSafeInteger(binding.expiresAt)||binding.expiresAt<=Date.now())throw new Denied("owner_authority_denied")
      const account=activeAccount(binding.owner)
      if(!account||account.id!==binding.owner||account.verified!==true||
        isAccountSessionValid(binding.owner,binding.issuerSid)!==true)
        throw new Denied("owner_authority_denied")
      const nativeGame=Registry.getInstance().getManagerGame(binding.game,binding.owner)
      if(!nativeGame||nativeGame.gameId!==binding.game||nativeGame.manager.clientId!==binding.owner||
        (expectedGame!==undefined&&nativeGame!==expectedGame))throw new Denied("owner_authority_denied")
      return Object.freeze({owner:binding.owner,issuerSid:binding.issuerSid,game:binding.game,
        expiresAt:binding.expiresAt,nativeGame})
    }catch{throw new Denied("owner_authority_denied")}
  }
}
