import assert from "node:assert/strict"
import { chromium } from "@playwright/test"
import path from "node:path"

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
})
const errors = []
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  })
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Try a round" }).first().click()
  await page.getByTestId("great-guessoff-demo").waitFor()
  assert.ok(
    page.url().includes("game=great-guessoff"),
    "Header CTA opens the new demo",
  )
  await page.goto("http://127.0.0.1:3000/?view=store", {
    waitUntil: "networkidle",
  })
  await page
    .getByRole("heading", { name: "The Great Guess-off", exact: true })
    .waitFor()
  await page.goto("http://127.0.0.1:3000/?view=demo&game=great-guessoff", {
    waitUntil: "networkidle",
  })
  await page.getByTestId("great-guessoff-demo").waitFor()
  await page.getByRole("button", { name: /Start the show/i }).click()
  await page
    .getByText(
      "What causes the biggest delay when the whole family is going out?",
    )
    .waitFor()
  await page.getByRole("button", { name: /Getting everyone ready/i }).click()
  await page.getByRole("button", { name: /Reveal results/i }).click()
  assert.equal(await page.locator(".ggo-vote-meter").count(), 4)
  await page.getByRole("button", { name: /Next round/i }).click()
  await page.getByText("Which of these is actually a berry?").waitFor()
  const image = page.locator(".ggo-choice img").first()
  await image.waitFor()
  assert.equal(
    await image.evaluate((element) => element.naturalWidth > 0),
    true,
    "Banana image must load",
  )
  await page.getByRole("button", { name: /Banana/i }).click()
  await page.getByRole("button", { name: /Reveal results/i }).click()
  await page.getByText(/Correct! \+1,000 points/).waitFor()
  await page.getByRole("button", { name: /Next round/i }).click()
  await page.getByRole("button", { name: /Technical problems/i }).click()
  await page.getByRole("button", { name: /Reveal results/i }).click()
  assert.equal(await page.locator(".ggo-vote-meter").count(), 4)
  await page.getByRole("button", { name: /Next round/i }).click()
  await page.getByRole("button", { name: /Three/i }).click()
  await page.getByRole("button", { name: /Reveal results/i }).click()
  await page.getByRole("button", { name: /See the leaderboard/i }).click()
  await page.getByText("The scores are in!").waitFor()
  assert.equal(await page.locator(".ggo-rank").count(), 4)
  await page.getByRole("button", { name: /Play the grand finale/i }).click()
  await page.getByText("Which one are YOU at a party?").waitFor()
  assert.equal(await page.locator(".ggo-choice img").count(), 4)
  assert.equal(
    await page.locator(".ggo-choice img").evaluateAll(async (images) => {
      await Promise.all(images.map((element) => element.decode()))
      return images.every((element) => element.naturalWidth > 0)
    }),
    true,
    "Four party illustrations must load",
  )
  await page.getByRole("button", { name: /The Snack Hunter/i }).click()
  await page.getByRole("button", { name: /Reveal results/i }).click()
  await page.getByRole("button", { name: /Final results/i }).click()
  await page.getByText("Who topped the board?").waitFor()
  await page.getByRole("button", { name: /Celebrate the winner/i }).click()
  await page.getByText("AND THE WINNER IS…").waitFor()
  assert.equal(
    (await page.locator(".ggo-winner-name").textContent())?.trim(),
    "You",
  )
  await page.screenshot({
    path: path.resolve("qa/phase2/great-guessoff-desktop.png"),
    fullPage: true,
  })
  await page.getByRole("button", { name: /Play again/i }).click()
  await page.getByRole("button", { name: /Start the show/i }).waitFor()
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  })
  mobile.on("pageerror", (error) => errors.push(error.message))
  await mobile.goto("http://127.0.0.1:3000/?view=demo&game=great-guessoff", {
    waitUntil: "networkidle",
  })
  await mobile.getByRole("button", { name: /Start the show/i }).click()
  await mobile.getByRole("button", { name: /Getting everyone ready/i }).click()
  await mobile.getByRole("button", { name: /Reveal results/i }).click()
  await mobile.getByRole("button", { name: /Next round/i }).click()
  const card = mobile.locator(".ggo-choice").first()
  const bounds = await card.boundingBox()
  assert.ok(
    bounds &&
      bounds.width > 90 &&
      bounds.x >= 0 &&
      bounds.x + bounds.width <= 400,
    "Mobile image choice fits viewport",
  )
  await mobile.screenshot({
    path: path.resolve("qa/phase2/great-guessoff-mobile.png"),
    fullPage: true,
  })
  assert.deepEqual(
    errors.filter((error) => error !== "errors:auth.sessionFailed"),
    [],
    "No game or presentation browser errors",
  )
  console.log(
    JSON.stringify({
      ok: true,
      checks: 19,
      desktop: true,
      mobile: true,
      images: 8,
      winner: "You",
      expectedAuthErrors: errors.length,
    }),
  )
} finally {
  await browser.close()
}
