/** Computed browser evidence for native palettes and reusable catalogue covers. */
import assert from "node:assert/strict"
import { PUBLIC_GALLERY_IDS } from "./catalogue-inventory.mjs"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire("/cleanup/extensions/package.json")
const { expect } = require("@playwright/test")
const rgb = (values) => "rgb(" + values.join(", ") + ")"
const expected = {
  "tadazz-midnight-club": {
    mid: [20, 58, 88],
    night: [7, 24, 39],
    secondary: [148, 201, 214],
    accent: [232, 190, 105],
  },
  "tadazz-family-fiesta": {
    mid: [119, 73, 87],
    night: [61, 36, 53],
    secondary: [200, 220, 175],
    accent: [255, 191, 145],
  },
  "tadazz-discovery-lab": {
    mid: [36, 90, 131],
    night: [16, 46, 88],
    secondary: [246, 215, 138],
    accent: [139, 220, 237],
  },
}
const append = (evidence, filename, row) => {
  const path = join(evidence, filename)
  const rows = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : []
  rows.push(row)
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n")
}

export async function verifyNativePalette(
  page,
  themeId,
  context,
  evidence,
  captureScreenshot = true,
) {
  if (themeId !== "tadazz-classic" && !expected[themeId]) return null
  const stage = page
    .locator(".tzv4-stage:visible")
    .filter({ has: page.locator(".q-frame") })
    .first()
  await expect(stage.locator(".q-frame")).toBeVisible({ timeout: 30_000 })
  if (context === "editor") {
    // The static Question tab intentionally contains no answers. Palette
    // comparisons inspect the explicit Answers tab, without starting playback.
    const preview = page.getByTestId("question-live-preview")
    await expect(preview).toHaveAttribute("data-preview-phase", "question")
    await expect(stage.locator(".answer-card")).toHaveCount(0)
    await preview.getByTestId("question-preview-phase-answers").click()
    await expect(preview).toHaveAttribute("data-preview-phase", "answers")
  }
  await expect(stage.locator(".answer-card").first()).toBeVisible({
    timeout: 30_000,
  })
  if (expected[themeId])
    await expect(stage).toHaveAttribute("data-theme-palette", themeId)
  else
    assert.equal(
      await stage.getAttribute("data-theme-palette"),
      null,
      "Classic retains its source artwork",
    )
  const sample = await stage.evaluate((root) => {
    const select = (selector) => {
      const element = root.querySelector(selector)
      if (!element) return null
      const style = getComputedStyle(element)
      return {
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderTopColor,
        color: style.color,
        geometry: {
          left: element.offsetLeft,
          top: element.offsetTop,
          width: element.offsetWidth,
          height: element.offsetHeight,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          borderWidth: style.borderTopWidth,
        },
      }
    }
    const answer = root.querySelector(".answer-card")
    return {
      marker: root.getAttribute("data-theme-palette"),
      question: select(".q-frame"),
      answer: select(".answer-card"),
      monogram: select(".answer-monogram"),
      title: select(".answer-title"),
      selected: Boolean(answer?.closest(".is-selected, .is-favourite")),
    }
  })
  append(evidence, "native-palette-evidence.json", {
    context,
    themeId,
    ...sample,
  })
  if (expected[themeId]) {
    const colors = expected[themeId]
    assert.equal(
      sample.question.backgroundImage,
      "linear-gradient(150deg, " +
        rgb(colors.mid) +
        ", " +
        rgb(colors.night) +
        ")",
      context + " question palette",
    )
    assert.equal(
      sample.question.borderColor,
      rgb(colors.secondary),
      context + " question border",
    )
    assert.equal(
      sample.answer.backgroundImage,
      "linear-gradient(165deg, " +
        rgb(colors.mid) +
        ", " +
        rgb(colors.night) +
        " 49%, " +
        rgb(colors.mid) +
        ")",
      context + " answer palette",
    )
    assert.equal(
      sample.answer.borderColor,
      rgb(sample.selected ? colors.accent : colors.secondary),
      context + " answer border",
    )
    if (sample.monogram)
      assert.equal(
        sample.monogram.color,
        rgb(colors.accent),
        context + " monogram accent",
      )
    assert.equal(
      sample.title.color,
      "rgb(255, 249, 239)",
      context + " answer text",
    )
  } else {
    assert(
      sample.question.backgroundImage.includes("rgba(59, 12, 119, 0.92)"),
      "Classic question purple remains unchanged",
    )
    assert(
      sample.question.backgroundImage.includes("rgba(30, 6, 79, 0.92)"),
      "Classic question dark remains unchanged",
    )
    assert.equal(
      sample.answer.borderColor,
      "rgba(184, 91, 255, 0.88)",
      "Classic answer border remains unchanged",
    )
    if (sample.monogram)
      assert.equal(
        sample.monogram.color,
        "rgb(239, 255, 66)",
        "Classic monogram remains unchanged",
      )
  }
  if (
    captureScreenshot &&
    ["editor", "preview", "solo", "host"].includes(context)
  ) {
    await stage.screenshot({
      path: join(evidence, "palette-" + context + "-" + themeId + ".png"),
    })
  }
  return { question: sample.question.geometry, answer: sample.answer.geometry }
}

