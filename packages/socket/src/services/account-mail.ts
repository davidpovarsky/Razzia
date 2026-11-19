import { sendTransactionalMail } from "./mail-provider"
import {
  type PublicAccount,
  accountForEmail,
  canIssueCode,
  issueCode,
  limitAction,
} from "./account-auth"

export async function sendAccountMail(
  user: PublicAccount,
  purpose: "verify" | "reset",
): Promise<void> {
  if (!canIssueCode(user.id, purpose)) {
    return
  }

  if (!limitAction(`${user.id}:${purpose}`, 5, 3600000)) {
    return
  }

  const key = process.env.RESEND_API_KEY
  const from = process.env.TADAZZ_AUTH_EMAIL_FROM

  if (!key || !from) {
    throw new Error("Account email is not configured")
  }

  const code = issueCode(user.id, purpose)
  const title =
    purpose === "verify" ? "Verify your email" : "Reset your password"
  const text = `Your Tadazz code is ${code}. It expires in 10 minutes. Ignore this email if you did not request it.`
  await sendTransactionalMail({
    from,
    to: [user.email],
    subject: `Tadazz - ${title}`,
    text,
  })
}

export async function requestAccountReset(email: string): Promise<void> {
  const user = accountForEmail(email)

  if (user?.verified) {
    await sendAccountMail(user, "reset")
  }
}
