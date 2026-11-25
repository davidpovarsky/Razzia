import fs from "node:fs"
import path from "node:path"
import { expect, vi } from "vitest"
import {
  createCreationFixture,
  creationExtras,
  creationInput,
  creationTree,
  removeCreationFixture,
} from "./creation-fixture"
import { retainCreationReceipt } from "./creation-process"

/**
 * Caller supplies the actual production API and native token minter. No mock
 * Hono app, customer account, credentials, network listener or external auth.
 */

export async function assertCreationPrivateHttpErrors(
  request: (url: string, init: RequestInit) => Promise<Response>,
  mintManager: () => Promise<{ token: string }>,
) {
  const priorConfig = process.env.CONFIG_PATH,
    priorAccounts = process.env.TADAZZ_ACCOUNTS_ENABLED
  const receipts: unknown[] = []

  try {
    async function reviewCase(fault: string, route: string) {
      const fixture = createCreationFixture()
      let allocated = "",
        activations = 0

      try {
        const session = await mintManager()
        const mkdir = fs.mkdirSync.bind(fs),
          sync = fs.fsyncSync.bind(fs)
        vi.spyOn(fs, "mkdirSync").mockImplementation(((
          directory: fs.PathLike,
          options?: fs.MakeDirectoryOptions,
        ) => {
          if (path.basename(path.dirname(String(directory))) === "active") {
            allocated = path.basename(String(directory))

            if (fault === "slot-mkdir") {
              activations += 1

              throw new Error(`EIO private path ${String(directory)}`)
            }
          }

          return mkdir(directory, options)
        }) as typeof fs.mkdirSync)
        vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
          if (fault === "intent-file-fence" && fs.fstatSync(fd).isFile()) {
            activations += 1

            throw new Error(`EIO private allocated identity ${allocated}`)
          }

          sync(fd)
        })
        const response = await request(route, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            route.endsWith("/import")
              ? creationInput()
              : { quizz: creationInput(), extras: creationExtras() },
          ),
        })
        const body: unknown = await response.json()
        const state = creationTree(fixture.root)
        receipts.push({
          fault,
          route,
          allocated,
          activations,
          status: response.status,
          body,
          state,
        })
        expect(activations).toBe(1)
        expect(allocated).toMatch(/^[A-Za-z0-9_-]{21}$/u)
        expect(response.status).toBe(route.endsWith("/import") ? 400 : 500)
        expect(body).toStrictEqual({ error: "errors:server.internal" })
        expect(JSON.stringify(body)).not.toContain(allocated)
        expect(JSON.stringify(body)).not.toContain(fixture.root)
        expect(
          Object.keys(state).filter(
            (name) =>
              name.startsWith("quizz/") ||
              name.startsWith("extensions/quizzes/"),
          ),
        ).toEqual([])

        if (fault === "slot-mkdir") {
          expect(Object.keys(state)).toEqual([])
        }
      } finally {
        vi.restoreAllMocks()
        removeCreationFixture(fixture.root, fixture.token)
      }
    }
    let pending = Promise.resolve()
    for (const fault of ["slot-mkdir", "intent-file-fence"]) {
      for (const route of ["/extensions/quizzes", "/extensions/import"]) {
        pending = pending.then(() => reviewCase(fault, route))
      }
    }
    await pending
    retainCreationReceipt("review-private-http-errors", {
      state: "PASS",
      receipts,
    })
  } catch (error) {
    retainCreationReceipt("review-private-http-errors", {
      state: "FAIL",
      receipts,
      error: String(error),
    })
    throw error
  } finally {
    if (priorConfig === undefined) {
      delete process.env.CONFIG_PATH
    } else {
      process.env.CONFIG_PATH = priorConfig
    }

    if (priorAccounts === undefined) {
      delete process.env.TADAZZ_ACCOUNTS_ENABLED
    } else {
      process.env.TADAZZ_ACCOUNTS_ENABLED = priorAccounts
    }
  }
}
