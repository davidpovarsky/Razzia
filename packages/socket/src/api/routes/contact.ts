import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import {
  ContactError,
  contactMailAvailable,
  contactRequestSchema,
  sendContactMail,
} from "@razzia/socket/services/contact-mail"

function allowedOrigin(origin: string | undefined, requestUrl: string) {
  if (!origin) {
    return false
  }

  try {
    const expected = new URL(
      process.env.TADAZZ_PUBLIC_ORIGIN ||
        (process.env.NODE_ENV === "production"
          ? "https://tadazz.com"
          : requestUrl),
    ).origin

    return new URL(origin).origin === expected
  } catch {
    return false
  }
}

export const contact = new Hono()
  .use("*", bodyLimit({ maxSize: 24_000 }))
  .use("*", async (c, next) => {
    c.header("Cache-Control", "no-store")
    await next()
  })
  .get("/config", (c) => c.json({ available: contactMailAvailable() }))
  .post("/", async (c) => {
    if (!allowedOrigin(c.req.header("Origin"), c.req.url)) {
      return c.json({ error: "contact-origin-invalid" }, 403)
    }

    if (!c.req.header("Content-Type")?.startsWith("application/json")) {
      return c.json({ error: "contact-invalid-request" }, 415)
    }

    const parsed = contactRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    )

    if (!parsed.success) {
      return c.json({ error: "contact-invalid-request" }, 400)
    }

    try {
      await sendContactMail(parsed.data)

      // Accepted by the provider; this does not assert inbox delivery.
      return c.json({ status: "accepted" }, 202)
    } catch (error) {
      if (error instanceof ContactError) {
        return c.json({ error: error.message }, error.status)
      }

      return c.json({ error: "contact-unavailable" }, 503)
    }
  })
