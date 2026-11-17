import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  expect,
  test,
  type Page,
  type Response as PwResponse,
} from "@playwright/test"
import { nativeSaveConsentText } from "../../src/components/native-save-consent/strings"
import {
  Client,
  StreamableHTTPClientTransport,
} from "../phase3-mcp-service/mcp-client"
import {
  ALL_MCP_SCOPES,
  buildCreateDraftInput,
  buildDraftShow,
  createPinnedCaFetch,
  createPkcePair,
} from "./crypto-helpers"

interface FixtureMeta {
  readonly origin: string
  readonly port: number
  readonly certPem: string
  readonly configRoot: string
  readonly mailFile: string
}

interface ToolOutcome {
  readonly ok: boolean
  readonly data?: Record<string, unknown>
  readonly error?: {
    readonly code: string
    readonly consentRequestId?: string
    readonly consentUrl?: string
  }
}

const LOCALES = ["en", "fr", "de", "es", "it", "ja", "tr", "vi"] as const

function loadFixtureMeta(): FixtureMeta {
  const runDir = process.env.TADAZZ_QA_RUN_DIR

  if (!runDir) {
    throw new Error(
      "TADAZZ_QA_RUN_DIR is required by native-consent Playwright suite",
    )
  }

  const metaPath = join(runDir, "meta.json")

  if (!existsSync(metaPath)) {
    throw new Error(`Missing Playwright server meta file at ${metaPath}`)
  }

  return JSON.parse(readFileSync(metaPath, "utf8")) as FixtureMeta
}

async function readTrappedCode(options: {
  readonly mailFile: string
  readonly email: string
}): Promise<string> {
  const target = options.email.toLowerCase()

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (existsSync(options.mailFile)) {
      const parsed = JSON.parse(
        readFileSync(options.mailFile, "utf8"),
      ) as Record<string, string>
      const found = parsed[target]

      if (found) {
        return found
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100)
    })
  }

  throw new Error(`Timed out waiting for verification code for ${target}`)
}

async function signupVerifyAndLoginUi(options: {
  readonly page: Page
  readonly mailFile: string
  readonly email: string
  readonly password: string
}): Promise<string> {
  const { page, mailFile, email, password } = options

  await page.goto("/signup")
  await page.getByLabel("Email address", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible()

  const code = await readTrappedCode({ mailFile, email })

  await page.getByLabel("Six-digit code").fill(code)
  await page.getByRole("button", { name: "Verify email", exact: true }).click()
  await expect(
    page.getByText("Email verified. You can now log in.", { exact: true }),
  ).toBeVisible()
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(page).toHaveURL(/\/studio\/?$/u)
  await expect(page.getByText(email, { exact: true })).toBeVisible()

  const token = await page.evaluate(() => localStorage.getItem("token"))

  expect(token).toBeTruthy()

  return token ?? ""
}

async function loginUi(options: {
  readonly page: Page
  readonly email: string
  readonly password: string
}): Promise<void> {
  await options.page.goto("/login")
  await options.page
    .getByLabel("Email address", { exact: true })
    .fill(options.email)
  await options.page
    .getByLabel("Password", { exact: true })
    .fill(options.password)
  await options.page
    .getByRole("button", { name: "Log in", exact: true })
    .click()
  await expect(options.page).toHaveURL(/\/studio\/?$/u)
  await expect(
    options.page.getByText(options.email, { exact: true }),
  ).toBeVisible()
}

async function signupViaApi(options: {
  readonly origin: string
  readonly fetchImpl: typeof globalThis.fetch
  readonly mailFile: string
  readonly email: string
  readonly password: string
}): Promise<void> {
  const regRes = await options.fetchImpl(
    `${options.origin}/api/accounts/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: options.email,
        password: options.password,
      }),
    },
  )

  expect(regRes.status).toBe(202)

  const code = await readTrappedCode({
    mailFile: options.mailFile,
    email: options.email,
  })
  const verifyRes = await options.fetchImpl(
    `${options.origin}/api/accounts/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: options.email,
        password: options.password,
        code,
      }),
    },
  )

  expect(verifyRes.status).toBe(200)
}

