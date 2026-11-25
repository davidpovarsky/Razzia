import { createHmac, timingSafeEqual } from "node:crypto"
import { BillingError } from "../errors"

// oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
export function verifyPaddleSignature(
  raw: string,
  header: string | undefined,
  secret: string,
  now = Date.now(),
) {
  if (!secret || !header || header.length > 2048) {
    throw new BillingError("signature", 401)
  }

  const parts = header.split(";").map((p): [string, string | undefined] => {
    const [key, value] = p.trim().split("=")

    return [key, value]
  })
  const timestamps = parts
    .filter(([key]) => key === "ts")
    .map(([, value]) => value)
  const timestamp = timestamps.at(0)

  if (
    timestamps.length !== 1 ||
    !/^\d+$/u.test(timestamp ?? "") ||
    Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 5
  ) {
    throw new BillingError("signature", 401)
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}:${raw}`)
    .digest()
  const valid = parts
    .filter(([key]) => key === "h1")
    .some(
      ([, signature]) =>
        typeof signature === "string" &&
        /^[a-f0-9]{64}$/iu.test(signature) &&
        timingSafeEqual(expected, Buffer.from(signature, "hex")),
    )

  if (!valid) {
    throw new BillingError("signature", 401)
  }
}
