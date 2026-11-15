// QA page only. The private server owns all URLs and response bytes.
const config = await (await fetch("/qa/config")).json()
const host = document.querySelector("#host")
const shadow = host.attachShadow({ mode: "open" })
const sheet = document.createElement("link")
sheet.rel = "stylesheet"
sheet.href = "/renderer.css"
sheet.integrity = config.cssIntegrity
sheet.crossOrigin = "anonymous"
const sheetReady = new Promise((resolve, reject) => {
  sheet.onload = resolve
  sheet.onerror = () => reject(new Error("qa:css-integrity"))
})
shadow.append(sheet)
await sheetReady
const script = document.createElement("script")
script.type = "module"
script.src = "/renderer.js"
script.integrity = config.jsIntegrity
script.crossOrigin = "anonymous"
const scriptReady = new Promise((resolve, reject) => {
  script.onload = resolve
  script.onerror = () => reject(new Error("qa:js-integrity"))
})
document.head.append(script)
await scriptReady
// A separate import needs its own verification argument in production. This
// test relies on the QA server's immutable verified-byte buffers and captures
// request logs; module-map reuse is measured, not assumed.
const { mountPreviewCandidate } = await import("/renderer.js")
const mount = document.createElement("div")
mount.style.cssText = "width:960px;height:540px;position:relative"
shadow.append(mount)
let failures = 0
let renderer = mountPreviewCandidate(mount, () => { failures += 1 })
const initialStage = () => shadow.querySelector('[data-testid="tadazz-stage"]')
window.__showPreviewQa = Object.freeze({
  async show({ role = "spectator", locale = "en", phase = "question", question = 0, paused = false, elapsed = 5000 } = {}) {
    const params = new URLSearchParams({ role, locale, phase, question: String(question), paused: String(paused), elapsed: String(elapsed) })
    const response = await fetch(`/qa/frame?${params}`)
    if (!response.ok) throw new Error(`qa:frame:${response.status}`)
    const frame = await response.json()
    renderer.update({ frame, locale, reducedMotion: false })
  },
  stage: initialStage,
  shadow: () => shadow,
  failures: () => failures,
  dispose() { renderer.dispose() },
})
document.documentElement.dataset.qaReady = "true"
