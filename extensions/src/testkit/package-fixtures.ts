/** Synthetic authored content, generated media and source; no customer/license claims. */
import { crc32, deflateSync } from "node:zlib"
import { readFileSync } from "node:fs"
import classic from "../core/show-themes/classic.manifest.json" with { type: "json" }
import type { ShowThemeDefinition } from "../core/show-themes/definition"
import { RUNTIME_PHASES } from "../core/packages/protocol"
import {
  packageManifestSchema,
  type PackageFile,
} from "../core/packages/manifest"
import { packPackage, packageSha } from "../server/packages/archive"

function png(color: number) {
  const chunk = (name: string, value: Buffer) => {
    const data = Buffer.concat([Buffer.from(name), value]),
      header = Buffer.alloc(4),
      tail = Buffer.alloc(4)
    header.writeUInt32BE(value.length)
    tail.writeUInt32BE(crc32(data))

    return Buffer.concat([header, data, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(64)
  ihdr.writeUInt32BE(64, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raster = Buffer.alloc(64 * (1 + 64 * 3))
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const at = y * 193 + 1 + x * 3
      raster[at] = (color * 53 + x * 3) % 256
      raster[at + 1] = (color * 97 + y * 3) % 256
      raster[at + 2] = (color * 31) % 256
    }
  }

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raster)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}
function wav() {
  const data = Buffer.alloc(44 + 16000)
  data.write("RIFF")
  data.writeUInt32LE(data.length - 8, 4)
  data.write("WAVEfmt ", 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(8000, 24)
  data.writeUInt32LE(16000, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write("data", 36)
  data.writeUInt32LE(16000, 40)
  for (let i = 0; i < 8000; i += 1) {
    data.writeInt16LE(
      Math.round(Math.sin((i * Math.PI * 2 * 220) / 8000) * 1500),
      44 + i * 2,
    )
  }

  return data
}

export function createPackageFixture(
  kind: "theme" | "game" | "complete" | "declarative" = "complete",
  style = "arcade",
  version = "1.0.0",
) {
  const themeId = `fixture-${style}`,
    packageId = `fixture-${kind}-${style}`
  const files = new Map<string, Buffer>(),
    inventory: PackageFile[] = []
  const add = (
    name: string,
    fileKind: PackageFile["kind"],
    bytes: Buffer | string,
  ) => {
    const value = typeof bytes === "string" ? Buffer.from(bytes) : bytes
    files.set(name, value)
    inventory.push({
      path: name,
      kind: fileKind,
      bytes: value.length,
      sha256: packageSha(value),
      rights: "owner-authorized",
      provenance: "Synthetic QA generated fixture; not customer review",
      exportable: true,
    })
  }
  const contents: Array<Record<string, unknown>> = []
  add("shared/backdrop.png", "image", png(1))
  add("shared/music.wav", "audio", wav())
  add(
    "shared/intro.mp4",
    "video",
    readFileSync(
      new URL("../../fixtures/packages/generated-video.mp4", import.meta.url),
    ),
  )
  add(
    "shared/intro.json",
    "lottie",
    JSON.stringify({
      v: "5.7.0",
      fr: 30,
      ip: 0,
      op: 30,
      w: 64,
      h: 64,
      ddd: 0,
      assets: [],
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: "Synthetic orb",
          sr: 1,
          ks: {
            o: { a: 0, k: 100 },
            r: { a: 0, k: 0 },
            p: { a: 0, k: [32, 32, 0] },
            a: { a: 0, k: [0, 0, 0] },
            s: { a: 0, k: [100, 100, 100] },
          },
          shapes: [
            {
              ty: "el",
              d: 1,
              s: { a: 0, k: [20, 20] },
              p: { a: 0, k: [0, 0] },
            },
            {
              ty: "fl",
              c: { a: 0, k: [0, 1, 0.7, 1] },
              o: { a: 0, k: 100 },
              r: 1,
            },
          ],
          ip: 0,
          op: 30,
          st: 0,
          bm: 0,
        },
      ],
    }),
  )

  if (kind !== "game") {
    const theme = JSON.parse(
      JSON.stringify(classic).replaceAll(classic.id, themeId),
    ) as ShowThemeDefinition
    theme.version = version
    theme.kind = kind === "declarative" ? "declarative" : "sandboxed-react"
    theme.rendererId =
      kind === "declarative" ? "tadazz-classic-stage" : "tadazz-sandbox-stage"
    theme.provenance = "Generated QA theme, no platform publication approval"
    theme.nameKey = `${themeId}.name`
    theme.descriptionKey = `${themeId}.description`
    const descriptions = {
      en: "Independent show theme",
      fr: "Thème de spectacle indépendant",
      de: "Eigenständiges Showdesign",
      es: "Tema de espectáculo independiente",
      it: "Tema di spettacolo indipendente",
      ja: "独立したショーテーマ",
      tr: "Bağımsız gösteri teması",
      vi: "Giao diện trình diễn độc lập",
    }
    const labels: Record<string, [string, string]> = {
      en: ["Default", "Silent"],
      fr: ["Par défaut", "Silencieux"],
      de: ["Standard", "Stumm"],
      es: ["Predeterminado", "Silencio"],
      it: ["Predefinito", "Silenzioso"],
      ja: ["標準", "無音"],
      tr: ["Varsayılan", "Sessiz"],
      vi: ["Mặc định", "Im lặng"],
    }
    const localization = (locale: keyof typeof descriptions) => ({
      [theme.nameKey]: `TADAZZ ${style}`,
      [theme.descriptionKey]: descriptions[locale],
      "extensions:themes.default": labels[locale][0],
      "extensions:themes.silent": labels[locale][1],
    })
    theme.localizations = {
      en: localization("en"),
      fr: localization("fr"),
      de: localization("de"),
      es: localization("es"),
      it: localization("it"),
      ja: localization("ja"),
      tr: localization("tr"),
      vi: localization("vi"),
    }
    theme.assets = [
      {
        id: "backdrop",
        url: "../shared/backdrop.png",
        kind: "image",
        sha256: inventory[0].sha256,
        bytes: inventory[0].bytes,
        provenance: inventory[0].provenance,
        rights: "owner-authorized",
        preload: "critical",
      },
      {
        id: "music",
        url: "../shared/music.wav",
        kind: "audio",
        sha256: inventory[1].sha256,
        bytes: inventory[1].bytes,
        provenance: inventory[1].provenance,
        rights: "owner-authorized",
        preload: "slot",
      },
    ]
    for (const [id, fileIndex, assetKind] of [
      ["intro-video", 2, "video"],
      ["intro-lottie", 3, "lottie"],
    ] as const) {
      const file = inventory[fileIndex]
      theme.assets.push({
        id,
        url: `../${file.path}`,
        kind: assetKind,
        sha256: file.sha256,
        bytes: file.bytes,
        provenance: file.provenance,
        rights: "owner-authorized",
        preload: "slot",
      })
    }
    theme.posterAssetId = "backdrop"
    theme.adapterAssets = {
      questionBackdrop: "backdrop",
      showBackdrop: "backdrop",
      brandLogo: "backdrop",
    }
    for (const slot of Object.values(theme.slots)) {
      for (const variant of slot.variants) {
        delete variant.backgroundAssetId
        delete variant.logoAssetId
        delete variant.mediaAssetId
        delete variant.overlayAssetId
        variant.backgroundAssetId = "backdrop"
      }
    }
    for (const event of Object.values(theme.audioEvents)) {
      for (const variant of event.variants) {
        delete variant.assetId
        variant.silent = true
      }
    }
    Object.assign(theme.audioEvents.answersMusic.variants[0], {
      assetId: "music",
      silent: false,
      volume: 0.2,
      loop: true,
    })
    Object.assign(theme.slots.opening.variants[0], {
      mediaAssetId: "intro-video",
      overlayAssetId: "intro-lottie",
    })

    if (kind !== "declarative") {
      theme.sandbox = {
        runtimeApi: 1,
        entry: "theme/src/entry.tsx",
        slots: Object.fromEntries(
          RUNTIME_PHASES.map((s) => [s, "implemented"]),
        ) as NonNullable<ShowThemeDefinition["sandbox"]>["slots"],
        roles: ["manager", "player", "spectator"],
      }
      add(
        "theme/src/entry.tsx",
        "source",
        `import React from "react";
import type {ThemeSDK} from "@tadazz/theme-sdk";
import "./style.css";
export default function Stage({snapshot:s,submitAnswer,asset}:ThemeSDK){return <main className="${style}" data-theme-layout="${style}" data-phase={s.phase} style={s.backgroundImage ? {backgroundImage: "linear-gradient(rgba(10,14,32,.88),rgba(10,14,32,.88)),url("+s.backgroundImage+")",backgroundSize: "cover"} : undefined}><header><span>TADAZZ · ${style}</span><h1>{s.phase==="personalResult" ? s.labels.results : (s.question || s.title || s.labels.waiting)}</h1>{s.questionImage && <img className="question-photo" src={s.questionImage} alt={s.question}/>} {s.phase==="lobby"&&s.joinCode&&<p><code>{s.joinCode}</code> · {s.joinUrl}</p>}</header><aside aria-label="timer"><strong>{Math.ceil(s.remainingMs/1000)}</strong><small>{s.paused ? s.labels.waiting : ""}</small></aside><section className="answers">{s.answers.map(a=><button key={a.id} data-correct={a.correct === true ? "true" : undefined} disabled={!s.canAnswer} onClick={()=>{submitAnswer([a.id]);}}>{a.image&&<img src={a.image} alt={a.label}/>}<span>{a.correct === true ? "✓ " : ""}{a.label}</span>{a.percent!==undefined&&<><meter min="0" max="100" value={a.percent}/><strong>{Math.round(a.percent)}%</strong></>}</button>)}{s.leaders.map(l=><article key={l.rank}><strong>{l.rank}. {l.label}</strong><p>{l.score}</p></article>)}{s.personalResult&&<article aria-label={s.labels.results}><strong>{s.personalResult.points}</strong><p>#{s.personalResult.rank}</p></article>}</section><footer><img alt="" src={asset("shared/backdrop.png")}/><span>{s.phase==="results"?s.labels.results:s.labels.waiting}</span></footer></main>}`,
      )
      add(
        "theme/src/style.css",
        "style",
        `*{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#10132b;color:white}main{height:100vh;overflow:hidden;padding:3vh 4vw;display:grid;gap:2vh;grid-template-columns:${style.includes("cinematic") ? "1fr 24vw" : "1fr"};grid-template-rows:${style.includes("cinematic") ? "auto 1fr auto" : "auto auto 1fr auto"}}header h1{font-size:clamp(18px,4vw,58px);margin:1vh 0}aside{border:3px solid #7affd1;border-radius:${style.includes("cinematic") ? "50%" : "12px"};aspect-ratio:${style.includes("cinematic") ? "1" : "auto"};width:${style.includes("cinematic") ? "18vw" : "100%"};justify-self:end;padding:1vh;display:flex;align-items:center;gap:2vw;justify-content:center}aside strong{font-size:clamp(30px,6vw,84px)}.answers{display:grid;min-height:0;gap:2vw;grid-template-columns:${style.includes("cinematic") ? "repeat(2,minmax(0,1fr))" : "repeat(auto-fit,minmax(100px,1fr))"};grid-column:1/-1}.answers button{border:2px solid #7affd1;background:#242849;color:white;border-radius:16px;min-height:0;overflow:hidden;font-size:clamp(14px,2vw,30px);display:flex;flex-direction:${style.includes("cinematic") ? "row" : "column"};align-items:center;justify-content:center;gap:1vw}.answers img{max-height:12vh;max-width:18vw;object-fit:contain}.answers button:disabled{opacity:1}.answers button[data-correct=true]{border-color:#7affd1;box-shadow:inset 0 0 0 3px #7affd1}.answers button:focus-visible{outline:5px solid #fbc630}footer{grid-column:1/-1;display:flex;gap:2vw;align-items:center}footer img{height:3vh}meter{width:80%}.question-photo{max-width:35vw;max-height:18vh;object-fit:contain}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`,
      )
    }

    add("theme/theme.json", "descriptor", JSON.stringify(theme))
    contents.push({
      kind:
        kind === "declarative" ? "declarative-theme" : "sandboxed-react-theme",
      id: themeId,
      path: "theme/theme.json",
    })
  }

  if (kind === "game" || kind === "complete") {
    for (let q = 0; q < 10; q += 1) {
      for (let a = 0; a < 5; a += 1) {
        add(`games/assets/q${q}-a${a}.png`, "image", png(2 + q * 5 + a))
      }
    }
    const count = kind === "complete" ? 2 : 1
    for (let g = 0; g < count; g += 1) {
      const doc = {
        format: "tada-show",
        version: 1,
        title: `Package ${style} game ${g + 1}`,
        cards: [
          {
            key: "opening",
            kind: "opening",
            title: "Package opening",
            mediaUrl: "../shared/intro.mp4",
            mediaType: "video",
            durationMs: 1000,
            advance: "auto",
            muted: true,
            lottieUrl: "../shared/intro.json",
            audio: {
              mode: "custom",
              url: "../shared/music.wav",
              volume: 0.1,
              loop: false,
            },
          },
          ...Array.from({ length: 10 }, (_question, i) => ({
            key: `q-${i + 1}`,
            kind: "quiz",
            question: `Question ${i + 1}`,
            questionType: "single",
            ...(i === 0
              ? { media: { type: "image", url: "../shared/backdrop.png" } }
              : {}),
            timeSeconds: 20,
            correctAnswers: [1],
            background: { url: "../shared/backdrop.png", fit: "cover" },
            audioCues: {
              answersMusic: {
                mode: "custom",
                url: "../shared/music.wav",
                volume: 0.2,
                loop: true,
              },
            },
            answers: Array.from({ length: 5 }, (_answer, a) => ({
              text: `Choice ${a + 1}`,
              display: "both",
              imageUrl: `./assets/q${i}-a${a}.png`,
              alt: `Generated choice ${a + 1}`,
            })),
          })),
          {
            key: "closing",
            kind: "closing",
            title: "Package closing",
            mediaUrl: "../shared/backdrop.png",
            mediaType: "image",
            durationMs: 1000,
            advance: "auto",
          },
        ],
      }
      add(`games/game-${g + 1}.json`, "descriptor", JSON.stringify(doc))
      contents.push({
        kind: "game",
        id: `demo-game-${g + 1}`,
        path: `games/game-${g + 1}.json`,
        ...(kind === "complete" ? { themeRef: `${themeId}@${version}` } : {}),
      })
    }
  }

  const manifest = packageManifestSchema.parse({
    format: "tadazz-package",
    formatVersion: 1,
    id: packageId,
    version,
    displayName: `Synthetic ${kind} ${style}`,
    author: "TADAZZ QA fixture",
    requires: { packageApi: 1, runtimeApi: 1 },
    contents,
    files: inventory,
  })

  return { manifest, files, bytes: packPackage(manifest, files) }
}
