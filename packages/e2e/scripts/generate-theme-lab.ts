/** Remote-only original Canvas artwork. No existing artwork is transformed. */
import { chromium } from "@playwright/test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"

if (process.env.TADAZZ_REMOTE_QA !== "1") throw new Error("Remote QA only")
const root = resolve(import.meta.dirname, "../../..")
const classic = JSON.parse(
  readFileSync(
    resolve(root, "extensions/src/core/show-themes/classic.manifest.json"),
    "utf8",
  ),
)
const browser = await chromium.launch({ headless: true })
try {
  for (const [slug, title, colors] of [
    ["cosmic", "Cosmic Night", ["#041128", "#102f64", "#51e2ff", "#eea7ff"]],
    ["jade", "Jade Studio", ["#03201f", "#075449", "#9af5c9", "#f8d886"]],
  ] as const) {
    const directory = resolve(
      root,
      `packages/web/public/tadazz-show/demos/${slug}/v1`,
    )
    mkdirSync(directory, { recursive: true })
    const page = await browser.newPage()
    await page.addInitScript("globalThis.__name = (target) => target")
    await page.goto("about:blank")
    const generated = await page.evaluate(
      async ({ slug, title, colors }) => {
        const canvas = document.createElement("canvas")
        canvas.width = 1920
        canvas.height = 1080
        const ctx = canvas.getContext("2d")!
        function draw(t: number) {
          const g = ctx.createLinearGradient(0, 0, 1920, 1080)
          g.addColorStop(0, colors[1])
          g.addColorStop(0.5, colors[0])
          g.addColorStop(1, colors[1])
          ctx.fillStyle = g
          ctx.fillRect(0, 0, 1920, 1080)
          ctx.strokeStyle = colors[2]
          ctx.lineWidth = 3
          if (slug === "cosmic") {
            for (let i = 0; i < 110; i++) {
              const x = (i * 431 + 79) % 1920,
                y = (i * 193 + 37) % 1080
              ctx.globalAlpha = 0.18 + (i % 6) / 10
              ctx.fillStyle = colors[2]
              ctx.beginPath()
              ctx.arc(x, y, 1 + (i % 3), 0, Math.PI * 2)
              ctx.fill()
            }
            ctx.globalAlpha = 0.45
            for (let i = 0; i < 4; i++) {
              ctx.beginPath()
              ctx.ellipse(
                1800,
                120,
                200 + i * 80,
                400 + i * 70,
                -0.6 + t * 0.04,
                0,
                Math.PI * 2,
              )
              ctx.stroke()
            }
          } else {
            ctx.globalAlpha = 0.25
            for (let i = 0; i < 9; i++) {
              ctx.save()
              ctx.translate(80 + i * 230, 1020)
              ctx.rotate(-0.5 + t * 0.02)
              ctx.strokeRect(-110, -110, 220, 220)
              ctx.restore()
            }
            ctx.lineWidth = 12
            ctx.globalAlpha = 0.65
            ctx.beginPath()
            ctx.moveTo(0, 70)
            ctx.lineTo(420 + t * 20, 70)
            ctx.stroke()
          }
          ctx.globalAlpha = 1
        }
        draw(0)
        const background = canvas.toDataURL("image/png").split(",")[1]
        const logo = document.createElement("canvas")
        logo.width = 640
        logo.height = 180
        const l = logo.getContext("2d")!
        l.fillStyle = colors[2]
        l.font = "bold 90px sans-serif"
        l.textAlign = "center"
        l.fillText("TADAZZ", 320, 92)
        l.fillStyle = "#ffffff"
        l.font = "28px sans-serif"
        l.fillText(title.toUpperCase(), 320, 146)
        const logoPng = logo.toDataURL("image/png").split(",")[1]
        const stream = canvas.captureStream(25)
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm"
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 1500000,
        })
        const chunks: Blob[] = []
        recorder.ondataavailable = (e) => chunks.push(e.data)
        const stopped = new Promise<void>((resolve) => {
          recorder.onstop = () => resolve()
        })
        recorder.start()
        const started = performance.now()
        await new Promise<void>((resolve) => {
          function frame() {
            const t = (performance.now() - started) / 1000
            draw(t)
            ctx.globalAlpha = Math.min(1, t)
            ctx.drawImage(logo, 640, 450)
            ctx.globalAlpha = 1
            if (t < 3) requestAnimationFrame(frame)
            else resolve()
          }
          frame()
        })
        recorder.stop()
        await stopped
        stream.getTracks().forEach((track) => track.stop())
        const video = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(",")[1])
          reader.readAsDataURL(new Blob(chunks, { type: mimeType }))
        })
        return { background, logo: logoPng, video }
      },
      { slug, title, colors },
    )
    writeFileSync(
      resolve(directory, "backdrop.png"),
      Buffer.from(generated.background, "base64"),
    )
    writeFileSync(
      resolve(directory, "logo.png"),
      Buffer.from(generated.logo, "base64"),
    )
    writeFileSync(
      resolve(directory, "opening.webm"),
      Buffer.from(generated.video, "base64"),
    )
    // An original restrained ring overlay, with no external Lottie resources.
    writeFileSync(
      resolve(directory, "opening.json"),
      JSON.stringify({
        v: "5.7.4",
        fr: 25,
        ip: 0,
        op: 75,
        w: 1920,
        h: 1080,
        nm: `${title} rings`,
        ddd: 0,
        assets: [],
        layers: [
          {
            ddd: 0,
            ind: 1,
            ty: 4,
            nm: "ring",
            sr: 1,
            ks: {
              o: {
                a: 1,
                k: [
                  { t: 0, s: [0] },
                  { t: 15, s: [45] },
                  { t: 60, s: [45] },
                  { t: 74, s: [0] },
                ],
              },
              r: { a: 0, k: 0 },
              p: { a: 0, k: [960, 540, 0] },
              a: { a: 0, k: [0, 0, 0] },
              s: { a: 0, k: [100, 100, 100] },
            },
            shapes: [
              {
                ty: "el",
                p: { a: 0, k: [0, 0] },
                s: { a: 0, k: [600, 600] },
                nm: "ellipse",
              },
              {
                ty: "st",
                c: { a: 0, k: [0.5, 0.9, 0.9, 1] },
                o: { a: 0, k: 70 },
                w: { a: 0, k: 2 },
                lc: 2,
                lj: 2,
                nm: "outline",
              },
            ],
            ip: 0,
            op: 75,
            st: 0,
            bm: 0,
          },
        ],
      }),
    )
    const theme = JSON.parse(
      JSON.stringify(classic).replaceAll(
        "tadazz-classic.",
        `tadazz-demo-${slug}.`,
      ),
    )
    theme.id = `tadazz-demo-${slug}`
    theme.kind = "declarative"
    theme.nameKey = `demo.${slug}.name`
    theme.descriptionKey = `demo.${slug}.description`
    theme.provenance =
      "Operator-owned isolated demonstration. Original Canvas artwork; existing trusted Classic choreography and repository audio. Not a customer-published package."
    const descriptions = {
      en: "Demonstration using Classic choreography.",
      fr: "Démonstration utilisant la chorégraphie Classic.",
      de: "Demonstration mit Classic-Choreografie.",
      es: "Demostración con coreografía Classic.",
      it: "Dimostrazione con coreografia Classic.",
      ja: "Classic の演出を使用したデモ。",
      tr: "Classic koreografisini kullanan demo.",
      vi: "Bản trình diễn sử dụng chuyển động Classic.",
    }
    theme.localizations = Object.fromEntries(
      Object.entries(descriptions).map(([locale, description]) => [
        locale,
        { [theme.nameKey]: title, [theme.descriptionKey]: description },
      ]),
    )
    const keys = new Set(
      [
        ...Object.values(theme.slots),
        ...Object.values(theme.audioEvents),
      ].flatMap((entry: any) => entry.variants.map((v: any) => v.labelKey)),
    )
    for (const [locale, labels] of Object.entries(theme.localizations) as [
      string,
      Record<string, string>,
    ][]) {
      const source = JSON.parse(
        readFileSync(
          resolve(root, `extensions/src/locales/${locale}/extensions.json`),
          "utf8",
        ),
      )
      for (const key of keys as Set<string>)
        labels[key] = key
          .replace("extensions:", "")
          .split(".")
          .reduce((value, part) => value[part], source)
    }
    theme.tokens.background = colors[0]
    theme.tokens.foreground = "#ffffff"
    theme.tokens.accent = colors[2]
    theme.tokens.fontId = "rubik"
    theme.tokens.palette = {
      night: colors[0],
      purple: colors[1],
      violet: colors[2],
      pink: colors[3],
      blue: colors[2],
      royal: colors[1],
      lime: colors[3],
      gold: colors[3],
      cream: "#ffffff",
      ink: colors[0],
    }
    const replacements: Record<string, string> = {
      "classic-poster": "backdrop.png",
      "classic-backdrop": "backdrop.png",
      "classic-logo": "logo.png",
      "classic-opening-video": "opening.webm",
      "classic-opening-lottie": "opening.json",
      "classic-adapter-a27be4883ee9": "backdrop.png",
    }
    for (const asset of theme.assets) {
      const filename = replacements[asset.id]
      if (!filename) continue
      const bytes = readFileSync(resolve(directory, filename))
      asset.url = `/tadazz-show/demos/${slug}/v1/${filename}`
      asset.bytes = bytes.length
      asset.sha256 = createHash("sha256").update(bytes).digest("hex")
      asset.rights = "owner-authorized"
      asset.provenance =
        "Original source-generated Canvas/Lottie artwork for the authorized isolated demo."
    }
    if (slug === "jade")
      for (const event of Object.values(theme.audioEvents) as any[]) {
        for (const variant of event.variants)
          variant.volume = Math.min(0.35, variant.volume)
      }
    const manifests = resolve(
      root,
      "extensions/src/server/show-themes/demo-themes",
    )
    mkdirSync(manifests, { recursive: true })
    writeFileSync(
      resolve(manifests, `${slug}.manifest.json`),
      JSON.stringify(theme, null, 2) + "\n",
    )
    await page.close()
    console.log(`Generated ${title}`)
  }
} finally {
  await browser.close()
}
