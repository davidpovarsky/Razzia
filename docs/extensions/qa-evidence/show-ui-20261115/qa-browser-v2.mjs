// Private V2 fixture only. The server verifies and buffers the exact output bytes.
const config = await (await fetch("/qa/config")).json()
// The isolated host supplies the same upstream font CSS as the main app.
// Decode every admitted face before exposing a renderer; failures stay closed.
if (config.fontCssIntegrity) {
  const fonts = document.createElement("link")
  fonts.rel = "stylesheet"
  fonts.href = "/fonts/rubik-wght.css"
  fonts.integrity = config.fontCssIntegrity
  fonts.crossOrigin = "anonymous"
  const ready = new Promise((resolve, reject) => {
    fonts.onload = resolve
    fonts.onerror = () => reject(new Error("qa:font-css-integrity"))
  })
  document.head.append(fonts)
  await ready
  const faces = [...document.fonts].filter(
    (face) => face.family.replaceAll(/["']/gu, "") === "Rubik Variable",
  )
  if (faces.length !== 6) throw new Error("qa:font-face-count")
  try {
    await Promise.all(faces.map((face) => face.load()))
  } catch {
    throw new Error("qa:font-decode")
  }
}

const shadow = document.querySelector("#host").attachShadow({ mode: "open" })
const sheet = document.createElement("link")
sheet.rel = "stylesheet"
sheet.href = "/renderer.css"
sheet.integrity = config.cssIntegrity
sheet.crossOrigin = "anonymous"
const styled = new Promise((resolve, reject) => {
  sheet.onload = resolve
  sheet.onerror = () => reject(new Error("qa:css-integrity"))
})
shadow.append(sheet)
await styled
const jitlessBefore = globalThis.__zod_globalConfig?.jitless ?? null
const script = document.createElement("script")
script.type = "module"
script.src = "/renderer.js"
script.integrity = config.jsIntegrity
script.crossOrigin = "anonymous"
const loaded = new Promise((resolve, reject) => {
  script.onload = resolve
  script.onerror = () => reject(new Error("qa:js-integrity"))
})
document.head.append(script)
await loaded
// Separate import is justified here by the fixture's immutable verified buffers;
// this does not establish a production loader admission or compiled pin.
const { mountCompositionPreviewCandidateV2 } = await import("/renderer.js")
const jitlessAfter = globalThis.__zod_globalConfig?.jitless ?? null
const mount = document.createElement("div")
mount.style.cssText =
  "width:960px;height:540px;position:relative;container-type:inline-size"
shadow.append(mount)
let failures = 0,
  last = null
const renderer = mountCompositionPreviewCandidateV2(mount, () => failures++)
window.__v2Qa = Object.freeze({
  async show(values = {}) {
    const response = await fetch(`/qa/input-v2?${new URLSearchParams(values)}`)
    if (!response.ok) throw new Error(`qa:v2-input:${response.status}`)
    const input = await response.json()
    renderer.update(input)
    last = input
    return input
  },
  rejectMutation(kind) {
    if (!last) throw new Error("qa:no-v2-input")
    const input = structuredClone(last)
    if (kind === "digest") input.themeBinding.definitionSha256 = "0".repeat(64)
    else if (kind === "variant")
      input.themeBinding.slots.question.variantId = `${input.themeBinding.theme.id}.question.fabricated`
    else if (kind === "version") delete input.inputVersion
    else throw new Error("qa:unknown-mutation")
    try {
      renderer.update(input)
      return null
    } catch (error) {
      return error.message
    }
  },
  diagnostics: () => ({
    ...renderer.diagnostics(),
    jitlessBefore,
    jitlessAfter,
    failures,
  }),
  resize(width, height) {
    mount.style.width = `${width}px`
    mount.style.height = `${height}px`
  },
  dispose() {
    renderer.dispose()
  },
})
document.documentElement.dataset.qaReady = "true"
