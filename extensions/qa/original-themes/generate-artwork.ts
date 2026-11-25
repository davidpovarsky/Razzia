/** Original first-party vector art. Rendering executes only in isolated Linux QA. */
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createRequire } from "node:module"
import {
  ORIGINAL_THEME_STYLES,
  type OriginalThemeId,
  type OriginalThemeStyle,
} from "../../src/core/show-themes/original-theme-families"

if (process.platform !== "linux" || process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error(
    "Original theme artwork must be rendered in authorized isolated Linux QA",
  )
}

const root = resolve(import.meta.dirname, "../../..")
const require = createRequire(resolve(root, "packages/e2e/package.json"))
const { chromium } =
  require("@playwright/test") as typeof import("@playwright/test")
const sourceDir = resolve(root, "extensions/site-assets/originals")
const publicRoot = resolve(root, "packages/web/public/tadazz-show/originals")
mkdirSync(sourceDir, { recursive: true })
mkdirSync(publicRoot, { recursive: true })

const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
const star = ({
  x,
  y,
  size,
  color,
  opacity = 0.7,
}: {
  x: number
  y: number
  size: number
  color: string
  opacity?: number
}) =>
  `<path d="M${x} ${y - size} Q${x + size * 0.18} ${y - size * 0.18} ${x + size} ${y} Q${x + size * 0.18} ${y + size * 0.18} ${x} ${y + size} Q${x - size * 0.18} ${y + size * 0.18} ${x - size} ${y} Q${x - size * 0.18} ${y - size * 0.18} ${x} ${y - size}Z" fill="${color}" opacity="${opacity}"/>`
const dots = (color: string, count: number, opacity = 0.3) =>
  Array.from(
    { length: count },
    (_, i) =>
      `<circle cx="${(i * 479 + 87) % 1920}" cy="${(i * 197 + 61) % 1080}" r="${(i % 3) + 1}" fill="${color}" opacity="${opacity}"/>`,
  ).join("")

const environments: Record<
  OriginalThemeId,
  (style: OriginalThemeStyle) => string
