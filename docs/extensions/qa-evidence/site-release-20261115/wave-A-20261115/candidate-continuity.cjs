// Retained synthetic fixture only. Never point this harness at a public origin.
const { chromium, webkit, expect } = require('/deps/extensions/node_modules/@playwright/test')
const fs = require('node:fs')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const base = 'http://127.0.0.1:3000'
const out = '/evidence'
const oldIndex = '81a5fbe942c74398e002a17205bba112b9e021cef416b83756aa8fd2e76fdf6e'
const newIndex = '9a9edaf33fbcdddc569b66fb1044c2280eb83732c958653019fb499c05681f71'
const hash = b => crypto.createHash('sha256').update(b).digest('hex')
const record = (name, value = {}) => fs.appendFileSync(`${out}/candidate-events.jsonl`, JSON.stringify({ time: new Date().toISOString(), name, ...value }) + '\n')
const save = (name, value) => fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' })
const errors = []
const watch = page => page.on('pageerror', error => errors.push({ name: error.name, message: error.message }))
async function head(page, title, lang) {
  await expect(page).toHaveTitle(title, { timeout: 45000 })
  for (const selector of ['meta[name="application-name"]', 'meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    await expect(page.locator('head ' + selector)).toHaveAttribute('content', selector.includes('application-name') ? 'Tadazz' : title)
  }
  await expect(page.locator('head meta[name="description"]')).toHaveAttribute('content', /\S/)
  await expect(page.locator('head meta[property="og:description"]')).toHaveAttribute('content', await page.locator('head meta[name="description"]').getAttribute('content'))
  await expect(page.locator('body title')).toHaveCount(0)
  if (lang) await expect(page.locator('html')).toHaveAttribute('lang', lang)
  return page.evaluate(() => ({ title: document.title, path: location.pathname, canonical: document.querySelector('link[rel="canonical"]')?.href, lang: document.documentElement.lang, manifest: document.querySelector('link[rel="manifest"]')?.href ?? null, favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href') }))
}
async function metadata(name, launcher) {
  const browser = await launcher.launch({ headless: true, args: name === 'chromium' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] })
  const observations = []
  try {
    for (const [index, lang] of ['en','fr','de','es','it','ja','tr','vi'].entries()) {
      const dictionary = JSON.parse(fs.readFileSync(`/dictionaries/${lang}.json`, 'utf8'))
      const context = await browser.newContext({ viewport: index % 2 ? { width: 390, height: 844 } : { width: 1366, height: 768 }, locale: 'en-US', reducedMotion: 'reduce' })
      const page = await context.newPage(); watch(page)
      await page.goto(`${base}/?lng=${lang}`, { waitUntil: 'domcontentloaded' })
      observations.push({ lang, viewport: page.viewportSize(), ...await head(page, 'Tadazz', lang) })
      await expect(page.getByRole('heading', { name: dictionary['Ready to play'], exact: true }).first()).toBeVisible()
      await page.goto(`${base}/?view=store&lng=${lang}`, { waitUntil: 'domcontentloaded' })
      observations.push({ lang, ...await head(page, `${dictionary.Games} | Tadazz`, lang) })
      const search = page.getByRole('searchbox', { name: dictionary['Search games'] })
      await search.fill(dictionary['The Crowd Decides'].toLocaleUpperCase(lang))
      await expect(page.locator('article.game-card')).toHaveCount(1)
      await search.fill('zzzzzzzzzzzz'); await expect(page.locator('article.game-card')).toHaveCount(0)
      await expect(page.getByText(dictionary['No games found'], { exact: true })).toBeVisible()
      await context.close(); record('locale-pass', { browser: name, lang })
    }
    for (const width of [1366, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'en-US', reducedMotion: 'reduce' })
      const page = await context.newPage(); watch(page)
      for (const [route, title] of [['/', 'Tadazz'], ['/?view=how','How it works | Tadazz'], ['/?view=pricing','Pricing | Tadazz'], ['/?view=demo','Try a round | Tadazz'], ['/login','Log in | Tadazz'], ['/signup','Create account | Tadazz'], ['/forgot','Forgot password? | Tadazz'], ['/reset','Reset password | Tadazz'], ['/game','Join game | Tadazz']]) {
        await page.goto(base + route + (route.includes('?') ? '&' : '?') + 'lng=en', { waitUntil: 'domcontentloaded' })
        observations.push({ width, route, ...await head(page, title) })
      }
      await page.goto(`${base}/studio?lng=en`, { waitUntil: 'domcontentloaded' })
      // Accounts are disabled in this original synthetic fixture. Record the real
      // boundary; authenticated account acceptance belongs to the retained 31b run.
      await page.waitForTimeout(500)
      observations.push({ width, requested: '/studio', actual: await page.url(), title: await page.title(), scope: 'accounts-disabled synthetic boundary' })
      const login = await context.request.post(base + '/api/auth/manager', { data: { password: 'synthetic-qa-manager-only' } }); assert(login.ok())
      const token = (await login.json()).token
      await context.addInitScript(value => localStorage.setItem('token', value), token)
      for (const [route, title] of [['/manager','My Games | Tadazz'], ['/manager/quizz','Editor | Tadazz'], ['/studio','Dashboard | Tadazz'], ['/studio/games','My Games | Tadazz'], ['/studio/account','Account & licences | Tadazz'], ['/studio/prepare','Prepare show | Tadazz']]) {
        await page.goto(`${base}${route}?lng=en`, { waitUntil: 'domcontentloaded' })
        observations.push({ width, scope: 'synthetic manager; accounts disabled', ...await head(page, title) })
      }
      await page.goto(`${base}/?lng=en`); await head(page, 'Tadazz')
      if (width === 390) { await page.getByRole('button', { name: 'Toggle navigation' }).click(); await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Games', exact: true }).click() } else { await page.getByRole('button', { name: 'Games', exact: true }).first().click() }; await head(page, 'Games | Tadazz')
      await page.reload(); await head(page, 'Games | Tadazz'); await page.goBack(); await head(page, 'Tadazz')
      await page.screenshot({ path: `${out}/${name}-home-${width}.png` })
      await context.close()
    }
    assert.deepEqual(errors, [])
    save(`metadata-${name}`, { status: 'PASS', browserVersion: browser.version(), observations, errors })
  } finally { await browser.close() }
}
async function game() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] })
  let monitoring = false, monitor
  const samples = []
  try {
    const managerContext = await browser.newContext({ locale: 'en-US' })
    const request = managerContext.request
    const login = await request.post(base + '/api/auth/manager', { data: { password: 'synthetic-qa-manager-only' } }); assert(login.ok())
    const token = (await login.json()).token
    const saved = await request.post(base + '/api/quizz', { headers: { Authorization: `Bearer ${token}` }, data: { subject: 'Wave A synthetic rollback continuity', gameMode: 'quiz', questions: [{ type:'single', question:'Synthetic continuity?', answers:['Yes','No'], solutions:[0], cooldown:3, time:1800 }] } }); assert(saved.ok())
    const created = await request.post(base + '/api/games', { headers: { Authorization: `Bearer ${token}` }, data: { quizzId: (await saved.json()).id } }); assert(created.ok())
    const { gameId, inviteCode } = await created.json()
    await managerContext.addInitScript(v => localStorage.setItem('token', v), token)
    const host = await managerContext.newPage(); watch(host)
    await host.goto(`${base}/party/manager/${gameId}`); await head(host, 'Host | Tadazz')
    await expect(host.getByText(/^\d{6}$/).first()).toBeVisible({ timeout: 45000 })
    const display = await managerContext.newPage(); watch(display)
    await display.goto(`${base}/display/${gameId}`); await head(display, 'Display | Tadazz')
    const players = []
    for (const name of ['Wave A Alpha','Wave A Bravo','Wave A Charlie']) {
      const context = await browser.newContext({ locale:'en-US' }); const page = await context.newPage(); watch(page)
      await page.goto(`${base}/game?pin=${inviteCode}`)
      await page.getByPlaceholder('Username here').fill(name)
      await page.getByRole('button',{name:'Submit',exact:true}).click()
      await expect(page.getByText('Waiting for players')).toBeVisible({timeout:45000})
      await head(page,'Player | Tadazz'); players.push({ context, page })
    }
    const pages = [host, display, ...players.map(p=>p.page)]
    const origins = await Promise.all(pages.map(p=>p.evaluate(()=>performance.timeOrigin)))
    await host.getByRole('button',{name:'Start',exact:true}).click()
    for (const p of players) await expect(p.page.getByRole('button',{name:'1 Yes',exact:true})).toBeVisible({timeout:90000})
    await players[0].page.getByRole('button',{name:'1 Yes',exact:true}).click(); await expect(host.getByTestId('stage-hud-answer-counter')).toHaveText('1/3')
    assert.equal(hash(await (await request.get(base+'/index.html')).body()),newIndex)
    monitoring = true
    monitor = (async()=>{ while(monitoring) { try { const r=await fetch(base+'/index.html'); samples.push({ms:Date.now(),status:r.status,hash:hash(Buffer.from(await r.arrayBuffer()))}) } catch(error) { samples.push({ms:Date.now(),status:0,error:error.name}) } await new Promise(resolve=>setTimeout(resolve,300)) } })()
    save('ready-for-rollback', { status:'READY', gameId, answers:1, browserVersion:browser.version() }); record('ready-rollback')
    await expect.poll(()=>fs.existsSync(`${out}/rollback.done`),{timeout:600000,intervals:[500]}).toBe(true)
    assert.equal(hash(await (await request.get(base+'/index.html')).body()),oldIndex)
    for (const [index,p] of players.slice(1).entries()) { await p.page.getByRole('button',{name:'1 Yes',exact:true}).click(); await expect(host.getByTestId('stage-hud-answer-counter')).toHaveText(`${index+2}/3`) }
    assert.deepEqual(await Promise.all(pages.map(p=>p.evaluate(()=>performance.timeOrigin))),origins)
    const fresh=await managerContext.newPage(); await fresh.goto(base+'/'); await expect(fresh).toHaveTitle('TADAZZ'); await fresh.close()
    monitoring=false; await monitor; assert(samples.length>2); assert(samples.every(s=>s.status===200&&[oldIndex,newIndex].includes(s.hash))); assert.deepEqual(errors,[])
    await host.screenshot({path:`${out}/chromium-game-after-rollback.png`})
    save('continuity', {status:'PASS',answers:3,unchangedTimeOrigins:true,samples,errors})
    for(const p of players) await p.context.close(); await managerContext.close()
  } finally { monitoring=false; if(monitor) await monitor; await browser.close() }
}
async function main() { for(const [name,launcher] of [['chromium',chromium],['webkit',webkit]]) await metadata(name,launcher); await game() }
main().catch(error=>{record('FAILED',{message:error.message,stack:error.stack});process.exitCode=1})
