import type { BillingConfig } from "../config"
import type { BillingDatabase } from "../database"
import type { Entitlements } from "../entitlements"
import { BillingError } from "../errors"
import { paddleEventSchema, type PaddleEvent } from "./event"
import { applyTransaction } from "./transactions"
import { applyAdjustment, applySubscription } from "./lifecycle"
import { verifyPaddleSignature } from "./signature"

export class PaddleInbox {
  private readonly db: BillingDatabase
  private readonly entitlements: Entitlements
  private readonly config: BillingConfig
  constructor(
    db: BillingDatabase,
    entitlements: Entitlements,
    config: BillingConfig,
  ) {
    this.db = db
    this.entitlements = entitlements
    this.config = config
  }
  receive(raw: string, signature: string | undefined, now = Date.now()) {
    if (Buffer.byteLength(raw) > 262144) {
      throw new BillingError("invalidEvent", 400)
    }

    verifyPaddleSignature(raw, signature, this.config.webhookSecret, now)
    let event: PaddleEvent | undefined = undefined

    try {
      const parsed = JSON.parse(raw) as { event_type?: string }
      const kind = parsed.event_type ?? ""
      const supported =
        kind === "transaction.completed" ||
        kind.startsWith("subscription.") ||
        kind.startsWith("adjustment.")

      if (!supported) {
        return
      }

      // Adjustment item fields differ; access provisioning uses only full/partial type.
      if (parsed.event_type?.startsWith("adjustment.")) {
        ;(parsed as { data: { items?: unknown } }).data.items = undefined
      }

      event = paddleEventSchema.parse(parsed)
    } catch {
      throw new BillingError("invalidEvent", 400)
    }

    this.db.sql
      .prepare(
        "INSERT OR IGNORE INTO billing_events (id,payload,received_at) VALUES (?,?,?)",
      )
      .run(event.event_id, JSON.stringify(event), now)
    this.drain()
  }
  drain() {
    // Multiple passes resolve created/renewal/refund events that arrived before payment.
    for (let pass = 0; pass < 3; pass += 1) {
      const rows = this.db.sql
        .prepare(
          "SELECT id,payload FROM billing_events WHERE processed=0 ORDER BY attempts,received_at LIMIT 100",
        )
        .all() as unknown as Array<{ id: string; payload: string }>
      let progressed = false
      for (const row of rows) {
        try {
          const completed = this.db.transaction(() => {
            const event = JSON.parse(row.payload) as PaddleEvent
            let done = false

            if (event.event_type === "transaction.completed") {
              done = applyTransaction(
                this.db,
                this.entitlements,
                this.config,
                event,
              )
            } else if (event.event_type.startsWith("subscription.")) {
              done = applySubscription(this.db, this.config, event)
            } else {
              done = applyAdjustment(this.db, event)
            }

            this.db.sql
              .prepare(
                "UPDATE billing_events SET processed=?,attempts=attempts+1 WHERE id=?",
              )
              .run(done ? 1 : 0, row.id)

            return done
          })

          if (completed) {
            progressed = true
          }
        } catch (error) {
          if (!(error instanceof BillingError)) {
            throw error
          }

          this.db.sql
            .prepare(
              "UPDATE billing_events SET processed=-1,attempts=attempts+1 WHERE id=?",
            )
            .run(row.id)
        }
      }

      if (!progressed) {
        break
      }
    }
  }
}
