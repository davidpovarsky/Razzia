import type { PublicAccount } from "./account-auth"
import {
  accountForEmail,
  canIssueCode,
  issueCode,
  limitAction,
} from "./account-auth"

export async function sendAccountMail(
  user: PublicAccount,
  purpose: "verify" | "reset",
): Promise<void> {
  if (!canIssueCode(user.id, purpose)) return
  if (!limitAction(user.id + ":" + purpose, 5, 3600000)) return
  const key = process.env.RESEND_API_KEY
  const from = process.env.TADAZZ_AUTH_EMAIL_FROM
  if (!key || !from) throw new Error("Account email is not configured")
  const code = issueCode(user.id, purpose)
  const title =
    purpose === "verify" ? "Verify your email" : "Reset your password"
  const text = `Your Tadazz code is ${code}. It expires in 10 minutes. Ignore this email if you did not request it.`
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [user.email],
      subject: `Tadazz - ${title}`,
      text,
    }),
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error("Could not send verification message")
}

export async function requestAccountReset(email: string): Promise<void> {
  const user = accountForEmail(email)
  if (user?.verified) await sendAccountMail(user, "reset")
}
