import { beforeAll, afterAll, describe, expect, it } from "vitest"
import "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { SESSION_ROLES } from "@razzia/common/constants"
import { getPath } from "./config"
import { withAccount } from "./account-scope"
import {
  registerAccount,
  issueCode,
  consumeCode,
  verifyRegistrationPassword,
  authenticate,
  revokeAccountSession,
  isAccountSessionValid,
  resetPassword,
  activeAccount,
} from "./account-auth"
import { mintToken, verifyToken, verifyIgnoringExpiry } from "./auth"
const dataDir = mkdtempSync(join(tmpdir(), "tadazz-tenant-test-"))
const original = {
  TADAZZ_ACCOUNTS_ENABLED: process.env.TADAZZ_ACCOUNTS_ENABLED,
  CONFIG_PATH: process.env.CONFIG_PATH,
  JWT_SECRET: process.env.JWT_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  TADAZZ_AUTH_EMAIL_FROM: process.env.TADAZZ_AUTH_EMAIL_FROM,
}
beforeAll(() => {
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  process.env.CONFIG_PATH = dataDir
  process.env.JWT_SECRET = `test-local-secret-${"9".repeat(54)}`
  process.env.RESEND_API_KEY = "test-no-network"
  process.env.TADAZZ_AUTH_EMAIL_FROM = "tests@example.invalid"
})
afterAll(() => {
  for (const [key, val] of Object.entries(original)) {
    if (val === undefined) {
      /* oxlint-disable typescript/no-dynamic-delete -- Remove a keyed optional override from its mutable dictionary without replacing object identity. */
      delete process.env[key]
      /* oxlint-enable typescript/no-dynamic-delete */
    } else {
      process.env[key] = val
    }
  }
})
describe("Tadazz account ownership and authentication", () => {
  let a = "",
    b = ""
  it("creates distinct verified accounts, never grants access to unverified users", async () => {
    const first = await registerAccount(
      " ALICE@Example.com ",
      "alice-password-long",
    )
    const second = await registerAccount("bob@example.com", "bob-password-long")
    a = first.id
    b = second.id
    expect(first.email).toBe("alice@example.com")
    expect(first.id).not.toBe(second.id)
    expect(activeAccount(a)).toBeNull()
    expect(await authenticate(first.email, "alice-password-long")).toBeNull()
    expect(
      await verifyRegistrationPassword(first.email, "wrong-password"),
    ).toBe(false)
    const one = issueCode(a, "verify")
    const two = issueCode(b, "verify")
    expect(consumeCode(first.email, "verify", "000000")).toBeNull()
    expect(consumeCode(first.email, "verify", one)?.id).toBe(a)
    expect(consumeCode(second.email, "verify", two)?.id).toBe(b)
    expect(
      await authenticate(first.email, "alice-password-long"),
    ).toMatchObject({
      id: a,
    })
    expect(await authenticate(first.email, "wrong-password")).toBeNull()
  }, 60_000)
  it("physically isolates quiz files by verified account ID", async () => {
    /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
    const fileFor = async (id: string) =>
      withAccount(id, async () => {
        const target = getPath("quizz/private.json")
        mkdirSync(dirname(target), {
          recursive: true,
        })
        writeFileSync(
          target,
          JSON.stringify({
            owner: id,
          }),
        )
        await Promise.resolve()

        return getPath("quizz/private.json")
      })
    /* oxlint-enable require-await, typescript/require-await */
    const first = await fileFor(a)
    const second = await fileFor(b)
    expect(first).not.toBe(second)
    expect(
      (
        JSON.parse(readFileSync(first, "utf8")) as {
          owner: string
        }
      ).owner,
    ).toBe(a)
    expect(
      (
        JSON.parse(readFileSync(second, "utf8")) as {
          owner: string
        }
      ).owner,
    ).toBe(b)
    expect(await withAccount(a, () => getPath("media/private.png"))).not.toBe(
      await withAccount(b, () => getPath("media/private.png")),
    )
  })
  it("mints revocable manager sessions with identity, not room permissions", async () => {
    const session = await mintToken(a, SESSION_ROLES.MANAGER)
    const claims = await verifyToken(session.token)
    expect(claims.sub).toBe(a)
    expect(claims.sid).toBeTruthy()
    expect(isAccountSessionValid(a, claims.sid)).toBe(true)
    expect(isAccountSessionValid(b, claims.sid)).toBe(false)
    revokeAccountSession(claims.sid!)
    await expect(verifyToken(session.token)).rejects.toThrow()
  })
  it("reset with code invalidates previous sessions and changes password", async () => {
    const current = await mintToken(b, SESSION_ROLES.MANAGER)
    const old = await verifyIgnoringExpiry(current.token)
    expect(old.sid).toBeTruthy()
    const code = issueCode(b, "reset")
    expect(
      await resetPassword("bob@example.com", code, "new-secure-password-123"),
    ).toBe(true)
    expect(isAccountSessionValid(b, old.sid)).toBe(false)
    expect(
      await authenticate("bob@example.com", "bob-password-long"),
    ).toBeNull()
    expect(
      await authenticate("bob@example.com", "new-secure-password-123"),
    ).toMatchObject({
      id: b,
    })
  })
})
