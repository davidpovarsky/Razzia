/* oxlint-disable eslint/max-nested-callbacks -- Playwright assertions evaluate decoded-image state inside the real browser context. */
/* oxlint-disable no-await-in-loop -- Inspect each native scene and user-gesture audio event in order. */
import { test, expect } from "@playwright/test"
import { join } from "node:path"
import { createHash } from "node:crypto"
import {
  SHOW_THEME_AUDIO_EVENTS,
  SHOW_THEME_LOCALES,
  SHOW_THEME_SLOTS,
  createShowThemeRegistry,
  resolveShowTheme,
  showThemeDefinitionSchema,
} from "@razzia/extensions/core"

const token = process.env.TADAZZ_THEME_TOKEN
const tenant = process.env.TADAZZ_THEME_WORKSPACE
const artifact = process.env.TADAZZ_THEME_ARTIFACT
test.skip(
  !token || !tenant || !artifact,
  "Use the authenticated remote theme-preview configuration",
)

test("reviews all fifteen native slots, sixteen explicit audio events and eight locale maps", async ({
  page,
}, info) => {
  await page.addInitScript(
    (value) => localStorage.setItem("token", value),
    token,
  )
  await page.addInitScript(() => {
    const plays: string[] = []
    const settled: Array<{ url: string; ok: boolean }> = []
    Object.assign(window, {
      __themeReviewPlays: plays,
      __themeReviewSettled: settled,
    })
    // oxlint-disable-next-line typescript/unbound-method -- Invoke the intercepted prototype with its original receiver below.
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      const url = this.src
      const isAudio = this instanceof HTMLAudioElement

      if (isAudio) {
        plays.push(url)
      }

      return original.call(this).then(
        () => {
          if (isAudio) {
            settled.push({ url, ok: true })
          }
        },
        (error: unknown) => {
          if (isAudio) {
            settled.push({ url, ok: false })
          }

          throw error
        },
      )
    }
  })
  const failures: string[] = []
  page.on("response", (response) => {
    if (response.url().includes("/media/theme_") && response.status() >= 400) {
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
    }
  })
  const path = `/manager/themes/${tenant}/${artifact}`
  await page.goto(path)
  await expect(page.getByTestId("theme-installation-preview")).toBeVisible()
  const response = await page.request.get(
    `/api/themes/workspaces/${tenant}/drafts/${artifact}/preview`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(response.ok()).toBe(true)
  const receipt = (await response.json()) as {
    definition: unknown
    revision: number
    manifestSha256: string
  }
  const definition = showThemeDefinitionSchema.parse(receipt.definition)
  const { localizations } = definition

  if (!localizations) {
    throw new Error("Preview must contain all locale maps")
  }

  if (process.env.TADAZZ_THEME_EXPECTED_MANIFEST) {
    expect(receipt.manifestSha256).toBe(
      process.env.TADAZZ_THEME_EXPECTED_MANIFEST,
    )
  }

  if (process.env.TADAZZ_THEME_EXPECTED_REVISION) {
    expect(receipt.revision).toBe(
      Number(process.env.TADAZZ_THEME_EXPECTED_REVISION),
    )
  }

  const resolved = resolveShowTheme({
    selection: {
      id: definition.id,
      version: definition.version,
      overrides: {},
    },
    role: "manager",
    registry: createShowThemeRegistry([definition]),
  })
  for (const asset of definition.assets) {
    const fetched = await page.request.get(asset.url)
    expect(fetched.ok(), asset.id).toBe(true)
    expect(
      createHash("sha256")
        .update(await fetched.body())
        .digest("hex"),
      asset.id,
    ).toBe(asset.sha256)
    expect(fetched.headers()["cache-control"]).toContain("no-store")
  }
  const native = page.locator("[data-preview-theme]")
  await expect(native).toHaveAttribute("data-preview-theme", definition.id)
  const scenes: string[] = []
  for (const slot of SHOW_THEME_SLOTS) {
    const button = page.getByTestId(`theme-preview-slot-${slot}`)

    if (await button.isEnabled()) {
      await button.click()
    }

    await expect(native).toHaveAttribute("data-preview-slot", slot)
    await expect(native.getByTestId("tadazz-stage")).toBeVisible()

    if (["question", "answerCards", "resultsReveal"].includes(slot)) {
      await expect
        .poll(() =>
          native
            .locator("img")
            .evaluateAll(
              (images) =>
                images.length > 0 &&
                images.every(
                  (image) =>
                    (image as HTMLImageElement).complete &&
                    (image as HTMLImageElement).naturalWidth > 0,
                ),
            ),
        )
        .toBe(true)
    }

    expect(
      await native.evaluate(
        (element) => element.getBoundingClientRect().right <= innerWidth + 1,
      ),
    ).toBe(true)
    await expect(native.locator("iframe")).toHaveCount(0)
    await native.screenshot({ path: join(info.outputDir, `${slot}.png`) })
    scenes.push(slot)
  }
  const plays = () =>
    page.evaluate(
      () =>
        (window as unknown as { __themeReviewPlays: string[] })
          .__themeReviewPlays,
    )
  expect(await plays()).toEqual([])
  const audio: Array<{ event: string; silent: boolean; url?: string }> = []
  for (const event of SHOW_THEME_AUDIO_EVENTS) {
    const choice = resolved.audio[event]
    const button = page.getByTestId(`theme-preview-audio-${event}`)
    const before = (await plays()).length
    const settledBefore = await page.evaluate(
      () =>
        (window as unknown as { __themeReviewSettled: unknown[] })
          .__themeReviewSettled.length,
    )

    if (choice.silent || !choice.url) {
      await expect(button).toBeDisabled()
      audio.push({ event, silent: true })
    } else {
      await button.click()
      await expect.poll(async () => (await plays()).length).toBe(before + 1)
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { __themeReviewSettled: unknown[] })
                .__themeReviewSettled.length,
          ),
        )
        .toBe(settledBefore + 1)
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as {
                  __themeReviewSettled: Array<{ ok: boolean }>
                }
              ).__themeReviewSettled.at(-1)?.ok,
          ),
        )
        .toBe(true)
      expect((await plays()).at(-1)).toBe(new URL(choice.url, page.url()).href)
      const stop = page.getByRole("button", { name: "Stop", exact: true })
      await stop.click()
      await expect(page.locator("[data-audio-playing]")).toHaveAttribute(
        "data-audio-playing",
        "",
      )
      audio.push({ event, silent: false, url: choice.url })
    }
  }
  for (const locale of SHOW_THEME_LOCALES) {
    await page.goto(`${path}?lng=${locale}`)
    await expect(
      page
        .getByTestId("theme-installation-preview")
        .getByRole("heading", { level: 1 }),
    ).toContainText(localizations[locale][definition.nameKey])
  }
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload()
  await expect(page.getByTestId("tadazz-stage")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  )
  expect(failures).toEqual([])
  const final = await page.request.get(
    `/api/themes/workspaces/${tenant}/drafts/${artifact}/preview`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const finalReceipt = (await final.json()) as {
    revision: number
    manifestSha256: string
  }
  expect(finalReceipt.revision).toBe(receipt.revision)
  expect(finalReceipt.manifestSha256).toBe(receipt.manifestSha256)
  await info.attach("review-matrix.json", {
    body: JSON.stringify({
      id: definition.id,
      version: definition.version,
      revision: receipt.revision,
      manifestSha256: receipt.manifestSha256,
      scenes,
      audio,
      locales: SHOW_THEME_LOCALES,
      reducedMotion: true,
      mediaFailures: failures,
    }),
    contentType: "application/json",
  })
})
