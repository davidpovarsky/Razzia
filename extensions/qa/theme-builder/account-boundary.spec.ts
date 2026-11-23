import playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import type * as Playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import { writeFile } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import { builderDocumentFixture } from "../../src/components/theme-builder/document.fixture"
import {
  builderDigest,
  parseBuilderDocument,
  type BuilderDocument,
} from "../../src/components/theme-builder/document"
const { test, expect } = playwright as unknown as typeof Playwright

function isRawBoundaryDocument(value: unknown): value is BuilderDocument {
  return isDeepStrictEqual(parseBuilderDocument(value), value)
}

function requireBoundaryDocument(value: unknown): BuilderDocument {
  if (typeof value !== "object" || value === null || !("document" in value)) {
    throw new Error("qa:invalid-builder-body")
  }

  const { document } = value

  if (!isRawBoundaryDocument(document)) {
    throw new Error("qa:transformed-builder-document")
  }

  return document
}

const receipt = (tenant: string) => {
  const document = builderDocumentFixture()
  document.id = `private-${tenant}`
  document.name = `Private ${tenant}`

  return { document, revision: 1, digest: builderDigest(document) }
}
const deferred = () => {
  let resolve: () => void = () => {
    throw new Error(
      "Promise resolver resolve was used before executor initialization",
    )
  }

  const promise = new Promise<void>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

for (const mode of ["edited", "reading", "saving"] as const) {
  test(`account switch isolates ${mode} draft and late response`, async ({
    page,
  }, info) => {
    const errors: string[] = [],
      requests: Array<{ method: string; path: string; body: unknown }> = []
    const gate = deferred(),
      entered = deferred()
    let blockWorkspace = false
    const workspace = deferred()
    page.on("pageerror", (error) => errors.push(error.message))
    await page.route("**/api/themes/workspaces", async (route) => {
      if (blockWorkspace) {
        await workspace.promise
      }

      await route
        .fulfill({
          json: {
            workspaces: { "tenant-a": ["author"], "tenant-b": ["author"] },
          },
        })
        .catch(() => {})
    })
    await page.route("**/api/themes/builder/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname
      requests.push({
        method: request.method(),
        path,
        body: request.postDataJSON(),
      })
      const tenant = path.includes("/tenant-a/") ? "tenant-a" : "tenant-b"

      if (path.endsWith("/documents")) {
        await route.fulfill({
          json: {
            documents: [
              {
                id: `private-${tenant}`,
                name: `Private ${tenant}`,
                revision: 1,
              },
            ],
          },
        })

        return
      }

      const blocked =
        tenant === "tenant-a" &&
        (mode === "reading" ||
          (mode === "saving" && request.method() === "PUT"))

      if (blocked) {
        entered.resolve()
        await gate.promise
      }

      const value =
        request.method() === "PUT"
          ? {
              document: requireBoundaryDocument(request.postDataJSON()),
              revision: 2,
              digest: builderDigest(
                requireBoundaryDocument(request.postDataJSON()),
              ),
            }
          : receipt(tenant)
      await route.fulfill({ json: value }).catch(() => {})
    })
    await page.goto("/")
    const select = page.getByRole("combobox", { name: "Screens", exact: true })
    await expect(select).toBeEnabled()
    await select.selectOption("private-tenant-a")
    const name = page
      .getByRole("textbox", { name: "Theme name", exact: true })
      .last()

    if (mode !== "reading") {
      await expect(name).toHaveValue("Private tenant-a")
      await name.fill("Private tenant-a edited")

      if (mode === "saving") {
        await page
          .getByRole("button", { name: "Save draft", exact: true })
          .click()
      }
    }

    if (mode !== "edited") {
      await entered.promise
    }

    blockWorkspace = true
    await page.evaluate(() => window.__qaBoundary.account("tenant-b"))
    // This must hold while the new workspace authority request is still blocked.
    await expect
      .poll(() =>
        page
          .locator("input")
          .evaluateAll((inputs) =>
            inputs
              .map((input) => (input as HTMLInputElement).value)
              .some((value) => value.includes("Private tenant-a")),
          ),
      )
      .toBe(false)
    await expect(select).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeDisabled()
    workspace.resolve()
    await expect(select).toBeEnabled()
    await select.selectOption("private-tenant-b")
    await expect(name).toHaveValue("Private tenant-b")
    gate.resolve()
    await expect(name).toHaveValue("Private tenant-b")
    await expect(
      page.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeDisabled()
    expect(
      requests.some(
        (request) =>
          request.method === "PUT" &&
          request.path.includes("/tenant-b/") &&
          JSON.stringify(request.body).includes("private-tenant-a"),
      ),
    ).toBe(false)
    expect(errors).toEqual([])
    const path = info.outputPath("account-boundary.json")
    await writeFile(
      path,
      JSON.stringify(
        {
          mode,
          requests,
          errors,
          limits:
            "Actual E component, synthetic native token and intercepted API; root login/RBAC/persistence/StrictMode development replay not established.",
        },
        null,
        2,
      ),
    )
    await info.attach("account-boundary.json", {
      path,
      contentType: "application/json",
    })
  })
}