async function authorizeBrowserOAuth(options: {
  readonly page: Page
  readonly origin: string
  readonly fetchImpl: typeof globalThis.fetch
}): Promise<{
  readonly accessToken: string
  readonly oauthDocumentHeaders: Record<string, string>
}> {
  const { verifier, challenge } = createPkcePair()
  const state = randomBytes(16).toString("base64url")
  const authorizeUrl = new URL(`${options.origin}/oauth/authorize`)

  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("client_id", "tadazz-chatgpt-client")
  authorizeUrl.searchParams.set(
    "redirect_uri",
    `${options.origin}/oauth/callback`,
  )
  authorizeUrl.searchParams.set("scope", ALL_MCP_SCOPES.join(" "))
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("code_challenge", challenge)
  authorizeUrl.searchParams.set("code_challenge_method", "S256")
  authorizeUrl.searchParams.set("resource", `${options.origin}/mcp`)

  let oauthDocumentHeaders: Record<string, string> = {}
  const captureOAuth = (response: PwResponse) => {
    const req = response.request()

    if (req.resourceType() !== "document") {
      return
    }

    const { pathname } = new URL(response.url())

    if (pathname === "/studio/oauth-consent") {
      oauthDocumentHeaders = response.headers()
    }
  }

  options.page.on("response", captureOAuth)

  try {
    await options.page.goto(authorizeUrl.toString())
    await expect(options.page).toHaveURL(
      /\/studio\/oauth-consent\?oauth_request=/u,
    )

    const headCheck = await options.fetchImpl(options.page.url(), {
      method: "HEAD",
    })

    expect(headCheck.status).toBe(200)
    expect(await headCheck.text()).toBe("")
    assertConsentSecurityHeaders(headCheck.headers)

    await expect(options.page.getByTestId("oauth-client-id")).toBeVisible()
    await options.page
      .getByRole("button", { name: "Allow access", exact: true })
      .click()
    await options.page.waitForURL((url) => url.pathname === "/oauth/callback")
  } finally {
    options.page.off("response", captureOAuth)
  }

  const callbackUrl = new URL(options.page.url())

  expect(callbackUrl.searchParams.get("state")).toBe(state)

  const code = callbackUrl.searchParams.get("code") ?? ""

  expect(code.length).toBeGreaterThan(0)

  const tokenForm = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${options.origin}/oauth/callback`,
    client_id: "tadazz-chatgpt-client",
    code_verifier: verifier,
    resource: `${options.origin}/mcp`,
  })
  const tokenRes = await options.fetchImpl(`${options.origin}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenForm.toString(),
  })

  expect(tokenRes.status).toBe(200)

  const tokenJson = (await tokenRes.json()) as { readonly access_token: string }

  return {
    accessToken: tokenJson.access_token,
    oauthDocumentHeaders,
  }
}

function assertConsentSecurityHeaders(
  headers: Headers | Record<string, string>,
): void {
  const read = (name: string) =>
    headers instanceof Headers ? headers.get(name) : headers[name.toLowerCase()]

  expect(read("x-frame-options")).toBe("DENY")
  expect(read("referrer-policy")).toBe("no-referrer")
  expect(read("cache-control")).toBe("no-store")
  expect(read("content-security-policy") ?? "").toMatch(
    /frame-ancestors\s+'none'/u,
  )
}

async function connectMcpSession(options: {
  readonly origin: string
  readonly accessToken: string
  readonly fetchImpl: typeof globalThis.fetch
}) {
  const client = new Client({
    name: "phase3-playwright-client",
    version: "1.0.0",
  })
  const transport = new StreamableHTTPClientTransport(
    new URL(`${options.origin}/mcp`),
    {
      authProvider: { token: () => Promise.resolve(options.accessToken) },
      fetch: options.fetchImpl,
    },
  )

  await client.connect(transport)

  return { client, transport }
}