export async function verifyCatalogueCovers(page, context, evidence) {
  const position = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }))
  const rows = []
  const cards = page.locator("[data-catalogue-card]")
  await expect(cards).toHaveCount(PUBLIC_GALLERY_IDS.length)
  for (const card of await cards.all()) {
    const cover = card.locator("[data-catalogue-cover]")
    await cover.scrollIntoViewIfNeeded()
    const row = await card.evaluate((root) => {
      const cover = root.querySelector("[data-catalogue-cover]")
      const title = cover?.querySelector(".cover-title")
      const trigger = root.querySelector(".game-preview-trigger")
      const bodyTitle = root.querySelector(
        ".game-card-body h3 .catalogue-title-link",
      )
      const rect = (element) => {
        if (!element) return null
        const r = element.getBoundingClientRect()
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        }
      }
      return {
        id: root.getAttribute("data-catalogue-card"),
        card: rect(root),
        cover: rect(cover),
        bodyTitle: rect(bodyTitle),
        controls: [
          ...root.querySelectorAll(
            "[data-catalogue-preview], [data-catalogue-open], .game-preview-trigger",
          ),
        ]
          .map(rect)
          .filter((box) => box?.width && box?.height),
        title: rect(title),
        trigger: rect(trigger),
      }
    })
    rows.push(row)
  }
  await page.evaluate(({ x, y }) => window.scrollTo(x, y), position)
  append(evidence, "catalogue-cover-layout.json", { context, rows })
  const inside = (inner, outer) =>
    inner.left >= outer.left - 1 &&
    inner.right <= outer.right + 1 &&
    inner.top >= outer.top - 1 &&
    inner.bottom <= outer.bottom + 1
  const overlaps = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
  for (const row of rows) {
    assert(
      row.cover?.width && row.cover?.height,
      context + ": rendered artwork " + row.id,
    )
    if (row.title?.width && row.title?.height) {
      assert(
        inside(row.title, row.cover),
        context + ": overlay title inside cover " + row.id,
      )
      if (row.trigger?.width && row.trigger?.height)
        assert(
          !overlaps(row.title, row.trigger),
          context + ": title clear of Preview " + row.id,
        )
    } else {
      assert(
        context.startsWith("public-"),
        context + ": expected visible Studio cover title " + row.id,
      )
      assert(
        row.bodyTitle?.width && row.bodyTitle?.height,
        context + ": visible body title " + row.id,
      )
      assert(
        inside(row.bodyTitle, row.card) &&
          row.bodyTitle.top >= row.cover.bottom - 1,
        context + ": title inside card below artwork " + row.id,
      )
    }
    if (row.trigger?.width && row.trigger?.height)
      assert(
        inside(row.trigger, row.cover),
        context + ": Preview inside artwork " + row.id,
      )
    for (let a = 0; a < row.controls.length; a++) {
      for (let b = a + 1; b < row.controls.length; b++)
        assert(
          !overlaps(row.controls[a], row.controls[b]),
          context + ": explicit card actions do not overlap " + row.id,
        )
    }
  }
  return rows
}
