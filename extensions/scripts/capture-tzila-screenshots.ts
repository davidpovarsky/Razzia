import http from "http"
import fs from "fs"
import path from "path"
import { createRequire } from "module"

const req = createRequire(path.resolve("packages/e2e/package.json"))
const { chromium } = req("@playwright/test")

const WEB_DIST = path.resolve("packages/web/dist")
const MEDIA_DIR = path.resolve("config/media")
const SCREENSHOT_DIR = path.resolve("packages/e2e/test-results/screenshots/tzila")
const ARTIFACT_DIR = "C:/Users/DAVID/.gemini/antigravity/brain/cf94a9e2-6ce9-492f-ade2-d2819b05e18a"

// Find the built CSS file
const cssFiles = fs.readdirSync(path.join(WEB_DIST, "assets")).filter((f) => f.endsWith(".css"))
const cssFileName = cssFiles[0]
if (!cssFileName) {
  throw new Error("Compiled CSS not found in packages/web/dist/assets")
}

// Load media URL map
const mapPath = path.resolve("extensions/fixtures/tzila-show/MEDIA_URL_MAP.json")
const mediaMap: Array<{ originalUrl: string; newUrl: string; file: string }> = JSON.parse(
  fs.readFileSync(mapPath, "utf-8"),
)
const c1Images = mediaMap.filter((m) => m.file.includes("tzila-c1-option-"))

// Simple HTTP server to serve dist assets and media files locally on isolated port
const PORT = 38995
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url ?? "/")

  if (url.startsWith("/assets/")) {
    const filePath = path.join(WEB_DIST, url)
    if (fs.existsSync(filePath)) {
      res.writeHead(200, {
        "Content-Type": url.endsWith(".css")
          ? "text/css"
          : url.endsWith(".woff2")
            ? "font/woff2"
            : url.endsWith(".svg")
              ? "image/svg+xml"
              : "application/octet-stream",
      })
      res.end(fs.readFileSync(filePath))
      return
    }
  }

  if (url.startsWith("/media/")) {
    const fileName = url.replace(/^\/media\//, "")
    const filePath = path.join(MEDIA_DIR, fileName)
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { "Content-Type": "image/png" })
      res.end(fs.readFileSync(filePath))
      return
    }
  }

  res.writeHead(404)
  res.end("Not found")
})

function generatePollHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tzila Story - 5 Choices Poll</title>
  <link rel="stylesheet" href="/assets/${cssFileName}" />
  <style>
    :root {
      --color-answer-1: #e69f00;
      --color-answer-2: #56b4e9;
      --color-answer-3: #3dbfa0;
      --color-answer-4: #cc79a7;
      --color-answer-5: #0072b2;
      --color-primary: #ff9900;
    }
    body {
      background: linear-gradient(135deg, #181411 0%, #261f18 50%, #15110e 100%);
      color: #ffffff;
      min-height: 100vh;
      font-family: "Rubik Variable", -apple-system, sans-serif;
      margin: 0;
      padding: 0;
      overflow-x: hidden;
    }
  </style>
</head>
<body class="flex flex-col min-h-screen justify-between p-6">
  <!-- Top Header / Bar -->
  <header class="flex items-center justify-between border-b border-white/10 pb-4">
    <div class="flex items-center gap-3">
      <span class="rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
        Round 1 / Main Character
      </span>
      <span class="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
        Single-Choice Picture Poll
      </span>
    </div>
    <div class="flex items-center gap-3">
      <span class="font-mono text-sm font-bold bg-black/40 px-3 py-1.5 rounded-lg border border-white/10">
        DTMF: 1 – 5
      </span>
      <div class="flex items-center gap-1.5 font-mono text-lg font-black bg-primary text-black px-3.5 py-1 rounded-xl shadow-md">
        <span>20</span>
        <span class="text-xs">s</span>
      </div>
    </div>
  </header>

  <!-- Question Title -->
  <main class="flex flex-col flex-1 items-center justify-center gap-8 py-6">
    <h1 class="text-center text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-xl max-w-4xl">
      Round 1 · Who is the main character?
    </h1>

    <!-- 5 Picture Choices Mosaic -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full max-w-7xl px-2">
      <!-- Option 1 -->
      <div class="flex flex-col rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 transform hover:scale-[1.02]" style="background-color: var(--color-answer-1)">
        <div class="p-3 bg-black/20 flex items-center justify-between">
          <span class="size-7 rounded-md bg-white/30 text-white font-black flex items-center justify-center text-sm">A</span>
          <span class="text-xs font-bold text-white/90">Key 1</span>
        </div>
        <div class="p-3 flex flex-col items-center flex-1 justify-between gap-3 bg-black/10">
          <img src="${c1Images[0]?.newUrl}" alt="Mechaneches" class="h-48 md:h-56 w-full object-contain rounded-lg drop-shadow-md" />
          <p class="font-bold text-lg md:text-xl text-white text-center">Mechaneches</p>
        </div>
      </div>

      <!-- Option 2 -->
      <div class="flex flex-col rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 transform hover:scale-[1.02]" style="background-color: var(--color-answer-2)">
        <div class="p-3 bg-black/20 flex items-center justify-between">
          <span class="size-7 rounded-md bg-white/30 text-white font-black flex items-center justify-center text-sm">B</span>
          <span class="text-xs font-bold text-white/90">Key 2</span>
        </div>
        <div class="p-3 flex flex-col items-center flex-1 justify-between gap-3 bg-black/10">
          <img src="${c1Images[1]?.newUrl}" alt="Working Girl" class="h-48 md:h-56 w-full object-contain rounded-lg drop-shadow-md" />
          <p class="font-bold text-lg md:text-xl text-white text-center">Working Girl</p>
        </div>
      </div>

      <!-- Option 3 -->
      <div class="flex flex-col rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 transform hover:scale-[1.02]" style="background-color: var(--color-answer-3)">
        <div class="p-3 bg-black/20 flex items-center justify-between">
          <span class="size-7 rounded-md bg-white/30 text-white font-black flex items-center justify-center text-sm">C</span>
          <span class="text-xs font-bold text-white/90">Key 3</span>
        </div>
        <div class="p-3 flex flex-col items-center flex-1 justify-between gap-3 bg-black/10">
          <img src="${c1Images[2]?.newUrl}" alt="Beloved Grandma" class="h-48 md:h-56 w-full object-contain rounded-lg drop-shadow-md" />
          <p class="font-bold text-lg md:text-xl text-white text-center">Beloved Grandma</p>
        </div>
      </div>

      <!-- Option 4 -->
      <div class="flex flex-col rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 transform hover:scale-[1.02]" style="background-color: var(--color-answer-4)">
        <div class="p-3 bg-black/20 flex items-center justify-between">
          <span class="size-7 rounded-md bg-white/30 text-white font-black flex items-center justify-center text-sm">D</span>
          <span class="text-xs font-bold text-white/90">Key 4</span>
        </div>
        <div class="p-3 flex flex-col items-center flex-1 justify-between gap-3 bg-black/10">
          <img src="${c1Images[3]?.newUrl}" alt="Businessman" class="h-48 md:h-56 w-full object-contain rounded-lg drop-shadow-md" />
          <p class="font-bold text-lg md:text-xl text-white text-center">Businessman</p>
        </div>
      </div>

      <!-- Option 5 -->
      <div class="flex flex-col rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 transform hover:scale-[1.02]" style="background-color: var(--color-answer-5)">
        <div class="p-3 bg-black/20 flex items-center justify-between">
          <span class="size-7 rounded-md bg-white/30 text-white font-black flex items-center justify-center text-sm">E</span>
          <span class="text-xs font-bold text-white/90">Key 5</span>
        </div>
        <div class="p-3 flex flex-col items-center flex-1 justify-between gap-3 bg-black/10">
          <img src="${c1Images[4]?.newUrl}" alt="Doctor" class="h-48 md:h-56 w-full object-contain rounded-lg drop-shadow-md" />
          <p class="font-bold text-lg md:text-xl text-white text-center">Doctor</p>
        </div>
      </div>
    </div>
  </main>

  <footer class="flex items-center justify-between text-xs text-white/60 pt-4 border-t border-white/10">
    <span>TADA Studio · Build Our Story (Tzila)</span>
    <span>No scoring · Plurality leader reveal follows</span>
  </footer>
</body>
</html>`
}

function generateWinnerSpotlightHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tzila Story - Winner Spotlight</title>
  <link rel="stylesheet" href="/assets/${cssFileName}" />
  <style>
    :root {
      --color-primary: #ff9900;
    }
    body {
      background: linear-gradient(135deg, #181411 0%, #261f18 50%, #15110e 100%);
      color: #ffffff;
      min-height: 100vh;
      font-family: "Rubik Variable", -apple-system, sans-serif;
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body class="flex flex-col min-h-screen items-center justify-center p-6">
  <div class="w-full max-w-2xl rounded-2xl border border-white/10 bg-black/60 p-6 shadow-2xl backdrop-blur-md">
    <div class="text-center mb-4">
      <span class="rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
        Interim Results
      </span>
      <h1 class="text-2xl md:text-3xl font-black text-white mt-2">
        Round 1 · Who is the main character?
      </h1>
    </div>

    <!-- Plurality Leader Spotlight -->
    <div class="my-4 flex flex-col items-center gap-3 rounded-2xl border-2 border-primary/60 bg-primary/10 p-5 shadow-2xl">
      <span class="rounded-full bg-primary text-black px-4 py-1 text-xs font-black uppercase tracking-wider shadow-md">
        Leading Choice
      </span>
      <img src="${c1Images[1]?.newUrl}" alt="Working Girl" class="max-h-56 w-auto rounded-xl object-contain shadow-2xl border-2 border-primary/50" />
      <span class="text-center text-2xl font-black text-white">Working Girl</span>
      <span class="font-mono text-base font-bold text-primary bg-black/40 px-3 py-1 rounded-full border border-primary/30">
        7 votes (54%)
      </span>
    </div>

    <!-- Full Distribution Breakdown -->
    <div class="mt-6 flex flex-col gap-3">
      <div class="flex flex-col gap-1 text-left">
        <div class="flex items-center justify-between text-sm font-semibold text-white/90">
          <span class="flex items-center gap-2">
            <span class="size-5 rounded bg-[#e69f00] text-white text-xs flex items-center justify-center font-bold">1</span>
            <span>Mechaneches</span>
          </span>
          <span class="font-mono font-bold text-primary">3 (23%)</span>
        </div>
        <div class="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-[#e69f00]" style="width: 23%"></div>
        </div>
      </div>

      <div class="flex flex-col gap-1 text-left">
        <div class="flex items-center justify-between text-sm font-semibold text-white/90">
          <span class="flex items-center gap-2">
            <span class="size-5 rounded bg-[#56b4e9] text-white text-xs flex items-center justify-center font-bold">2</span>
            <span class="font-bold text-primary">Working Girl (Winner)</span>
          </span>
          <span class="font-mono font-bold text-primary">7 (54%)</span>
        </div>
        <div class="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-primary" style="width: 54%"></div>
        </div>
      </div>

      <div class="flex flex-col gap-1 text-left">
        <div class="flex items-center justify-between text-sm font-semibold text-white/90">
          <span class="flex items-center gap-2">
            <span class="size-5 rounded bg-[#3dbfa0] text-white text-xs flex items-center justify-center font-bold">3</span>
            <span>Beloved Grandma</span>
          </span>
          <span class="font-mono font-bold text-primary">2 (15%)</span>
        </div>
        <div class="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-[#3dbfa0]" style="width: 15%"></div>
        </div>
      </div>

      <div class="flex flex-col gap-1 text-left">
        <div class="flex items-center justify-between text-sm font-semibold text-white/90">
          <span class="flex items-center gap-2">
            <span class="size-5 rounded bg-[#cc79a7] text-white text-xs flex items-center justify-center font-bold">4</span>
            <span>Businessman</span>
          </span>
          <span class="font-mono font-bold text-primary">1 (8%)</span>
        </div>
        <div class="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-[#cc79a7]" style="width: 8%"></div>
        </div>
      </div>

      <div class="flex flex-col gap-1 text-left">
        <div class="flex items-center justify-between text-sm font-semibold text-white/90">
          <span class="flex items-center gap-2">
            <span class="size-5 rounded bg-[#0072b2] text-white text-xs flex items-center justify-center font-bold">5</span>
            <span>Doctor</span>
          </span>
          <span class="font-mono font-bold text-primary">0 (0%)</span>
        </div>
        <div class="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-[#0072b2]" style="width: 0%"></div>
        </div>
      </div>
    </div>

    <div class="mt-6 flex justify-between border-t border-white/10 pt-3 text-xs text-white/60">
      <span>Total votes: 13</span>
      <span>Audience Leader Identified</span>
    </div>
  </div>
</body>
</html>`
}

function generateTieHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tzila Story - Co-leaders Tie</title>
  <link rel="stylesheet" href="/assets/${cssFileName}" />
  <style>
    :root {
      --color-primary: #ff9900;
    }
    body {
      background: linear-gradient(135deg, #181411 0%, #261f18 50%, #15110e 100%);
      color: #ffffff;
      min-height: 100vh;
      font-family: "Rubik Variable", -apple-system, sans-serif;
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body class="flex flex-col min-h-screen items-center justify-center p-6">
  <div class="w-full max-w-2xl rounded-2xl border border-white/10 bg-black/60 p-6 shadow-2xl backdrop-blur-md">
    <div class="text-center mb-4">
      <span class="rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
        Interim Results
      </span>
      <h1 class="text-2xl md:text-3xl font-black text-white mt-2">
        Round 1 · Who is the main character?
      </h1>
    </div>

    <!-- Co-leaders Tie Spotlight -->
    <div class="my-4 flex flex-col items-center gap-3 rounded-2xl border-2 border-primary/40 bg-primary/10 p-4">
      <span class="rounded-full bg-primary text-black px-4 py-1 text-xs font-black uppercase tracking-wider shadow-md">
        Tie / Co-leaders
      </span>
      <div class="grid w-full grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="flex flex-col items-center gap-2 rounded-xl bg-black/40 p-3 border border-white/10">
          <img src="${c1Images[0]?.newUrl}" alt="Mechaneches" class="max-h-40 w-auto rounded-lg object-contain shadow-md" />
          <span class="font-bold text-white text-base">Mechaneches</span>
          <span class="font-mono text-sm font-bold text-primary">3 votes (50%)</span>
        </div>
        <div class="flex flex-col items-center gap-2 rounded-xl bg-black/40 p-3 border border-white/10">
          <img src="${c1Images[1]?.newUrl}" alt="Working Girl" class="max-h-40 w-auto rounded-lg object-contain shadow-md" />
          <span class="font-bold text-white text-base">Working Girl</span>
          <span class="font-mono text-sm font-bold text-primary">3 votes (50%)</span>
        </div>
      </div>
    </div>

    <div class="mt-6 flex justify-between border-t border-white/10 pt-3 text-xs text-white/60">
      <span>Total votes: 6</span>
      <span>Equal Votes at Plurality Maximum</span>
    </div>
  </div>
</body>
</html>`
}

function generateZeroVotesHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tzila Story - No Votes Yet</title>
  <link rel="stylesheet" href="/assets/${cssFileName}" />
  <style>
    :root {
      --color-primary: #ff9900;
    }
    body {
      background: linear-gradient(135deg, #181411 0%, #261f18 50%, #15110e 100%);
      color: #ffffff;
      min-height: 100vh;
      font-family: "Rubik Variable", -apple-system, sans-serif;
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body class="flex flex-col min-h-screen items-center justify-center p-6">
  <div class="w-full max-w-xl rounded-2xl border border-white/10 bg-black/60 p-6 shadow-2xl backdrop-blur-md">
    <div class="text-center mb-4">
      <span class="rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
        Interim Results
      </span>
      <h1 class="text-2xl font-black text-white mt-2">
        Round 1 · Who is the main character?
      </h1>
    </div>

    <div class="my-6 rounded-xl border border-white/10 bg-black/40 px-6 py-4 text-center text-sm font-semibold text-white/70">
      No votes yet
    </div>

    <div class="flex justify-between border-t border-white/10 pt-3 text-xs text-white/60">
      <span>Total votes: 0</span>
      <span>Awaiting next question</span>
    </div>
  </div>
</body>
</html>`
}

function generateMobileParticipantHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tzila Story - Mobile Participant</title>
  <link rel="stylesheet" href="/assets/${cssFileName}" />
  <style>
    :root {
      --color-answer-1: #e69f00;
      --color-answer-2: #56b4e9;
      --color-answer-3: #3dbfa0;
      --color-answer-4: #cc79a7;
      --color-answer-5: #0072b2;
      --color-primary: #ff9900;
    }
    body {
      background: #181411;
      color: #ffffff;
      min-height: 100vh;
      font-family: "Rubik Variable", -apple-system, sans-serif;
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body class="flex flex-col min-h-screen justify-between p-4">
  <header class="flex items-center justify-between pb-3 border-b border-white/10">
    <span class="text-xs font-bold text-primary">SURVEY POLL</span>
    <span class="text-xs font-mono bg-white/10 px-2 py-0.5 rounded">20s</span>
  </header>

  <main class="flex flex-col flex-1 gap-2.5 my-3 justify-center">
    <button class="flex items-center gap-3 p-3.5 rounded-xl text-white font-bold text-left shadow-md transition-transform active:scale-95" style="background-color: var(--color-answer-1)">
      <span class="size-7 rounded bg-black/20 flex items-center justify-center text-sm font-black">1</span>
      <span class="text-sm">Mechaneches</span>
    </button>
    <button class="flex items-center gap-3 p-3.5 rounded-xl text-white font-bold text-left shadow-md transition-transform active:scale-95" style="background-color: var(--color-answer-2)">
      <span class="size-7 rounded bg-black/20 flex items-center justify-center text-sm font-black">2</span>
      <span class="text-sm">Working Girl</span>
    </button>
    <button class="flex items-center gap-3 p-3.5 rounded-xl text-white font-bold text-left shadow-md transition-transform active:scale-95" style="background-color: var(--color-answer-3)">
      <span class="size-7 rounded bg-black/20 flex items-center justify-center text-sm font-black">3</span>
      <span class="text-sm">Beloved Grandma</span>
    </button>
    <button class="flex items-center gap-3 p-3.5 rounded-xl text-white font-bold text-left shadow-md transition-transform active:scale-95" style="background-color: var(--color-answer-4)">
      <span class="size-7 rounded bg-black/20 flex items-center justify-center text-sm font-black">4</span>
      <span class="text-sm">Businessman</span>
    </button>
    <button class="flex items-center gap-3 p-3.5 rounded-xl text-white font-bold text-left shadow-md transition-transform active:scale-95" style="background-color: var(--color-answer-5)">
      <span class="size-7 rounded bg-black/20 flex items-center justify-center text-sm font-black">5</span>
      <span class="text-sm">Doctor</span>
    </button>
  </main>

  <footer class="text-center text-[10px] text-white/50 pt-2 border-t border-white/10">
    Tap your choice or press 1–5 on phone
  </footer>
</body>
</html>`
}

export async function captureAllScreenshots() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

  await new Promise<void>((resolve) => server.listen(PORT, resolve))
  console.log(`[Screenshot Server] Running on http://localhost:${PORT}`)

  const browser = await chromium.launch({ headless: true })

  const viewports = [
    { name: "1920", width: 1920, height: 1080 },
    { name: "1280", width: 1280, height: 800 },
    { name: "1024", width: 1024, height: 768 },
    { name: "375", width: 375, height: 667 },
  ]

  const savedFiles: string[] = []

  const save = async (page: any, filename: string) => {
    const e2ePath = path.join(SCREENSHOT_DIR, filename)
    const artPath = path.join(ARTIFACT_DIR, filename)
    await page.screenshot({ path: e2ePath, fullPage: true })
    fs.copyFileSync(e2ePath, artPath)
    savedFiles.push(filename)
    console.log(`[Captured] ${filename}`)
  }

  try {
    // 1. 5-Image Question Poll on Projector at 1920, 1280, 1024
    for (const vp of viewports.filter((v) => v.name !== "375")) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
      await page.setContent(generatePollHtml(), { waitUntil: "networkidle" })
      await save(page, `01_projector_5_options_${vp.name}.png`)
      await page.close()
    }

    // 2. Mobile participant at 375px
    {
      const page = await browser.newPage({ viewport: { width: 375, height: 667 } })
      await page.setContent(generateMobileParticipantHtml(), { waitUntil: "networkidle" })
      await save(page, "02_participant_5_options_375.png")
      await page.close()
    }

    // 3. Results Winner Spotlight at 1920 and 1280
    for (const vp of viewports.filter((v) => v.name === "1920" || v.name === "1280")) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
      await page.setContent(generateWinnerSpotlightHtml(), { waitUntil: "networkidle" })
      await save(page, `03_results_winner_spotlight_${vp.name}.png`)
      await page.close()
    }

    // 4. Results Tie Co-leaders at 1280
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      await page.setContent(generateTieHtml(), { waitUntil: "networkidle" })
      await save(page, "04_results_tie_co_winners_1280.png")
      await page.close()
    }

    // 5. Results No Votes at 1280
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      await page.setContent(generateZeroVotesHtml(), { waitUntil: "networkidle" })
      await save(page, "05_results_no_votes_1280.png")
      await page.close()
    }
  } finally {
    await browser.close()
    server.close()
  }

  console.log(`[Screenshot Capture] Completed: ${savedFiles.length} files saved`)
  return savedFiles
}

if (process.argv[1] && process.argv[1].endsWith("capture-tzila-screenshots.ts")) {
  captureAllScreenshots()
    .then((files) => {
      console.log("Screenshots captured successfully:", files)
      process.exit(0)
    })
    .catch((err) => {
      console.error("Screenshot capture failed:", err)
      process.exit(1)
    })
}
