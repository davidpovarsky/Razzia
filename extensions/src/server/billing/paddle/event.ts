import { z } from "zod"

const item = z.object({
  price: z.object({ id: z.string() }),
  quantity: z.number().int().positive(),
})

// Zod strips customer/address/email/card payloads before persistence.
export const paddleEventSchema = z.object({
  event_id: z.string().regex(/^evt_[a-z0-9]{26}$/u),
  event_type: z.string().max(100),
  occurred_at: z.iso.datetime({ offset: true }),
  data: z.object({
    id: z.string().max(64),
    status: z.string().optional(),
    customer_id: z.string().optional(),
    subscription_id: z.string().nullable().optional(),
    transaction_id: z.string().optional(),
    currency_code: z.string().optional(),
    items: z.array(item).max(20).optional(),
    origin: z.string().optional(),
    custom_data: z
      .object({ tadazz_intent_id: z.string().optional() })
      .nullable()
      .optional(),
    current_billing_period: z
      .object({
        starts_at: z.iso.datetime({ offset: true }),
        ends_at: z.iso.datetime({ offset: true }),
      })
      .nullable()
      .optional(),
    billing_period: z
      .object({
        starts_at: z.iso.datetime({ offset: true }),
        ends_at: z.iso.datetime({ offset: true }),
      })
      .nullable()
      .optional(),
    scheduled_change: z.object({ action: z.string() }).nullable().optional(),
    action: z.string().optional(),
    type: z.string().optional(),
  }),
})

export type PaddleEvent = z.infer<typeof paddleEventSchema>