> = {
  "royal-quiz": ({ accent, secondary }) => `
    <path d="M95 1080V480C95 15 1825 15 1825 480V1080M135 1080V490C135 65 1785 65 1785 490V1080" fill="none" stroke="${accent}" stroke-width="2" opacity=".43"/>
    <path d="M170 1080V510C170 110 1750 110 1750 510V1080" fill="none" stroke="${accent}" stroke-width="13" opacity=".09"/>
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M${115 + i * 12} 240V1040M${1805 - i * 12} 240V1040" stroke="${accent}" opacity="${0.08 + i * 0.02}"/>`).join("")}
    <ellipse cx="960" cy="1080" rx="820" ry="145" fill="${secondary}" opacity=".05"/><ellipse cx="960" cy="1080" rx="800" ry="90" fill="none" stroke="${accent}" opacity=".25"/>
    <path d="M250 0L850 1080H650Z M1670 0L1070 1080H1270Z" fill="url(#light)" opacity=".08"/>
    ${star({ x: 960, y: 120, size: 25, color: accent, opacity: 0.6 })}${star({ x: 220, y: 420, size: 10, color: accent, opacity: 0.4 })}${star({ x: 1700, y: 420, size: 10, color: accent, opacity: 0.4 })}${dots(accent, 45, 0.2)}`,
  "neon-arcade": ({ accent, secondary }) => `
    <path d="M60 0V160H205V300H70V765H195V1080M1860 0V160H1715V300H1850V765H1725V1080" fill="none" stroke="${accent}" stroke-width="3" opacity=".42"/>
    <path d="M80 0V140H225V320H90V745H215V1080M1840 0V140H1695V320H1830V745H1705V1080" fill="none" stroke="${secondary}" opacity=".28"/>
    ${Array.from({ length: 15 }, (_, i) => `<path d="M960 690L${-400 + i * 200} 1080" stroke="${accent}" opacity=".16"/>`).join("")}
    ${[720, 760, 810, 880, 970, 1060].map((y) => `<path d="M0 ${y}H1920" stroke="${accent}" opacity=".12"/>`).join("")}
    ${[120, 340, 560, 780].map((y, i) => `<rect x="75" y="${y}" width="8" height="36" fill="${i % 2 ? accent : secondary}"/><rect x="1837" y="${y + 90}" width="8" height="36" fill="${i % 2 ? secondary : accent}"/>`).join("")}
    <path d="M430 80H1490L1540 130H380Z" fill="${accent}" opacity=".07"/>${dots(accent, 70, 0.18)}`,
  "retro-tv": ({ accent, secondary }) => `
    <path d="M0 0H1920V1080H0Z" fill="#613e2b" opacity=".22"/>
    ${[0, 1, 2, 3].map((i) => `<circle cx="100" cy="180" r="${180 + i * 75}" fill="none" stroke="${i % 2 ? secondary : accent}" stroke-width="28" opacity=".14"/>`).join("")}
    ${[0, 1, 2].map((i) => `<rect x="${1440 + i * 54}" y="${480 + i * 54}" width="${600 - i * 108}" height="${700 - i * 108}" rx="${150 - i * 25}" fill="none" stroke="${i % 2 ? secondary : accent}" stroke-width="20" opacity=".16"/>`).join("")}
    <path d="M0 985H1920V1080H0Z" fill="#1e1c18" opacity=".5"/>
    ${[120, 400, 680, 960, 1240, 1520, 1800].map((x, i) => `<rect x="${x}" y="45" width="90" height="14" rx="7" fill="${i % 2 ? secondary : accent}" opacity=".5"/>`).join("")}
    <path d="M1450 0L1810 480M1490 0L1850 480" stroke="#fff4c8" stroke-width="2" opacity=".1"/>`,
  "magic-storybook": ({ accent, secondary }) => `
    <path d="M0 0H225C135 160 235 300 115 490C245 720 105 880 230 1080H0Z M1920 0H1695C1785 160 1685 300 1805 490C1675 720 1815 880 1690 1080H1920Z" fill="#071e1a" opacity=".75"/>
    ${Array.from({ length: 8 }, (_, i) => `<path d="M${35 + i * 17} ${i * 140 - 20}Q${250 - i * 8} ${i * 140 + 10} ${85 + i * 10} ${i * 140 + 100}Q${30 + i * 10} ${i * 140 + 50} ${35 + i * 17} ${i * 140 - 20}Z" fill="${secondary}" opacity="${0.04 + (i % 3) * 0.035}"/><path d="M${1885 - i * 17} ${i * 140 - 20}Q${1670 + i * 8} ${i * 140 + 10} ${1835 - i * 10} ${i * 140 + 100}Q${1890 - i * 10} ${i * 140 + 50} ${1885 - i * 17} ${i * 140 - 20}Z" fill="${secondary}" opacity="${0.04 + (i % 3) * 0.035}"/>`).join("")}
    <path d="M180 1020Q580 930 960 1020Q1340 930 1740 1020" fill="none" stroke="${accent}" stroke-width="2" opacity=".35"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => star({ x: 160 + i * 230, y: 100 + (i % 3) * 65, size: 7 + (i % 4), color: accent, opacity: 0.3 })).join("")}${dots(accent, 90, 0.2)}`,
  "crystal-future": ({ accent, secondary }) => `
    <ellipse cx="960" cy="650" rx="910" ry="295" transform="rotate(-16 960 650)" fill="none" stroke="${accent}" opacity=".2"/>
    <ellipse cx="960" cy="650" rx="760" ry="225" transform="rotate(-16 960 650)" fill="none" stroke="${secondary}" opacity=".22"/>
    <ellipse cx="960" cy="650" rx="1080" ry="380" transform="rotate(-16 960 650)" fill="none" stroke="${accent}" opacity=".09"/>
    <path d="M120 210L295 120L370 300L235 405Z" fill="url(#glass)" stroke="${accent}" stroke-opacity=".25"/>
    <path d="M120 210L235 405L240 230L295 120M240 230L370 300" fill="none" stroke="${accent}" opacity=".19"/>
    <path d="M1570 760L1710 590L1870 730L1760 975Z" fill="url(#glass)" stroke="${accent}" stroke-opacity=".25"/><path d="M1570 760L1740 785L1760 975M1740 785L1710 590M1740 785L1870 730" fill="none" stroke="${accent}" opacity=".16"/>
    ${dots(accent, 85, 0.24)}`,
  "carnival-pop": ({ accent, secondary }) => `
    ${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 160} 0H${i * 160 + 160}V30Q${i * 160 + 80} 180 ${i * 160} 30Z" fill="${i % 2 ? accent : secondary}" opacity=".3"/>`).join("")}
    <path d="M0 1020H1920V1080H0Z" fill="${accent}" opacity=".15"/>
    ${Array.from({ length: 18 }, (_, i) => `<path d="M${i * 150 - 100} 1080L${i * 150 - 40} 1020H${i * 150 + 20}L${i * 150 - 40} 1080Z" fill="${secondary}" opacity=".5"/>`).join("")}
    ${Array.from({ length: 32 }, (_, i) => `<rect x="${i % 2 ? 1820 + (i % 3) * 20 : 45 + (i % 3) * 25}" y="${160 + i * 27}" width="${9 + (i % 4) * 3}" height="${20 + (i % 5) * 4}" rx="3" fill="${i % 2 ? accent : secondary}" opacity=".4" transform="rotate(${i % 2 ? 25 : -30} ${i % 2 ? 1840 : 70} ${160 + i * 27})"/>`).join("")}
    <path d="M100 220Q-45 520 150 790M1820 220Q1965 520 1770 790" fill="none" stroke="${accent}" stroke-width="3" opacity=".3"/>`,
  "sports-arena": ({ accent, secondary }) => `
    <path d="M0 0H640L300 1080H0Z" fill="#f56d64" opacity=".08"/><path d="M1920 0H1280L1620 1080H1920Z" fill="#5aafff" opacity=".1"/>
    <path d="M0 180L960 40L1920 180M0 210L960 70L1920 210" fill="none" stroke="${accent}" stroke-width="2" opacity=".23"/>
    ${Array.from({ length: 17 }, (_, i) => `<path d="M${i * 120} ${180 - Math.min(i, 16 - i) * 17.5}V${210 - Math.min(i, 16 - i) * 17.5}" stroke="${accent}" stroke-width="2" opacity=".22"/>`).join("")}
    ${Array.from({ length: 10 }, (_, i) => `<circle cx="${120 + i * 180}" cy="125" r="4" fill="${i < 5 ? secondary : accent}" opacity=".6"/>`).join("")}
    <path d="M0 950H1920M0 1000H1920M280 950L150 1080M760 950L700 1080M1160 950L1220 1080M1640 950L1770 1080" fill="none" stroke="${accent}" opacity=".14"/>
    <path d="M0 600L250 340M1670 600L1920 340" stroke="${secondary}" stroke-width="45" opacity=".09"/>`,
  "mystery-noir": ({ accent }) => `
    <g transform="rotate(-24 960 540)">${Array.from({ length: 12 }, (_, i) => `<rect x="-500" y="${-200 + i * 130}" width="3000" height="60" fill="${accent}" opacity="${i % 3 === 0 ? 0.08 : 0.035}"/>`).join("")}</g>
    <path d="M0 0H460L0 1080Z" fill="#080d0a" opacity=".55"/>
    <path d="M1300 0L1810 0L1920 1080L1670 1080Z" fill="url(#light)" opacity=".05"/>
    <rect x="145" y="870" width="360" height="245" rx="2" transform="rotate(-8 145 870)" fill="#9a8d69" opacity=".11"/>
    <path d="M50 1020H1870" stroke="${accent}" opacity=".19"/><circle cx="1780" cy="220" r="76" fill="none" stroke="${accent}" opacity=".16"/><circle cx="1780" cy="220" r="60" fill="none" stroke="${accent}" opacity=".1"/>
    ${dots(accent, 45, 0.07)}`,
}

function composition(style: OriginalThemeStyle, poster: boolean) {
  const { id, background, panel, accent, secondary, foreground } = style
  const title = xml(style.names[0] ?? id)
  let font = "Georgia,serif"
  let headlineRadius = 14

  if (id === "neon-arcade") {
    font = "monospace"
  } else if (["crystal-future", "sports-arena"].includes(id)) {
    font = "sans-serif"
  }

  if (id === "retro-tv") {
    headlineRadius = 96
  } else if (id === "crystal-future") {
    headlineRadius = 55
  }

  const headline = poster
    ? `<g>
    <rect x="330" y="272" width="1260" height="430" rx="${headlineRadius}" fill="${background}" fill-opacity=".88" stroke="${accent}" stroke-opacity=".7" stroke-width="2"/>
    <path d="M800 320H1120" stroke="${accent}" stroke-width="3"/>
    <text x="960" y="405" text-anchor="middle" font-family="sans-serif" font-size="23" letter-spacing="8" fill="${accent}">TADAZZ ORIGINALS</text>
    <text x="960" y="550" text-anchor="middle" font-family="${font}" font-weight="${id === "sports-arena" ? 750 : 500}" font-size="${title.length > 16 ? 100 : 118}" letter-spacing="-3" fill="${foreground}">${title}</text>
    <g transform="translate(570 620)">${[0, 1, 2, 3].map((i) => `<rect x="${i * 205}" width="165" height="14" rx="${id === "retro-tv" ? 7 : 2}" fill="${i % 2 ? secondary : accent}" opacity="${0.5 + i * 0.1}"/>`).join("")}</g>
    <text x="960" y="820" text-anchor="middle" font-family="sans-serif" font-size="24" letter-spacing="3" fill="${foreground}" opacity=".75">${xml(id.replaceAll("-", " ").toUpperCase())}</text>
  </g>`
    : ""

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" aria-label="${title} original ${poster ? "cover" : "stage backdrop"}">
  <title>${title}</title><desc>Original source-controlled geometric stage art authored for Tadazz. No external imagery, fonts, scripts or remote resources.</desc>
  <defs><radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop stop-color="${panel}"/><stop offset="1" stop-color="${background}"/></radialGradient><linearGradient id="light" x2="0" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient><linearGradient id="glass" x2="1" y2="1"><stop stop-color="${accent}" stop-opacity=".22"/><stop offset=".5" stop-color="${secondary}" stop-opacity=".04"/><stop offset="1" stop-color="${accent}" stop-opacity=".12"/></linearGradient></defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>${environments[id](style)}${headline}</svg>`
}