test.describe("phase 3 native consent Studio integration", () => {
  test("authenticated browser flow -> OAuth consent -> MCP draft -> native save consent -> retry -> Studio & editor reopen", async ({
    browser,
    page,
  }, testInfo) => {
    const meta = loadFixtureMeta()
    const tlsFetch = createPinnedCaFetch(meta.certPem)
    const tag = `${testInfo.project.name}-${randomBytes(4).toString("hex")}`
    const emailA = `alice-pw-${tag}@example.invalid`
    const emailB = `bob-pw-${tag}@example.invalid`
    const password = "Passphrase-Playwright-1234"
    const showTitle = `Playwright Show ${tag}`
    const nativeTokenA = await signupVerifyAndLoginUi({
      page,
      mailFile: meta.mailFile,
      email: emailA,
      password,
    })

    await signupViaApi({
      origin: meta.origin,
      fetchImpl: tlsFetch,
      mailFile: meta.mailFile,
      email: emailB,
      password,
    })

    const { accessToken: mcpTokenA, oauthDocumentHeaders } =
      await authorizeBrowserOAuth({
        page,
        origin: meta.origin,
        fetchImpl: tlsFetch,
      })

    assertConsentSecurityHeaders(oauthDocumentHeaders)
    expect(mcpTokenA).not.toBe(nativeTokenA)

    const mcp = await connectMcpSession({
      origin: meta.origin,
      accessToken: mcpTokenA,
      fetchImpl: tlsFetch,
    })

    try {
      const draft = (
        await mcp.client.callTool({
          name: "create_game_draft",
          arguments: buildCreateDraftInput(showTitle),
        })
      ).structuredContent as ToolOutcome

      expect(draft.ok).toBe(true)

      const draftId = draft.data?.draftId as string
      const saveKey = randomBytes(18).toString("base64url")
      const challenge = (
        await mcp.client.callTool({
          name: "save_game",
          arguments: {
            contractVersion: "0.1.0",
            draftId,
            expectedRevision: 1,
            intent: "createNew",
            idempotencyKey: saveKey,
          },
        })
      ).structuredContent as ToolOutcome

      expect(challenge.ok).toBe(false)
      expect(challenge.error?.code).toBe("CONSENT_REQUIRED")
      expect(JSON.stringify(challenge)).not.toContain(nativeTokenA)

      const consentUrl = challenge.error?.consentUrl ?? ""
      const requestId = challenge.error?.consentRequestId ?? ""

      expect(requestId).toHaveLength(54)
      expect(consentUrl).toBe(
        `${meta.origin}/studio/native-save-consent/${requestId}`,
      )

      let gamesDocHeaders: Record<string, string> = {}
      let nativeConsentDocHeaders: Record<string, string> = {}
      let editorDocHeaders: Record<string, string> = {}
      const trackDocs = (response: PwResponse) => {
        if (response.request().resourceType() !== "document") {
          return
        }

        const path = new URL(response.url()).pathname

        if (path === "/studio/games") {
          gamesDocHeaders = response.headers()
        } else if (path === `/studio/native-save-consent/${requestId}`) {
          nativeConsentDocHeaders = response.headers()
        } else if (path.startsWith("/manager/quizz/")) {
          editorDocHeaders = response.headers()
        }
      }

      page.on("response", trackDocs)

      try {
        await page.goto("/studio/games")
        expect(gamesDocHeaders["x-frame-options"]).toBeUndefined()
        expect(gamesDocHeaders["cache-control"]).toBeUndefined()
        await expect(page.getByText(showTitle)).toHaveCount(0)

        const headConsent = await tlsFetch(consentUrl, { method: "HEAD" })

        expect(headConsent.status).toBe(200)
        expect(await headConsent.text()).toBe("")
        assertConsentSecurityHeaders(headConsent.headers)

        await page.goto(consentUrl)
        assertConsentSecurityHeaders(nativeConsentDocHeaders)

        await expect(page.getByTestId("native-save-account")).toContainText(
          emailA,
        )
        await expect(page.getByTestId("native-save-revision")).toContainText(
          "1",
        )
        await expect(page.getByTestId("native-save-summary")).toContainText(
          showTitle,
        )

        const locationSnapshot = await page.evaluate(() => ({
          search: window.location.search,
          hash: window.location.hash,
        }))

        expect(locationSnapshot).toEqual({ search: "", hash: "" })

        const approveButton = page.getByRole("button", {
          name: "Approve this revision",
          exact: true,
        })

        // Untrusted synthetic DOM click must be ignored by NativeSaveConsentPage.
        await approveButton.evaluate((button) => {
          ;(button as HTMLButtonElement).click()
        })
        await expect(approveButton).toBeVisible()
        await expect(
          page.getByRole("status").filter({
            hasText:
              "Approval recorded. Return to the connected application to finish saving.",
          }),
        ).toHaveCount(0)

        await approveButton.click()
        await expect(
          page.getByRole("status").filter({
            hasText:
              "Approval recorded. Return to the connected application to finish saving.",
          }),
        ).toBeVisible()

        // Browser approval alone never creates a game before MCP retry.
        await page.goto("/studio/games")
        await expect(page.getByText(showTitle)).toHaveCount(0)

        const retried = (
          await mcp.client.callTool({
            name: "save_game",
            arguments: {
              contractVersion: "0.1.0",
              draftId,
              expectedRevision: 1,
              intent: "createNew",
              idempotencyKey: saveKey,
            },
          })
        ).structuredContent as ToolOutcome

        expect(retried.ok).toBe(true)
        expect(JSON.stringify(retried)).not.toContain(nativeTokenA)

        const quizId = retried.data?.quizId as string

        expect(quizId).toMatch(/^[A-Za-z0-9_-]{21}$/u)

        await page.goto("/studio/games")
        await expect(page.getByText(showTitle)).toBeVisible()
        await page.goto(`/manager/quizz/${quizId}`)
        expect(editorDocHeaders["x-frame-options"]).toBeUndefined()
        expect(editorDocHeaders["cache-control"]).toBeUndefined()
        await expect(page.getByTestId("editor-save-btn")).toBeVisible()

        const contextB = await browser.newContext({ ignoreHTTPSErrors: true })

        try {
          const pageB = await contextB.newPage()

          await loginUi({ page: pageB, email: emailB, password })
          await pageB.goto("/studio/games")
          await expect(pageB.getByText(showTitle)).toHaveCount(0)
          await pageB.goto(`/manager/quizz/${quizId}`)
          await expect(pageB.getByText(showTitle)).toHaveCount(0)
        } finally {
          await contextB.close()
        }
      } finally {
        page.off("response", trackDocs)
      }
    } finally {
      await mcp.transport.close()
    }
  })

  test("fail-closed negative cases: B consent denial, framing block, URL tamper, cancel, cross-tab switch, draft drift", async ({
    browser,
    page,
  }, testInfo) => {
    const meta = loadFixtureMeta()
    const tlsFetch = createPinnedCaFetch(meta.certPem)
    const tag = `${testInfo.project.name}-${randomBytes(4).toString("hex")}`
    const emailA = `alice-neg-${tag}@example.invalid`
    const emailB = `bob-neg-${tag}@example.invalid`
    const password = "Passphrase-Negative-1234"
    const title = `Negative Show ${tag}`

    await signupVerifyAndLoginUi({
      page,
      mailFile: meta.mailFile,
      email: emailA,
      password,
    })
    await signupViaApi({
      origin: meta.origin,
      fetchImpl: tlsFetch,
      mailFile: meta.mailFile,
      email: emailB,
      password,
    })

    const { accessToken: mcpTokenA } = await authorizeBrowserOAuth({
      page,
      origin: meta.origin,
      fetchImpl: tlsFetch,
    })
    const mcp = await connectMcpSession({
      origin: meta.origin,
      accessToken: mcpTokenA,
      fetchImpl: tlsFetch,
    })

    try {
      const draft = (
        await mcp.client.callTool({
          name: "create_game_draft",
          arguments: buildCreateDraftInput(title),
        })
      ).structuredContent as ToolOutcome
      const draftId = draft.data?.draftId as string
      const saveKey = randomBytes(18).toString("base64url")
      const challenge = (
        await mcp.client.callTool({
          name: "save_game",
          arguments: {
            contractVersion: "0.1.0",
            draftId,
            expectedRevision: 1,
            intent: "createNew",
            idempotencyKey: saveKey,
          },
        })
      ).structuredContent as ToolOutcome
      const consentUrl = challenge.error?.consentUrl ?? ""

      expect(consentUrl).toContain("/studio/native-save-consent/")

      const contextB = await browser.newContext({ ignoreHTTPSErrors: true })

      try {
        const pageB = await contextB.newPage()

        await loginUi({ page: pageB, email: emailB, password })
        const deniedInspection = pageB.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/oauth/native-save/inspect" &&
            response.request().method() === "POST",
        )
        await pageB.goto(consentUrl)
        const denied = await deniedInspection
        expect(denied.status()).toBe(503)
        const denial: unknown = await denied.json()
        expect(denial).toMatchObject({
          ok: false,
          error: { code: "DEPENDENCY_UNAVAILABLE" },
        })
        expect(JSON.stringify(denial)).not.toContain(title)
        await expect(pageB.getByRole("alert")).toHaveText(
          "This revision could not be approved. Reopen the save request.",
        )
        await expect(
          pageB.getByRole("button", {
            name: "Approve this revision",
            exact: true,
          }),
        ).toBeDisabled()
        await expect(pageB.getByTestId("native-save-snapshot")).toHaveCount(0)
        await expect(pageB.getByText(title)).toHaveCount(0)
      } finally {
        await contextB.close()
      }

      // Framing an approval route must stay blocked by CSP frame-ancestors 'none' and XFO DENY.
      await page.goto("/studio/games")
      await page.evaluate((targetUrl) => {
        const frame = document.createElement("iframe")

        frame.id = "blocked-consent-frame"
        frame.src = targetUrl
        document.body.appendChild(frame)
      }, consentUrl)
      await page.waitForTimeout(500)

      const frameAccessibleText = await page.evaluate(() => {
        const frame = document.getElementById(
          "blocked-consent-frame",
        ) as HTMLIFrameElement | null

        try {
          return frame?.contentDocument?.body.innerText ?? ""
        } catch {
          return ""
        }
      })

      expect(frameAccessibleText).not.toContain("Approve this revision")

      for (const badUrl of [
        `${consentUrl}?tamper=1`,
        `${consentUrl}#fragment`,
        `${meta.origin}/studio/native-save-consent/invalid-short-id`,
      ]) {
        await page.goto(badUrl)
        await expect(
          page.getByText("Save approval is unavailable on this page."),
        ).toBeVisible()
      }

      await page.goto(consentUrl)
      await expect(
        page.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeVisible()
      await page.getByRole("button", { name: "Cancel", exact: true }).click()
      await expect(page.getByText("Review canceled.")).toBeVisible()

      const afterCancel = (
        await mcp.client.callTool({
          name: "save_game",
          arguments: {
            contractVersion: "0.1.0",
            draftId,
            expectedRevision: 1,
            intent: "createNew",
            idempotencyKey: saveKey,
          },
        })
      ).structuredContent as ToolOutcome

      expect(afterCancel.ok).toBe(false)
      expect(afterCancel.error?.code).toBe("CONSENT_REQUIRED")

      // Cross-tab session swap must prevent stale consent approval from succeeding.
      await page.goto(consentUrl)

      const approveBtn = page.getByRole("button", {
        name: "Approve this revision",
        exact: true,
      })

      await expect(approveBtn).toBeVisible()

      const tabB = await page.context().newPage()

      try {
        await loginUi({ page: tabB, email: emailB, password })
      } finally {
        await tabB.close()
      }

      await page.bringToFront()
      await approveBtn.click({ timeout: 2_000 }).catch(() => undefined)
      await expect(
        page.getByRole("status").filter({
          hasText:
            "Approval recorded. Return to the connected application to finish saving.",
        }),
      ).toHaveCount(0)

      const afterCrossTab = (
        await mcp.client.callTool({
          name: "save_game",
          arguments: {
            contractVersion: "0.1.0",
            draftId,
            expectedRevision: 1,
            intent: "createNew",
            idempotencyKey: saveKey,
          },
        })
      ).structuredContent as ToolOutcome

      expect(afterCrossTab.ok).toBe(false)
      expect(afterCrossTab.error?.code).toBe("CONSENT_REQUIRED")

      // Log back in as Account A, approve revision 1, then edit to revision 2 before MCP retry.
      await loginUi({ page, email: emailA, password })
      await page.goto(consentUrl)
      await page
        .getByRole("button", { name: "Approve this revision", exact: true })
        .click()
      await expect(
        page.getByRole("status").filter({
          hasText:
            "Approval recorded. Return to the connected application to finish saving.",
        }),
      ).toBeVisible()

      const edited = (
        await mcp.client.callTool({
          name: "update_game_draft",
          arguments: {
            contractVersion: "0.1.0",
            draftId,
            expectedRevision: 1,
            authoredShowJson: JSON.stringify(buildDraftShow(`Edited ${tag}`)),
            idempotencyKey: randomBytes(18).toString("base64url"),
          },
        })
      ).structuredContent as ToolOutcome

      expect(edited.ok).toBe(true)

      const staleRetry = (
        await mcp.client.callTool({
          name: "save_game",
          arguments: {
            contractVersion: "0.1.0",
            draftId,
            expectedRevision: 1,
            intent: "createNew",
            idempotencyKey: saveKey,
          },
        })
      ).structuredContent as ToolOutcome

      expect(staleRetry.ok).toBe(false)
      expect(staleRetry.error?.code).toBe("REVISION_CONFLICT")
    } finally {
      await mcp.transport.close()
    }
  })

  test("renders native-save consent page across all 8 locales", async ({
    page,
  }, testInfo) => {
    const meta = loadFixtureMeta()
    const tlsFetch = createPinnedCaFetch(meta.certPem)
    const tag = `${testInfo.project.name}-${randomBytes(4).toString("hex")}`
    const email = `alice-i18n-${tag}@example.invalid`
    const password = "Passphrase-Locales-1234"

    await signupVerifyAndLoginUi({
      page,
      mailFile: meta.mailFile,
      email,
      password,
    })

    const { accessToken } = await authorizeBrowserOAuth({
      page,
      origin: meta.origin,
      fetchImpl: tlsFetch,
    })
    const mcp = await connectMcpSession({
      origin: meta.origin,
      accessToken,
      fetchImpl: tlsFetch,
    })

    try {
      const draft = (
        await mcp.client.callTool({
          name: "create_game_draft",
          arguments: buildCreateDraftInput(`Locale Show ${tag}`),
        })
      ).structuredContent as ToolOutcome
      const challenge = (
        await mcp.client.callTool({
          name: "save_game",
          arguments: {
            contractVersion: "0.1.0",
            draftId: draft.data?.draftId,
            expectedRevision: 1,
            intent: "createNew",
            idempotencyKey: randomBytes(18).toString("base64url"),
          },
        })
      ).structuredContent as ToolOutcome
      const consentUrl = challenge.error?.consentUrl ?? ""

      for (const locale of LOCALES) {
        const expected = nativeSaveConsentText(locale)

        await page.evaluate((lng) => {
          localStorage.setItem("i18nextLng", lng)
        }, locale)
        await page.goto(consentUrl)
        await expect(
          page.getByRole("heading", { name: expected("title"), exact: true }),
        ).toBeVisible()
        await expect(
          page.getByRole("button", { name: expected("allow"), exact: true }),
        ).toBeVisible()
      }
    } finally {
      await mcp.transport.close()
    }
  })
})
