import { createHash } from "node:crypto"
import { z } from "zod"
import { limitAction } from "./account-auth"
import { sendTransactionalMail } from "./mail-provider"

export const contactRequestSchema = z.strictObject({
  requestId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  eventType: z.string().trim().min(2).max(160),
  message: z.string().trim().min(1).max(4000),
  website: z.string().max(200).optional(),
})

export type ContactRequest = z.infer<typeof contactRequestSchema>

function configuration() {
  const from =
    process.env.TADAZZ_CONTACT_EMAIL_FROM?.trim() ||
    process.env.TADAZZ_AUTH_EMAIL_FROM?.trim() ||
    ""
  const to = process.env.TADAZZ_CONTACT_EMAIL_TO?.trim() || ""
  const mailbox = /<([^<>]+)>$/u.exec(from)?.[1] ?? from

  return process.env.RESEND_API_KEY &&
    !/[\r\n]/u.test(from) &&
    z.email().safeParse(mailbox).success &&
    z.email().safeParse(to).success
    ? { from, to }
    : null
}

export const contactMailAvailable = () => configuration() !== null

export class ContactError extends Error {
  readonly status: 409 | 429 | 503

  constructor(code: string, status: 409 | 429 | 503) {
    super(code)
    this.status = status
  }
}

const requests = new Map<
  string,
  { digest: string; createdAt: number; result: Promise<void> }
>()
const RETENTION_MS = 60 * 60 * 1000

export function sendContactMail(input: ContactRequest): Promise<void> {
  const config = configuration()

  if (!config) {
    throw new ContactError("contact-unavailable", 503)
  }

  // Bots receive no useful signal and cannot make this a general mail relay.
  if (input.website) {
    return Promise.resolve()
  }

  const now = Date.now()
  for (const [id, entry] of requests) {
    if (now - entry.createdAt >= RETENTION_MS) {
      requests.delete(id)
    }
  }
  const digest = createHash("sha256")
    .update(JSON.stringify([input.email, input.eventType, input.message]))
    .digest("hex")
  const prior = requests.get(input.requestId)

  if (prior) {
    if (prior.digest !== digest) {
      throw new ContactError("contact-request-conflict", 409)
    }

    return prior.result
  }

  const emailHash = createHash("sha256").update(input.email).digest("hex")

  if (
    requests.size >= 1000 ||
    !limitAction("contact:global", 100, RETENTION_MS) ||
    !limitAction(`contact:${emailHash}`, 3, RETENTION_MS)
  ) {
    throw new ContactError("contact-rate-limited", 429)
  }

  const result = sendTransactionalMail(
    {
      from: config.from,
      to: [config.to],
      reply_to: input.email,
      subject: "Tadazz — new event enquiry",
      text: [
        "New enquiry from the Tadazz contact form",
        `Reply to: ${input.email}`,
        `Event: ${input.eventType}`,
        "",
        input.message,
      ].join("\n"),
    },
    `tadazz-contact-${input.requestId}`,
  ).catch(() => {
    requests.delete(input.requestId)
    throw new ContactError("contact-send-failed", 503)
  })
  requests.set(input.requestId, { digest, createdAt: now, result })

  return result
}
