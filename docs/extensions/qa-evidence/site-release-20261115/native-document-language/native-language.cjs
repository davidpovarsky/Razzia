const { chromium, webkit, expect } = require('/deps/extensions/node_modules/@playwright/test')
const fs = require('node:fs')
const cases = JSON.parse(fs.readFileSync('/evidence/cases.json', 'utf8'))
const results = []
async function main() {
  for (const [name, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await launcher.launch({ headless: true, args: name === 'chromium' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] })
    try {
      for (const input of cases) {
        const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1366, height: 768 } })
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        try {
          await page.goto(`http://127.0.0.1:3000/game?lng=${input.lang}`)
          await expect(page).toHaveTitle(input.title, { timeout: 45000 })
          const observed = await page.evaluate(() => ({ title: document.title, lang: document.documentElement.lang, dir: document.documentElement.dir, canonical: document.querySelector('link[rel="canonical"]')?.href, body: document.body.innerText.slice(0, 180) }))
          await expect(page.locator('html')).toHaveAttribute('lang', input.lang, { timeout: 2500 })
          results.push({ browser: name, browserVersion: browser.version(), ...input, observed, errors, status: 'PASS' })
        } catch (error) {
          results.push({ browser: name, browserVersion: browser.version(), ...input, status: 'FAIL', error: error.message, observed: await page.evaluate(() => ({ title: document.title, lang: document.documentElement.lang, dir: document.documentElement.dir, canonical: document.querySelector('link[rel="canonical"]')?.href, body: document.body.innerText.slice(0, 180) })), errors })
        } finally { await context.close() }
        fs.writeFileSync('/evidence/results.json', JSON.stringify(results, null, 2))
      }
    } finally { await browser.close() }
  }
  const failed = results.filter(row => row.status === 'FAIL').length
  process.stdout.write(JSON.stringify({ passed: results.length - failed, failed, total: results.length }) + '\n')
  if (failed) process.exitCode = 1
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
