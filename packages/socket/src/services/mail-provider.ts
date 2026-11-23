export interface TransactionalMessage {
  from: string
  to: string[]
  subject: string
  text: string
  reply_to?: string
}

/** Server-only transport shared by account and contact mail. */
export async function sendTransactionalMail(
  message: TransactionalMessage,
  idempotencyKey?: string,
): Promise<void> {
  const key = process.env.RESEND_API_KEY

  if (!key) {
    throw new Error("Email sending is unavailable")
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(12_000),
  })

  if (!response.ok) {
    throw new Error("Email sending is unavailable")
  }
}
