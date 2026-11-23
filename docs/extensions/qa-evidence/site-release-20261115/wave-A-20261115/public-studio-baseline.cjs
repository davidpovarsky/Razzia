const { chromium, webkit } = require('/deps/extensions/node_modules/@playwright/test')
const crypto = require('node:crypto')

const origin = 'https://tadazz.com'
const routes = ['/studio']

async function main() {
  const report = {origin, scope: 'public-unauthenticated-GET-only', observations: [], errors: []}
  for (const [name, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    let browser
    try {
      browser = await launcher.launch({headless: true, args: name === 'chromium' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []})
      const context = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'})
      await context.route('**/*', async route => {
        const request = route.request()
        const url = new URL(request.url())
        if (request.method() !== 'GET' || url.origin !== origin) return route.abort('blockedbyclient')
        return route.continue()
      })
      await context.routeWebSocket('**/*', ws => ws.close())
      for (const route of routes) {
        const page = await context.newPage()
        try {
          const response = await page.goto(origin + route, {waitUntil: 'domcontentloaded', timeout: 35000})
          await page.waitForTimeout(1800)
          const metadata = await page.evaluate(() => ({
            path: location.pathname, title: document.title,
            lang: document.documentElement.lang, dir: document.documentElement.dir,
            applicationName: document.querySelector('meta[name="application-name"]')?.content ?? null,
            description: document.querySelector('meta[name="description"]')?.content ?? null,
            ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? null,
            canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
            visibleText: (document.body?.innerText ?? '').trim().slice(0, 160),
          }))
          report.observations.push({browser: name, requested: route, status: response?.status() ?? null, ...metadata})
        } catch (error) {
          report.errors.push({browser: name, requested: route, kind: error?.name ?? 'Error'})
        } finally { await page.close() }
      }
      await context.close()
    } catch (error) {
      report.errors.push({browser: name, kind: error?.name ?? 'Error', stage: 'browser-launch'})
    } finally { if (browser) await browser.close() }
  }
  const raw = await fetch(origin + '/', {redirect: 'follow'})
  const html = await raw.text()
  report.publicShell = {status: raw.status, sha256: crypto.createHash('sha256').update(html).digest('hex'),
    staticTitle: (html.match(/<title[^>]*>([^<]*)<\/title>/i) ?? [])[1] ?? null}
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  if (report.errors.length || report.observations.length !== routes.length * 2) process.exitCode = 1
}
main().catch(error => { console.error(JSON.stringify({stage:'fatal', kind:error?.name ?? 'Error'})); process.exitCode = 1 })
