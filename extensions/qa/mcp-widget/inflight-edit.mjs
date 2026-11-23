import { createServer } from "node:http"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { chromium, webkit } from "../../node_modules/@playwright/test/index.mjs"

const baseline = process.argv.includes("--baseline")
const name = baseline ? "before" : "after"
const rawEvidence = process.env.TADAZZ_WIDGET_EVIDENCE
const getEvidenceLocation = () => {
  if (rawEvidence) {
    if (rawEvidence.startsWith("file://")) {
      return new URL(
        rawEvidence.endsWith("/") ? rawEvidence : `${rawEvidence}/`,
      )
    }

    return new URL(
      pathToFileURL(resolve(rawEvidence)).href.replace(/\/?$/u, "/"),
    )
  }

  return new URL(
    "../../../docs/extensions/qa-evidence/mcp-widget-20261115/inflight-edit-20261116/",
    import.meta.url,
  )
}

const evidence = getEvidenceLocation()
const dist = new URL("../../src/mcp-app/widget/dist/", import.meta.url)
const html = await readFile(new URL("widget.html", dist))
const host = await readFile(new URL("host.js", dist))
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")

if (baseline) {
  assert.equal(
    digest(html),
    "f0ab3172c98c9e602c7a3ea01dc02bf14da5bdc822d58692e0a7390195135e4d",
  )
}

await mkdir(evidence, { recursive: true })
const report = {
  artifactSha256: digest(html),
  hostSha256: digest(host),
  scope:
    "Actual Edge / opaque iframe / AppSDK; existing synthetic host draft handlers only",
  cases: [],
  errors: [],
  external: [],
}
const server = createServer((request, response) => {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; object-src 'none'",
  )
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("Cache-Control", "no-store")

  if (request.method !== "GET") {
    response.writeHead(405).end()

    return
  }

  const resources = new Map([
    [
      "/host.html",
      [
        "text/html",
        '<!doctype html><html><body><script src="/host.js"></script></body></html>',
      ],
    ],
    ["/host.js", ["text/javascript", host]],
    ["/widget.html", ["text/html", html]],
  ])
  const resource = resources.get(request.url)

  if (resource) {
    response.setHeader("Content-Type", resource[0])
    response.end(resource[1])

    return
  }

  response.writeHead(request.url === "/favicon.ico" ? 204 : 404).end()
})
let browser = null

