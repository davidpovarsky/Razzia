import { PrototypeStore } from "../../../../../extensions/src/server/phone-lifecycle-v2/store"
import {
  digest,
  capabilityHash,
} from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"
import { readFileSync } from "node:fs"
const { root, context, input } = JSON.parse(
  readFileSync(process.env.PHONE_V2A_CAS_INPUT!, "utf8"),
)
const store = new PrototypeStore(root, context, () => true)
process.send?.({ ready: true })
process.once("message", () => {
  const result = store.reserveRegistration(context, {
    requestId: input.requestId,
    callerHash: digest(input.phone),
    referenceHash: digest(input.providerReference),
    capabilityHash: capabilityHash(input.capability),
    expectedPredecessor: 0,
    fingerprint: digest(JSON.stringify(input)),
  })
  process.send?.({
    kind: result.kind,
    status: result.kind === "receipt" ? result.receipt.status : "RESERVED",
  })
  store.close()
  process.disconnect?.()
})
