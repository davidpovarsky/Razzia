// Original geometric art for Tadazz's public catalogue. No third-party imagery.
// Run on Linux with the repository Playwright browser runtime available.
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(
  process.env.GALLERY_PLAYWRIGHT_PACKAGE || "/cleanup/extensions/package.json",
)
const { chromium } = require("@playwright/test")
const output = process.env.GALLERY_ART_OUTPUT || "/art/output"
await mkdir(output, { recursive: true })

const palettes = {
  crowd: ["#18133c", "#702d9a", "#57e9ff", "#ef9fc3"],
  quiz: ["#071827", "#143a58", "#e8be69", "#94c9d6"],
  story: ["#12372b", "#3a6553", "#f4c983", "#a6d3a8"],
  picture: ["#132563", "#3d4ba6", "#ffaf8d", "#8edbdc"],
  truth: ["#093b3e", "#17645d", "#c5ef88", "#82d5c9"],
  finale: ["#2c1738", "#65404e", "#f5c96b", "#e7c2d4"],
  family: ["#3d2435", "#774957", "#ffbf91", "#c8dcaf"],
  classroom: ["#102e58", "#245a83", "#8bdced", "#f6d78a"],
  team: ["#102e35", "#27616a", "#ffad98", "#9bd9d5"],
}
const star = (x, y, r, fill, opacity = 1) => {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = ((i * 36 - 90) * Math.PI) / 180
    const radius = i % 2 ? r * 0.42 : r

    return `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`
  }).join(" ")

  return `<polygon points="${points}" fill="${fill}" opacity="${opacity}"/>`
}
const circle = (x, y, r, colour, opacity = 1, stroke = false, width = 2) =>
  `<circle cx="${x}" cy="${y}" r="${r}" ${stroke ? `fill="none" stroke="${colour}" stroke-width="${width}"` : `fill="${colour}"`} opacity="${opacity}"/>`