try {
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()

  assert.ok(address && typeof address !== "string")
  const origin = `http://127.0.0.1:${address.port}`
  const engine =
    process.env.TADAZZ_WIDGET_BROWSER === "webkit" ? webkit : chromium
  const useMsedge =
    engine === chromium &&
    process.platform === "win32" &&
    process.env.TADAZZ_WIDGET_CHROMIUM !== "bundled"
  browser = await engine.launch({
    ...(useMsedge ? { channel: "msedge" } : {}),
    headless: true,
  })
  report.browser = browser.version()
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
  page.setDefaultTimeout(10_000)
  page.on("pageerror", (error) => {
    report.errors.push(error.message)
  })
  await page.route("**/*", (route) => {
    const url = route.request().url()

    if (url.startsWith(`${origin}/`) || url.startsWith("data:")) {
      return route.continue()
    }

    report.external.push(url)

    return route.abort()
  })
  const open = async () => {
    await page.goto(`${origin}/host.html`)
    await page.locator("html[data-host-ready=true]").waitFor()
    const frame = page.frameLocator("iframe")
    await frame
      .getByRole("button", { name: "Refresh draft", exact: true })
      .click()
    await frame.getByLabel("Draft title", { exact: true }).waitFor()

    return frame
  }
  const submit = async (frame) => {
    await frame.getByLabel("Draft title", { exact: true }).fill("ACK title A")
    await page.evaluate(() => {
      window.__host.delay(0)
      window.__host.holdUpdates(true)
    })
    await frame
      .getByRole("button", { name: "Apply draft edit", exact: true })
      .click()
    await frame
      .getByTestId("widget-status")
      .filter({ hasText: "Loading" })
      .waitFor()
  }
  const ack = async (frame, revision) => {
    await page.evaluate(() => window.__host.holdUpdates(false))
    await frame
      .getByTestId("widget-status")
      .filter({ hasText: `Revision ${revision}` })
      .waitFor()
    await frame
      .getByLabel("Draft title", { exact: true })
      .evaluate(() => new Promise(requestAnimationFrame))
  }
  const run = async (title, action) => {
    const entry = { name: title, status: "NOT_RUN" }
    report.cases.push(entry)

    try {
      await action(entry)
      entry.status = "PASS"
    } catch (error) {
      entry.status = "FAIL"
      entry.failure = String(error)
      process.exitCode = 1
    }
  }
  await run(
    "Manager reproduction: later edit survives ACK and retains its original base",
    async (entry) => {
      const frame = await open()
      await submit(frame)
      const input = frame.getByLabel("Draft title", { exact: true })
      assert.equal(await input.isEnabled(), true)
      await input.fill("UNSENT title B")
      entry.revisionBeforeAck = await page.evaluate(() =>
        window.__host.revision(),
      )
      assert.equal(
        entry.revisionBeforeAck,
        1,
        "The later edit must precede the ACK",
      )
      await ack(frame, 2)
      entry.afterAck = await input.inputValue()
      entry.calls = await page.evaluate(() => window.__host.calls())
      await page.screenshot({
        path: new URL(`${name}-inflight.png`, evidence).pathname.replace(
          /^\/([A-Z]:)/u,
          "$1",
        ),
      })
      assert.equal(entry.afterAck, "UNSENT title B")
      await frame.getByText("Unsubmitted edit", { exact: true }).waitFor()
      assert.equal(
        await frame
          .getByRole("button", { name: "Apply draft edit", exact: true })
          .isDisabled(),
        true,
      )
      await frame
        .getByRole("alert")
        .filter({ hasText: "changed elsewhere" })
        .waitFor()
      assert.deepEqual(entry.calls, ["get_game_draft", "update_game_draft"])
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Revision 2" })
        .waitFor()
      assert.equal(await input.inputValue(), "UNSENT title B")
      assert.equal(
        await frame
          .getByRole("button", { name: "Apply draft edit", exact: true })
          .isDisabled(),
        true,
      )
      await frame
        .getByRole("button", { name: "Reset to latest draft", exact: true })
        .click()
      assert.equal(await input.inputValue(), "ACK title A")
      await input.fill("Intentional title C")
      await frame
        .getByRole("button", { name: "Apply draft edit", exact: true })
        .click()
      await ack(frame, 3)
      await frame
        .getByRole("button", { name: "Undo acknowledged edit", exact: true })
        .click()
      await ack(frame, 4)
      assert.equal(await input.inputValue(), "ACK title A")
    },
  )

  if (!baseline) {
    await run(
      "Unchanged submitted edit clears dirty only after its own ACK",
      async () => {
        const frame = await open()
        await submit(frame)
        await ack(frame, 2)
        assert.equal(
          await frame.getByLabel("Draft title", { exact: true }).inputValue(),
          "ACK title A",
        )
        assert.equal(
          await frame.getByText("Unsubmitted edit", { exact: true }).count(),
          0,
        )
        assert.equal(
          await frame
            .getByRole("button", {
              name: "Undo acknowledged edit",
              exact: true,
            })
            .isEnabled(),
          true,
        )
      },
    )
    await run(
      "Reset then new edit during the write is not cleared by the earlier ACK",
      async () => {
        const frame = await open()
        await submit(frame)
        await frame
          .getByRole("button", { name: "Reset to latest draft", exact: true })
          .click()
        await frame
          .getByLabel("Draft title", { exact: true })
          .fill("UNSENT after reset")
        await ack(frame, 2)
        assert.equal(
          await frame.getByLabel("Draft title", { exact: true }).inputValue(),
          "UNSENT after reset",
        )
        await frame.getByText("Unsubmitted edit", { exact: true }).waitFor()
        assert.equal(
          await frame
            .getByRole("button", { name: "Apply draft edit", exact: true })
            .isDisabled(),
          true,
        )
      },
    )
    await run(
      "Undo ACK preserves an edit made while undo was pending",
      async () => {
        const frame = await open()
        await submit(frame)
        await ack(frame, 2)
        await page.evaluate(() => window.__host.holdUpdates(true))
        await frame
          .getByRole("button", { name: "Undo acknowledged edit", exact: true })
          .click()
        await frame
          .getByTestId("widget-status")
          .filter({ hasText: "Loading" })
          .waitFor()
        await frame
          .getByLabel("Draft title", { exact: true })
          .fill("UNSENT during undo")
        await ack(frame, 3)
        assert.equal(
          await frame.getByLabel("Draft title", { exact: true }).inputValue(),
          "UNSENT during undo",
        )
        await frame.getByText("Unsubmitted edit", { exact: true }).waitFor()
        assert.equal(
          await frame
            .getByRole("button", { name: "Apply draft edit", exact: true })
            .isDisabled(),
          true,
        )
      },
    )
    await run(
      "Cancellation and refresh preserve a later local edit without rebasing it",
      async () => {
        const frame = await open()
        await submit(frame)
        await frame
          .getByLabel("Draft title", { exact: true })
          .fill("UNSENT after cancel")
        await frame.getByRole("button", { name: "Cancel", exact: true }).click()
        await page.evaluate(() => window.__host.holdUpdates(false))
        await page.waitForFunction(() => window.__host.revision() === 2)
        await frame
          .getByTestId("widget-status")
          .filter({ hasText: "Cancelled" })
          .waitFor()
        assert.equal(
          await frame.getByLabel("Draft title", { exact: true }).inputValue(),
          "UNSENT after cancel",
        )
        await frame
          .getByRole("button", { name: "Refresh draft", exact: true })
          .click()
        await frame
          .getByTestId("widget-status")
          .filter({ hasText: "Revision 2" })
          .waitFor()
        assert.equal(
          await frame
            .getByRole("button", { name: "Apply draft edit", exact: true })
            .isDisabled(),
          true,
        )
        assert.equal(
          await frame.getByLabel("Draft title", { exact: true }).inputValue(),
          "UNSENT after cancel",
        )
      },
    )
  }

  await run("No page errors or external requests", () => {
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.external, [])
  })
} finally {
  await browser?.close()
  await new Promise((resolve) => {
    server.close(resolve)
  })
  report.ownBrowserAndLoopbackClosed = true
  await writeFile(
    new URL(`${name}-results.json`, evidence),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify(report))
}
