import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { chromium } from "file:///C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-recovery-fresh-20261115/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/index.mjs"
const here = path.dirname(fileURLToPath(import.meta.url)),
  label = process.argv[2]
if (!/^candidate-\d{2}$/.test(label ?? ""))
  throw Error("Select immutable source run")
const dir = path.join(here, label),
  target = path.join(dir, "browser-result.json")
if (fs.existsSync(target)) throw Error("Preserve browser evidence")
const eRoot =
  "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-ui-20261115/docs/extensions/qa-evidence/show-ui-20261115/native21-evidence"
const sha = (b) => createHash("sha256").update(b).digest("hex")
const files = new Map([
  ["/consumer.mjs", fs.readFileSync(path.join(dir, "consumer.mjs"))],
  [
    "/renderer.mjs",
    fs.readFileSync(path.join(eRoot, "native-v2-candidate/renderer-v2.js")),
  ],
  [
    "/renderer.css",
    fs.readFileSync(path.join(eRoot, "native-v2-candidate/renderer-v2.css")),
  ],
])
assert.equal(
  sha(files.get("/renderer.mjs")),
  "10b39d3e1a16b279f2b587a51fa777d7f5875ce2b88f88092f45acec29783340",
)
assert.equal(
  sha(files.get("/renderer.css")),
  "1aa026a06d84117e23d8a04ef038a5260691b982796e057c39906ff6d66259d9",
)
const receipt = JSON.parse(
  fs.readFileSync(path.join(eRoot, "native-v2-build-receipt.json")),
)
assert.deepEqual(receipt.forbiddenPayloadModules, [])
const shell =
  '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="candidate"></div></body></html>'