const rect = (x, y, w, h, r, colour, opacity = 1, rotation = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${colour}" opacity="${opacity}" transform="rotate(${rotation} ${x + w / 2} ${y + h / 2})"/>`

function decoration(id, [night, mid, accent, secondary]) {
  switch (id) {
    case "quiz":
      return `<g fill="none" stroke="${accent}" opacity=".26" stroke-width="2">
        <path d="M60 805V225a160 160 0 0 1 320 0v580M84 805V225a136 136 0 0 1 272 0v580M108 805V225a112 112 0 0 1 224 0v580"/>
        <path d="M1220 100v580a160 160 0 0 0 320 0V100M1244 100v580a136 136 0 0 0 272 0V100M1268 100v580a112 112 0 0 0 224 0V100"/>
        <path d="M40 40h1520v820H40zM54 54h1492v792H54z" opacity=".45"/></g>
        ${star(1310, 180, 34, accent, 0.7)}${star(292, 720, 16, secondary, 0.55)}
        ${circle(226, 220, 66, accent, 0.12)}${circle(1378, 682, 64, secondary, 0.08)}`

    case "story":
      return `<g fill="${secondary}" opacity=".12">
        <path d="M0 900V370C130 460 170 660 100 900ZM1600 900V320c-140 160-180 380-100 580Z"/>
        <ellipse cx="70" cy="130" rx="165" ry="65" transform="rotate(35 70 130)"/>
        <ellipse cx="1560" cy="120" rx="160" ry="58" transform="rotate(-35 1560 120)"/>
        <ellipse cx="125" cy="780" rx="155" ry="48" transform="rotate(-30 125 780)"/>
        <ellipse cx="1480" cy="810" rx="160" ry="50" transform="rotate(30 1480 810)"/>
        </g><path d="M-60 830Q420 660 850 840T1700 760V900H0" fill="${accent}" opacity=".09"/>
        ${Array.from({ length: 20 }, (_, i) => star(80 + ((i * 137) % 1460), 75 + ((i * 97) % 750), 3 + (i % 3), accent, 0.2 + (i % 4) * 0.08)).join("")}
        <path d="M126 288q100-78 170 0v135q-70-76-170 0zm170 0q100-78 170 0v135q-70-76-170 0z" fill="${accent}" opacity=".12"/>`

    case "picture":
      return `${rect(-90, 85, 340, 340, 48, accent, 0.24, -14)}${rect(25, 72, 250, 250, 32, secondary, 0.25, 12)}
        ${rect(1310, 530, 330, 330, 50, secondary, 0.21, 14)}${rect(1350, 580, 220, 220, 30, accent, 0.23, -9)}
        <path d="M1490 0h110v310Z" fill="${accent}" opacity=".25"/>
        <path d="M0 900V710l220 190Z" fill="${secondary}" opacity=".20"/>
        ${circle(1420, 165, 60, accent, 0.22, true, 16)}${circle(250, 760, 43, secondary, 0.26)}
        ${star(1260, 100, 24, accent, 0.4)}`

    case "truth":
      return `<defs><pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">${circle(2, 2, 1.3, secondary, 0.13)}</pattern></defs>
        <rect width="1600" height="900" fill="url(#grid)"/>
        <g fill="none" stroke="${accent}" opacity=".24" stroke-width="3">
        <path d="M60 140l80-46 80 46v92l-80 46-80-46zm1250 545l95-55 95 55v110l-95 55-95-55z"/>
        <path d="M146 400h140m-70-70v140M1280 160h120m-60-60v120"/>
        </g>${circle(135, 715, 90, secondary, 0.17, true, 3)}${circle(135, 715, 45, accent, 0.18, true, 3)}
        ${circle(1400, 395, 26, accent, 0.35)}${star(350, 120, 13, secondary, 0.28)}`

    case "finale":
      return `<g fill="${accent}" opacity=".10"><path d="M0 0h230l510 900H580ZM1600 0h-230L860 900h160Z"/></g>
        <g fill="none" stroke="${accent}" opacity=".22" stroke-width="2"><path d="M40 40h1520v820H40z"/><path d="M40 160h150L340 40m1070 0-150 120h300M40 740h150l150 120m1070 0-150-120h300"/></g>
        ${Array.from({ length: 18 }, (_, i) => star(80 + ((i * 173) % 1450), 70 + ((i * 131) % 730), 5 + (i % 4) * 3, accent, 0.18 + (i % 3) * 0.08)).join("")}
        ${circle(800, 800, 470, accent, 0.1, true, 2)}${circle(800, 800, 490, accent, 0.07, true, 2)}`

    case "family":
      return `<path d="M-30 120Q320-70 550 90T1110 80T1630 100" fill="none" stroke="${secondary}" stroke-width="3" opacity=".2"/>
        ${Array.from({ length: 14 }, (_, i) => `<path d="M${i * 120 - 15} ${80 + Math.sin(i) * 30}l28 65 45-63Z" fill="${i % 2 ? secondary : accent}" opacity=".17"/>`).join("")}
        ${circle(40, 740, 210, accent, 0.12)}${circle(1540, 700, 220, secondary, 0.11)}
        ${Array.from({ length: 20 }, (_, i) => rect((i * 139) % 1550, 180 + ((i * 131) % 650), 8, 25, 3, i % 2 ? accent : secondary, 0.25, i * 29)).join("")}
        <path d="M1460 200c-45-50-100 10 0 85 100-75 45-135 0-85Z" fill="${accent}" opacity=".25"/>`

    case "classroom":
      return `<g fill="none" stroke="${accent}" opacity=".24" stroke-width="2">
        <ellipse cx="120" cy="195" rx="180" ry="58" transform="rotate(32 120 195)"/>
        <ellipse cx="120" cy="195" rx="180" ry="58" transform="rotate(-32 120 195)"/>
        <circle cx="120" cy="195" r="92"/>
        <path d="M1310 720l135-230 135 230zM1290 760h310"/>
        </g>${circle(120, 195, 24, secondary, 0.35)}${circle(1444, 196, 78, accent, 0.12)}
        ${Array.from({ length: 25 }, (_, i) => circle(60 + ((i * 173) % 1490), 60 + ((i * 89) % 790), 2.4, secondary, 0.23)).join("")}
        ${rect(88, 650, 155, 45, 8, secondary, 0.13, -12)}${rect(118, 700, 155, 45, 8, accent, 0.14, 8)}`

    case "team":
      return `<g stroke="${secondary}" opacity=".18" stroke-width="3" fill="none"><path d="M85 150l205 110-150 190m150-190 80-180M1475 710l-195-110 150-190m-150 190-85 180"/></g>
        ${rect(25, 90, 120, 120, 30, accent, 0.22, -7)}${rect(230, 200, 120, 120, 30, secondary, 0.22, 8)}${rect(90, 390, 110, 110, 28, accent, 0.15, -8)}
        ${rect(1410, 650, 120, 120, 30, secondary, 0.22, 8)}${rect(1220, 540, 120, 120, 30, accent, 0.2, -8)}${rect(1380, 345, 110, 110, 28, secondary, 0.15, 7)}
        ${circle(1295, 125, 35, accent, 0.25)}${circle(345, 770, 28, secondary, 0.25)}`

    default:
      return `${circle(120, 140, 230, accent, 0.12)}${circle(120, 140, 170, accent, 0.19, true, 3)}${circle(120, 140, 125, accent, 0.15, true, 3)}
        ${circle(1510, 730, 270, secondary, 0.14)}${circle(1510, 730, 210, accent, 0.18, true, 3)}${circle(1510, 730, 150, accent, 0.13, true, 3)}
        ${rect(1260, 50, 390, 28, 14, accent, 0.2, -32)}${rect(-140, 735, 430, 28, 14, secondary, 0.2, -32)}
        ${star(1380, 170, 22, secondary, 0.4)}${star(260, 700, 16, accent, 0.4)}`
  }
}

function backdrop(id, colors) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs><linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient>
    <radialGradient id="shade"><stop stop-color="${colors[0]}" stop-opacity=".02"/><stop offset=".55" stop-color="${colors[0]}" stop-opacity=".17"/><stop offset="1" stop-color="${colors[0]}" stop-opacity=".52"/></radialGradient>
    <radialGradient id="light" cx=".5" cy="0" r="1"><stop stop-color="${colors[2]}" stop-opacity=".07"/><stop offset=".7" stop-color="${colors[2]}" stop-opacity="0"/></radialGradient></defs>
    <rect width="1600" height="900" fill="url(#base)"/><rect width="1600" height="900" fill="url(#light)"/>
    ${decoration(id, colors)}<rect width="1600" height="900" fill="url(#shade)"/>
  </svg>`
}

const colours = {
  ink: "#183052",
  blue: "#447bd4",
  coral: "#ee8c78",
  cream: "#fff3d8",
  mint: "#77c5b9",
  yellow: "#f2c660",
}
function icon(name) {
  const c = colours
  const shapes = {
    triangle: `<path d="M256 100L422 392H90Z" fill="${c.coral}" stroke="${c.ink}" stroke-width="12" stroke-linejoin="round"/>`,
    square: `<rect x="122" y="122" width="268" height="268" rx="20" fill="${c.blue}" stroke="${c.ink}" stroke-width="12"/>`,
    circle:
      circle(256, 256, 142, c.mint) + circle(256, 256, 142, c.ink, 1, true, 12),
    star: `${star(
      256,
      260,
      175,
      c.yellow,
    )}<path d="M256 85l48 109 118 15-87 79 25 116-104-59-104 59 25-116-87-79 118-15Z" fill="none" stroke="${c.ink}" stroke-width="12" stroke-linejoin="round"/>`,
    sun: `${Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6

      return `<path d="M${256 + Math.cos(a) * 135} ${256 + Math.sin(a) * 135}l${Math.cos(a) * 40} ${Math.sin(a) * 40}" stroke="${c.ink}" stroke-width="14" stroke-linecap="round"/>`
    }).join(
      "",
    )}${circle(256, 256, 100, c.yellow)}${circle(256, 256, 100, c.ink, 1, true, 12)}`,
    cloud: `<path d="M120 350c-88-8-77-118-4-126-5-112 158-142 192-49 100-30 156 113 59 154-30 13-58 21-91 21Z" fill="#ffffff" stroke="${c.ink}" stroke-width="12" stroke-linejoin="round"/><path d="M178 379l-16 35m98-35-16 35m98-35-16 35" stroke="${c.blue}" stroke-width="14" stroke-linecap="round"/>`,
    umbrella: `<path d="M256 105v291c0 61 81 61 81 5" fill="none" stroke="${c.ink}" stroke-width="13" stroke-linecap="round"/><path d="M84 270a172 172 0 0 1 344 0q-44-43-86 0-43-43-86 0-43-43-86 0-43-43-86 0Z" fill="${c.coral}" stroke="${c.ink}" stroke-width="12"/><path d="M256 100q-70 100-86 170m86-170q70 100 86 170" fill="none" stroke="${c.ink}" stroke-width="9"/>`,
    balloon: `<path d="M256 333c-90-40-140-168-65-218 139-92 255 112 65 218Z" fill="${c.coral}" stroke="${c.ink}" stroke-width="12"/><path d="M242 335h28l-14-25Z" fill="${c.ink}"/><path d="M256 335c55 32-45 55 0 115" fill="none" stroke="${c.ink}" stroke-width="9" stroke-linecap="round"/><path d="M207 146q-35 23-32 61" fill="none" stroke="${c.cream}" stroke-width="15" stroke-linecap="round"/>`,
    leaf: `<path d="M127 385C64 181 225 110 401 90c9 202-79 342-274 295Z" fill="${c.mint}" stroke="${c.ink}" stroke-width="12"/><path d="M100 425L350 145m-179 200-26-103m69 52 104 4m-59-65-14-89" fill="none" stroke="${c.ink}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
    boat: `<path d="M73 335h366l-55 69H128Z" fill="${c.coral}" stroke="${c.ink}" stroke-width="12" stroke-linejoin="round"/><path d="M261 86v247" stroke="${c.ink}" stroke-width="12" stroke-linecap="round"/><path d="M244 103L96 304h148Z" fill="${c.cream}" stroke="${c.ink}" stroke-width="11" stroke-linejoin="round"/><path d="M282 137l115 165H282Z" fill="${c.yellow}" stroke="${c.ink}" stroke-width="11" stroke-linejoin="round"/><path d="M70 440q46-20 92 0t92 0t92 0t92 0" fill="none" stroke="${c.blue}" stroke-width="11" stroke-linecap="round"/>`,
    bicycle: `${circle(132, 340, 74, c.cream)}${circle(132, 340, 74, c.ink, 1, true, 12)}${circle(384, 340, 74, c.cream)}${circle(384, 340, 74, c.ink, 1, true, 12)}<path d="M132 340l78-150 58 150H132l108-117h96l48 117m-48-117-18-70h48M175 185h70" fill="none" stroke="${c.ink}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M132 340l108-117h96l-68 117Z" fill="none" stroke="${c.coral}" stroke-width="11" stroke-linejoin="round"/>`,
    rocket: `<path d="M207 346q-23 76 49 110 72-34 49-110Z" fill="${c.yellow}" stroke="${c.ink}" stroke-width="10"/><path d="M197 245l-70 100 65-10m123-90 70 100-65-10" fill="${c.coral}" stroke="${c.ink}" stroke-width="11" stroke-linejoin="round"/><path d="M256 62q-110 100-65 289h130q45-189-65-289Z" fill="${c.cream}" stroke="${c.ink}" stroke-width="12"/>${circle(256, 217, 48, c.blue)}${circle(256, 217, 48, c.ink, 1, true, 10)}<path d="M210 128q45-16 92 0" fill="none" stroke="${c.ink}" stroke-width="10"/>`,
    train: `<rect x="125" y="85" width="262" height="309" rx="50" fill="${c.blue}" stroke="${c.ink}" stroke-width="12"/><rect x="156" y="140" width="200" height="116" rx="18" fill="${c.cream}" stroke="${c.ink}" stroke-width="10"/><path d="M256 143v110M192 100h128" stroke="${c.ink}" stroke-width="10" stroke-linecap="round"/>${circle(186, 324, 21, c.yellow)}${circle(326, 324, 21, c.yellow)}<path d="M172 394l-45 61m213-61 45 61m-246-18h234" fill="none" stroke="${c.ink}" stroke-width="13" stroke-linecap="round"/>`,
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="36" fill="#f7f2e8"/>${circle(256, 256, 220, "#eee5d5", 0.5)}${shapes[name]}</svg>`
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
})
const assets = []
async function render(name, svg, width, height) {
  await page.setViewportSize({ width, height })
  await page.setContent(
    `<html><head><style>html,body{padding:0;margin:0;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`,
  )
  const filename = path.join(output, `${name}.png`)
  await writeFile(path.join(output, `${name}.svg`), svg)
  await page.screenshot({ path: filename, type: "png" })
  const bytes = await readFile(filename)
  assets.push({
    name,
    url: `/tadazz-show/gallery/${name}.png`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  })
}
for (const [id, colors] of Object.entries(palettes)) {
  await render(`${id}-backdrop`, backdrop(id, colors), 1600, 900)
}
for (const name of [
  "triangle",
  "square",
  "circle",
  "star",
  "sun",
  "cloud",
  "umbrella",
  "balloon",
  "leaf",
  "boat",
  "bicycle",
  "rocket",
  "train",
]) {
  await render(`picture-${name}`, icon(name), 512, 512)
}
await browser.close()
await writeFile(
  path.join(output, "gallery-assets.json"),
  `${JSON.stringify(assets, null, 2)}\n`,
)
console.log(
  JSON.stringify({
    assetCount: assets.length,
    totalBytes: assets.reduce((a, v) => a + v.bytes, 0),
    output,
  }),
)
