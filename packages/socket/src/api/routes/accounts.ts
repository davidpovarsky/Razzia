import { zValidator } from "@hono/zod-validator"
import { SESSION_ROLES } from "@razzia/common/constants"
import { mintToken } from "@razzia/socket/services/auth"
import { accountsEnabled } from "@razzia/socket/services/account-scope"
import { checkAccountConfiguration } from "@razzia/socket/services/account-db"
import {
  accountForEmail,
  authenticate,
  consumeCode,
  registerAccount,
  resetPassword,
  verifyRegistrationPassword,
  limitAction,
} from "@razzia/socket/services/account-auth"
import {
  requestAccountReset,
  sendAccountMail,
} from "@razzia/socket/services/account-mail"
import { requireManager } from "@razzia/socket/api/middleware"
import {
  getAccount,
  ensureAccountStorage,
} from "@razzia/socket/services/account-directory"
import { setCookie } from "hono/cookie"
import { Hono } from "hono"
import { z } from "zod"

const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(128),
})
const emailOnly = credentials.pick({ email: true })
const codeBody = emailOnly.extend({ code: z.string().regex(/^\d{6}$/u) })
const verifyBody = credentials.extend({ code: z.string().regex(/^\d{6}$/u) })
const passwordReset = codeBody.extend({ password: z.string().min(12).max(128) })
const commonCookie = {
  path: "/media",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
}

export const accounts = new Hono()
  .use("*", async (c, next) => {
    if (!accountsEnabled()) return c.json({ error: "accounts-disabled" }, 404)
    checkAccountConfiguration()
    await next()
  })
  .post("/register", zValidator("json", credentials), async (c) => {
    if (!limitAction("registration:global", 1000, 86400000))
      return c.json({ error: "too-many-requests" }, 429)
    const { email, password } = c.req.valid("json")
    const user = await registerAccount(email, password)
    if (!user.verified) await sendAccountMail(user, "verify")
    return c.json({ status: "check_email" }, 202)
  })
  .post("/verify", zValidator("json", verifyBody), async (c) => {
    const { email, code, password } = c.req.valid("json")
    if (!limitAction("verify:" + email, 40, 3600000))
      return c.json({ error: "too-many-requests" }, 429)
    if (!(await verifyRegistrationPassword(email, password)))
      return c.json({ error: "invalid-credentials" }, 400)
    const user = consumeCode(email, "verify", code)
    if (!user) return c.json({ error: "invalid-or-expired-code" }, 400)
    ensureAccountStorage(user.id)
    return c.json({ status: "verified" })
  })
  .post("/resend", zValidator("json", emailOnly), async (c) => {
    const { email } = c.req.valid("json")
    const user = accountForEmail(email)
    if (user && !user.verified) await sendAccountMail(user, "verify")
    return c.json({ status: "check_email" }, 202)
  })
  .post("/login", zValidator("json", credentials), async (c) => {
    if (!limitAction("login:global", 10000, 3600000))
      return c.json({ error: "too-many-requests" }, 429)
    const { email, password } = c.req.valid("json")
    const user = await authenticate(email, password)
    if (!user) return c.json({ error: "invalid-credentials" }, 401)
    const session = await mintToken(user.id, SESSION_ROLES.MANAGER)
    setCookie(c, "tdz_media_auth", session.token, {
      ...commonCookie,
      maxAge: 12 * 60 * 60,
    })
    return c.json({ ...session, email: user.email })
  })
  .post("/forgot", zValidator("json", emailOnly), async (c) => {
    await requestAccountReset(c.req.valid("json").email)
    return c.json({ status: "check_email" }, 202)
  })
  .post("/reset", zValidator("json", passwordReset), async (c) => {
    const { email, code, password } = c.req.valid("json")
    const ok = await resetPassword(email, code, password)
    if (!ok) return c.json({ error: "invalid-or-expired-code" }, 400)
    return c.json({ status: "password_updated" })
  })
  .get("/me", requireManager, (c) => {
    const account = getAccount(c.get("claims").sub)
    if (!account) return c.json({ error: "unauthorized" }, 401)
    return c.json(account)
  })
