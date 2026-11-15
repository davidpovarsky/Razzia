// New account-button/history seam only; actual retained artifact + synthetic API.
const { chromium, webkit, expect } = require('/deps/extensions/node_modules/@playwright/test')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const base = 'http://127.0.0.1:3000'
const observed = []
const pageErrors = []
const save = () => fs.writeFileSync('/evidence/observations.json', JSON.stringify({ observed, pageErrors }, null, 2))

async function metadata(page, browser, transition, path, title, heading) {
  await expect(page).toHaveURL(new RegExp(`${path}(?:\\?|$)`), { timeout: 30000 })
  const before = await page.evaluate(() => ({ url: location.href, title: document.title, canonical: document.querySelector('link[rel="canonical"]')?.href }))
  observed.push({ browser, transition, expectedPath: path, expectedTitle: title, immediate: before })
  save()
  await expect(page).toHaveTitle(title, { timeout: 30000 })
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({ timeout: 30000 })
  for (const key of ['og:title', 'twitter:title']) {
    await expect(page.locator(`head meta[${key.startsWith('og') ? 'property' : 'name'}="${key}"]`)).toHaveAttribute('content', title)
  }
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', base + path)
  await expect(page.locator('head meta[name="application-name"]')).toHaveAttribute('content', 'Tadazz')
  await expect(page.locator('body title')).toHaveCount(0)
  observed[observed.length - 1].status = 'PASS'
  save()
}

async function flow(name, launcher, width) {
  const browser = await launcher.launch({ headless: true, args: name === 'chromium' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] })
  const context = await browser.newContext({ locale: 'en-US', viewport: { width, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.on('pageerror', error => pageErrors.push({ browser: name, message: error.message }))
  try {
    await page.goto(base + '/login?returnTo=%2Fstudio%2Fgames&lng=en')
    const stamp = await page.evaluate(() => performance.timeOrigin)
    await metadata(page, name, 'initial', '/login', 'Log in | Tadazz', 'Welcome back.')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await metadata(page, name, 'login button -> signup', '/signup', 'Create account | Tadazz', 'Create your account.')
    await page.getByRole('button', { name: 'Back to login', exact: true }).click()
    await metadata(page, name, 'signup button -> login', '/login', 'Log in | Tadazz', 'Welcome back.')
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click()
    await metadata(page, name, 'login button -> forgot', '/forgot', 'Forgot password? | Tadazz', 'Reset your password.')
    await page.goBack()
    await metadata(page, name, 'history back', '/login', 'Log in | Tadazz', 'Welcome back.')
    await page.goForward()
    await metadata(page, name, 'history forward', '/forgot', 'Forgot password? | Tadazz', 'Reset your password.')
    await page.goBack()
    await metadata(page, name, 'history back before verification', '/login', 'Log in | Tadazz', 'Welcome back.')
    await page.getByRole('button', { name: 'Verify email', exact: true }).click()
    await metadata(page, name, 'login button -> verify', '/verify', 'Email verified | Tadazz', 'Check your inbox.')
    assert.equal(await page.evaluate(() => performance.timeOrigin), stamp, 'account navigation must preserve document')
    await page.reload()
    await metadata(page, name, 'verification reload', '/verify', 'Email verified | Tadazz', 'Check your inbox.')
    await page.goBack()
    await metadata(page, name, 'back after reload', '/login', 'Log in | Tadazz', 'Welcome back.')
    await page.goForward()
    await metadata(page, name, 'forward after reload', '/verify', 'Email verified | Tadazz', 'Check your inbox.')
    assert.deepEqual(pageErrors, [])
    observed.push({ browser: name, width, browserVersion: browser.version(), status: 'FLOW_PASS', note: 'accounts-disabled synthetic server; UI metadata/history only, no account submission or email' })
    save()
  } catch (error) {
    observed.push({ browser: name, status: 'FAIL', error: error.message, actual: await page.evaluate(() => ({ url: location.href, title: document.title, text: document.body.innerText.slice(0, 300) })).catch(() => null) })
    save()
    await page.screenshot({ path: `/evidence/failure-${name}.png` }).catch(() => {})
    throw error
  } finally {
    await context.close()
    await browser.close()
  }
}

async function main() {
  for (const [name, launcher, width] of [['chromium', chromium, 1366], ['webkit', webkit, 390]]) await flow(name, launcher, width)
  process.stdout.write(JSON.stringify({ status: 'PASS_FOCUSED_ACCOUNT_TRANSITIONS', observations: observed.filter(x => x.expectedTitle).length, flows: 2 }) + '\n')
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