const bootstrap = `import {createPreviewCandidateConsumerV2} from '/consumer.mjs'; import {mountCompositionPreviewCandidateV2} from '/renderer.mjs';
const shadow=document.querySelector('#candidate').attachShadow({mode:'open'}),link=document.createElement('link');link.rel='stylesheet';link.href='/renderer.css';shadow.append(link);await new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=reject});
const element=document.createElement('div');element.style.cssText='width:960px;height:540px;position:relative;container-type:inline-size';shadow.append(element);let failures=0,handle,ticket;
const consumer=createPreviewCandidateConsumerV2(element,(node,fail)=>handle=mountCompositionPreviewCandidateV2(node,fail),()=>failures++);
window.qa={begin:s=>ticket=consumer.begin(s),receive:r=>consumer.receive(ticket,r),stale:(old,next)=>{const before=consumer.begin(old.selection);ticket=consumer.begin(next.selection);return consumer.receive(before,old.result)},invalid:(value)=>{const old=consumer.begin(value.selection);try{consumer.begin({})}catch{}return consumer.receive(old,value.result)},dispose:()=>consumer.dispose(),status:()=>({failures,diagnostics:handle?.diagnostics?.()})};window.qaReady=true;`
files.set("/bootstrap.mjs", Buffer.from(bootstrap))
const denied = [],
  pageErrors = [],
  checks = []
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.setHeader("content-type", "text/html")
    res.end(
      shell.replace(
        "</body>",
        '<script type="module" src="/bootstrap.mjs"></script></body>',
      ),
    )
    return
  }
  const bytes = files.get(req.url)
  if (!bytes) {
    denied.push(req.url)
    res.writeHead(404)
    res.end()
    return
  }
  res.setHeader(
    "content-type",
    req.url.endsWith(".css") ? "text/css" : "text/javascript",
  )
  res.setHeader("cache-control", "no-store")
  res.end(bytes)
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
let browser
const started = new Date().toISOString()
try {
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
  page.on("pageerror", (e) => pageErrors.push(e.message))
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  )
  await page.goto("http://127.0.0.1:" + server.address().port)
  await page.waitForFunction(() => window.qaReady)
  const data = JSON.parse(fs.readFileSync(path.join(dir, "tool-results.json"))),
    classic = data.results.find(
      (r) =>
        r.result._meta["tadazz/preview-candidate-v2"].input.themeBinding.theme
          .id === "tadazz-classic",
    ),
    razzia = data.results.find(
      (r) =>
        r.result._meta["tadazz/preview-candidate-v2"].input.themeBinding.theme
          .id === "razzia-original",
    )
  const show = async (value) => {
    await page.evaluate((v) => window.qa.begin(v.selection), value)
    return page.evaluate((v) => window.qa.receive(v.result), value)
  }
  assert.equal(await show(razzia), true)
  await page
    .getByTestId("native-razzia-question")
    .waitFor({ state: "visible", timeout: 5000 })
  assert.equal(
    await page.getByTestId("native-razzia-question").innerText(),
    "Question 1",
  )
  assert.equal(await page.getByTestId("native-razzia-clock").innerText(), "15")
  await page.waitForTimeout(150)
  assert.equal(await page.getByTestId("native-razzia-clock").innerText(), "15")
  checks.push({
    case: "real HTTP candidate to genuine E Razzia/JA paused15 frame",
    pass: true,
  })
  assert.equal(await show(classic), true)
  await page
    .getByTestId("native-preview-surface")
    .waitFor({ state: "visible", timeout: 5000 })
  await page.waitForFunction(() =>
    document
      .querySelector("#candidate")
      .shadowRoot.querySelector('[data-preview-ready="true"]'),
  )
  assert.equal(
    await page
      .getByTestId("native-preview-surface")
      .getAttribute("data-preview-ready"),
    "true",
  )
  assert.equal(
    await page
      .getByTestId("native-preview-surface")
      .evaluate((n) => getComputedStyle(n).opacity),
    "1",
  )
  checks.push({
    case: "real HTTP candidate to genuine E Classic ready and opacity1",
    pass: true,
  })
  for (const kind of ["acceptance", "input-digest", "exact-definition"]) {
    const altered = structuredClone(razzia)
    const meta = altered.result._meta["tadazz/preview-candidate-v2"]
    if (kind === "acceptance") meta.executableAcceptance = true
    else if (kind === "input-digest")
      meta.input.frame.question.text = "Altered question"
    else {
      meta.input.themeBinding.definitionSha256 = "0".repeat(64)
      const canonical = (v) =>
        v === null || typeof v !== "object"
          ? JSON.stringify(v)
          : Array.isArray(v)
            ? "[" + v.map(canonical).join(",") + "]"
            : "{" +
              Object.keys(v)
                .sort()
                .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
                .join(",") +
              "}"
      meta.inputDigest = sha(canonical(meta.input))
    }
    assert.equal(await show(altered), false)
    assert.equal(await page.getByTestId("native-razzia-preview-v2").count(), 0)
    assert.equal(await page.getByTestId("native-preview-surface").count(), 0)
    checks.push({
      case: "reject " + kind + " and dispose stale stage",
      pass: true,
    })
  }
  assert.equal(
    await page.evaluate((v) => window.qa.stale(v.old, v.next), {
      old: classic,
      next: razzia,
    }),
    false,
  )
  assert.equal(
    await page.evaluate((v) => window.qa.receive(v.result), razzia),
    true,
  )
  await page
    .getByTestId("native-razzia-question")
    .waitFor({ state: "visible", timeout: 5000 })
  checks.push({
    case: "old selection ticket rejected; latest selection rendered",
    pass: true,
  })
  assert.equal(await page.evaluate((v) => window.qa.invalid(v), razzia), false)
  checks.push({
    case: "invalid new selection invalidates previous ticket",
    pass: true,
  })
  await page.screenshot({ path: path.join(dir, "actual-e-consumer.png") })
  await page.evaluate(() => window.qa.dispose())
  const status = await page.evaluate(() => window.qa.status())
  assert.equal(status.diagnostics.disposed, true)
  checks.push({
    case: "actual E renderer disposed on consumer teardown",
    pass: true,
  })
  assert.deepEqual(pageErrors, [])
  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        started,
        ended: new Date().toISOString(),
        pass: checks.length,
        fail: 0,
        browser: browser.version(),
        platform: process.platform,
        actualRenderer: "E native21 candidate only",
        executableAcceptance: false,
        noMediaRightsGrant: true,
        syntheticQaShellOnly: true,
        productionGArtifactNotSupplied: true,
        resourceShellSha256: sha(shell),
        artifacts: [...files].map(([url, bytes]) => ({
          url,
          bytes: bytes.length,
          sha256: sha(bytes),
        })),
        eBuildReceiptSha256: sha(
          fs.readFileSync(path.join(eRoot, "native-v2-build-receipt.json")),
        ),
        checks,
        pageErrors,
        deniedRequests: denied,
        status,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  )
  console.log(
    JSON.stringify({
      pass: checks.length,
      fail: 0,
      browser: browser.version(),
      pageErrors,
    }),
  )
} catch (error) {
  fs.writeFileSync(
    path.join(dir, "browser-failure.json"),
    JSON.stringify(
      {
        started,
        ended: new Date().toISOString(),
        error: String(error),
        stack: error.stack,
        checks,
        pageErrors,
        deniedRequests: denied,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  )
  throw error
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
