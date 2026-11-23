import { Input, Textarea } from "@razzia/extensions/platform-ui"
import { useEffect, useRef, useState, type SubmitEvent } from "react"
import { useSiteText } from "../../locales"
import { SiteButton } from "../shared/SiteButton"

export function ContactForm() {
  const t = useSiteText()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [failed, setFailed] = useState(false)
  const sending = useRef(false)
  const request = useRef<{ body: string; id: string } | null>(null)
  const active = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const deadline = window.setTimeout(() => controller.abort(), 8000)
    void fetch("/api/contact/config", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Contact unavailable")
        }

        const data = (await response.json()) as { available?: boolean }
        setAvailable(data.available === true)
      })
      .catch(() => setAvailable(false))
      .finally(() => window.clearTimeout(deadline))

    return () => {
      controller.abort()
      window.clearTimeout(deadline)
      active.current?.abort()
    }
  }, [])

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (sending.current || !available) {
      return
    }

    const form = event.currentTarget
    const data = new FormData(form)
    const field = (name: string) => {
      const value = data.get(name)

      return typeof value === "string" ? value : ""
    }
    const values = {
      eventType: field("eventType").trim(),
      email: field("email").trim().toLowerCase(),
      message: field("message").trim(),
      website: field("website"),
    }
    const body = JSON.stringify(values)

    if (request.current?.body !== body) {
      request.current = { body, id: crypto.randomUUID() }
    }

    const controller = new AbortController()
    active.current = controller
    sending.current = true
    setBusy(true)
    setNotice("")
    setFailed(false)
    const deadline = window.setTimeout(() => controller.abort(), 18_000)

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify({ ...values, requestId: request.current.id }),
      })

      if (!response.ok) {
        setFailed(true)
        setNotice(
          response.status === 429
            ? "Please wait before sending another enquiry."
            : "Your enquiry could not be sent. Your message is still here; please try again.",
        )

        return
      }

      setNotice("Your enquiry has been sent. Thank you for getting in touch.")
      form.reset()
      request.current = null
    } catch {
      setFailed(true)
      setNotice(
        "Your enquiry could not be sent. Your message is still here; please try again.",
      )
    } finally {
      window.clearTimeout(deadline)
      active.current = null
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="site-contact-form"
      aria-busy={busy}
    >
      <Input
        label={t("Event type")}
        name="eventType"
        required
        minLength={2}
        maxLength={160}
        disabled={busy}
        placeholder={t("What are you celebrating or hosting?")}
      />
      <Input
        label={t("Email address")}
        name="email"
        required
        type="email"
        autoComplete="email"
        maxLength={254}
        disabled={busy}
      />
      <Textarea
        label={t("About your event")}
        name="message"
        required
        rows={5}
        maxLength={4000}
        disabled={busy}
      />
      <div hidden aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <SiteButton type="submit" disabled={!available || busy} variant="primary">
        {t(busy ? "Sending…" : "Send enquiry")}
      </SiteButton>
      {available === null && <p role="status">{t("Please wait…")}</p>}
      {available === false && (
        <p role="status" className="note">
          {t(
            "Online enquiries are temporarily unavailable. Please try again later.",
          )}
        </p>
      )}
      {notice && <p role={failed ? "alert" : "status"}>{t(notice)}</p>}
    </form>
  )
}