const browser = await chromium.launch({ headless: true })
const inventory: Array<{
  family: OriginalThemeId
  name: "poster" | "backdrop"
  id: string
  url: string
  kind: "image"
  sha256: string
  bytes: number
  provenance: string
  rights: "owner-authorized"
  preload: "critical" | "slot"
}> = []

try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  })
  await page.route("http://**/*", (route) => route.abort())
  await page.route("https://**/*", (route) => route.abort())
  for (const style of ORIGINAL_THEME_STYLES) {
    const directory = resolve(publicRoot, style.id)
    mkdirSync(directory, { recursive: true })
    for (const name of ["backdrop", "poster"] as const) {
      const svg = composition(style, name === "poster")
      const source = `${style.id}-${name}.svg`
      writeFileSync(resolve(sourceDir, source), `${svg}\n`)
      await page.setContent(
        `<html><head><style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`,
      )
      await page.evaluate(() => document.fonts.ready)
      const bytes = await page.screenshot({
        type: "png",
        animations: "disabled",
      })
      writeFileSync(resolve(directory, `${name}.png`), bytes)
      inventory.push({
        family: style.id,
        name,
        id: `${style.id}-${name}`,
        url: `/tadazz-show/originals/${style.id}/${name}.png`,
        kind: "image",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
        provenance: `Original Tadazz geometric artwork; source extensions/site-assets/originals/${source}; rendered offline from source on isolated Linux.`,
        rights: "owner-authorized",
        preload: name === "backdrop" ? "critical" : "slot",
      })
    }
  }
  writeFileSync(
    resolve(root, "extensions/src/core/show-themes/original-theme-assets.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
  )
  process.stdout.write(
    `${JSON.stringify({ ok: true, count: inventory.length, bytes: inventory.reduce((sum, item) => sum + item.bytes, 0), inventory: "extensions/src/core/show-themes/original-theme-assets.json" })}\n`,
  )
} finally {
  await browser.close()
}
