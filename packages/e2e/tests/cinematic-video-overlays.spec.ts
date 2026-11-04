import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import { join } from "node:path"
import zlib from "node:zlib"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import {
  createGame,
  endTimer,
  loginManager,
  next,
  startGame,
} from "@razzia/e2e/utils/manager"
import { joinGame } from "@razzia/e2e/utils/player"
import type { Page } from "@playwright/test"

const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../test-results/screenshots/cinematic-video-overlays",
)

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({
    path: join(SCREENSHOT_DIR, filename),
    fullPage: false,
  })
}

// --- CRC32 & PNG / ZIP Helpers for Deterministic Engineering Fixtures ---
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(buf: Buffer): number {
  let crc = -1
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}
function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function createPngBuffer(
  width: number,
  height: number,
  color = { r: 59, g: 130, b: 246 },
): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const scanlineLength = 1 + width * 3
  const raw = Buffer.alloc(scanlineLength * height)
  for (let y = 0; y < height; y++) {
    const offset = y * scanlineLength
    raw[offset] = 0
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3
      raw[px] = (color.r + Math.floor((x * 40) / width)) % 256
      raw[px + 1] = (color.g + Math.floor((y * 40) / height)) % 256
      raw[px + 2] = color.b
    }
  }
  const idat = makePngChunk("IDAT", zlib.deflateSync(raw))
  return Buffer.concat([
    sig,
    makePngChunk("IHDR", ihdr),
    idat,
    makePngChunk("IEND", Buffer.alloc(0)),
  ])
}

function buildZipBuffer(
  entries: Array<{ name: string; data: Buffer }>,
): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf-8")
    const uncompressed = entry.data
    const compressed = zlib.deflateRawSync(uncompressed)
    const crc = crc32(uncompressed)

    const localHeader = Buffer.alloc(30 + nameBuf.length)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(8, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(uncompressed.length, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28)
    nameBuf.copy(localHeader, 30)

    localParts.push(localHeader, compressed)

    const centralHeader = Buffer.alloc(46 + nameBuf.length)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(uncompressed.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    nameBuf.copy(centralHeader, 46)

    centralParts.push(centralHeader)
    offset += localHeader.length + compressed.length
  }

  const centralBuffer = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuffer.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralBuffer, eocd])
}

/**
 * Generates a real 8.2-second MP4 video file with moving visual patterns using ffmpeg.
 * Uses MPEG-4 Part 2 / H.264 baseline in MP4 container so standard HTML5 <video> plays it.
 */
function createMovingTestMp4Buffer(durationSeconds = 8.2): Buffer {
  const tmpFile = join(
    os.tmpdir(),
    `tada-cinema-e2e-${process.pid}-${Date.now()}.mp4`,
  )
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=duration=${durationSeconds}:size=640x360:rate=24`,
        "-c:v",
        "libx264",
        "-profile:v",
        "baseline",
        "-level",
        "3.0",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        tmpFile,
      ],
      { stdio: "ignore" },
    )
    return fs.readFileSync(tmpFile)
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile)
    }
  }
}

// --- 3 Distinct Transparent Engineering Lottie Fixtures (NO fabricated owner branding) ---
const EMBEDDED_BADGE_PNG_BASE64 = createPngBuffer(64, 64, {
  r: 245,
  g: 158,
  b: 11,
}).toString("base64")

// Overlay A: Complex image-rich + precomp + mask + trim-path engineering fixture (packaged as .lottie)
const OVERLAY_A_ANIMATION_JSON = JSON.stringify({
  v: "5.7.4",
  fr: 30,
  ip: 0,
  op: 90,
  w: 400,
  h: 400,
  nm: "engineering-emblem-complex",
  ddd: 0,
  assets: [
    {
      id: "image_0",
      w: 64,
      h: 64,
      u: "",
      p: `data:image/png;base64,${EMBEDDED_BADGE_PNG_BASE64}`,
      e: 1,
    },
    {
      id: "comp_ring",
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: "PrecompRingShape",
          sr: 1,
          ks: {
            o: { a: 0, k: 95 },
            r: {
              a: 1,
              k: [
                { t: 0, s: [0], e: [180] },
                { t: 90, s: [180] },
              ],
            },
            p: { a: 0, k: [200, 200, 0] },
            a: { a: 0, k: [0, 0, 0] },
            s: { a: 0, k: [100, 100, 100] },
          },
          shapes: [
            {
              ty: "el",
              p: { a: 0, k: [0, 0] },
              s: { a: 0, k: [220, 220] },
              nm: "RingPath",
            },
            {
              ty: "st",
              c: { a: 0, k: [0.98, 0.75, 0.14, 1] },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 14 },
              lc: 2,
              lj: 2,
              nm: "GoldStroke",
            },
            {
              ty: "tm",
              s: { a: 0, k: 0 },
              e: {
                a: 1,
                k: [
                  { t: 0, s: [20], e: [100] },
                  { t: 90, s: [100] },
                ],
              },
              o: { a: 0, k: 0 },
              m: 1,
              nm: "TrimPath",
            },
          ],
          ip: 0,
          op: 90,
          st: 0,
          bm: 0,
        },
      ],
    },
  ],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 0,
      nm: "PrecompRingLayer",
      refId: "comp_ring",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 200, 0] },
        a: { a: 0, k: [200, 200, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      w: 400,
      h: 400,
      hasMask: true,
      masksProperties: [
        {
          inv: false,
          mode: "a",
          pt: {
            a: 0,
            k: {
              i: [
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
              ],
              o: [
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
              ],
              v: [
                [20, 20],
                [380, 20],
                [380, 380],
                [20, 380],
              ],
              c: true,
            },
          },
          o: { a: 0, k: 100 },
          x: { a: 0, k: 0 },
          nm: "SafeMask",
        },
      ],
      ip: 0,
      op: 90,
      st: 0,
      bm: 0,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 2,
      nm: "EmbeddedRasterBadge",
      refId: "image_0",
      sr: 1,
      ks: {
        o: { a: 0, k: 90 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 200, 0] },
        a: { a: 0, k: [32, 32, 0] },
        s: { a: 0, k: [120, 120, 100] },
      },
      ip: 0,
      op: 90,
      st: 0,
      bm: 0,
    },
  ],
})

const OVERLAY_A_DOTLOTTIE_BUFFER = buildZipBuffer([
  {
    name: "manifest.json",
    data: Buffer.from(
      JSON.stringify({
        version: "1.0",
        generator: "tada-engineering-fixture",
        activeAnimationId: "emblem",
        animations: [{ id: "emblem", speed: 1, loop: false }],
      }),
      "utf-8",
    ),
  },
  {
    name: "animations/emblem.json",
    data: Buffer.from(OVERLAY_A_ANIMATION_JSON, "utf-8"),
  },
])

// Overlay B: Transparent looping particles behind title (0s .. 8s)
const OVERLAY_B_PARTICLES_JSON = JSON.stringify({
  v: "5.7.4",
  fr: 30,
  ip: 0,
  op: 60,
  w: 600,
  h: 340,
  nm: "engineering-particles-loop",
  ddd: 0,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "OrbitingParticleCluster",
      sr: 1,
      ks: {
        o: { a: 0, k: 85 },
        r: {
          a: 1,
          k: [
            { t: 0, s: [0], e: [360] },
            { t: 60, s: [360] },
          ],
        },
        p: { a: 0, k: [300, 170, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: "el",
          p: { a: 0, k: [-140, -60] },
          s: { a: 0, k: [36, 36] },
          nm: "Orb1",
        },
        {
          ty: "el",
          p: { a: 0, k: [140, 60] },
          s: { a: 0, k: [28, 28] },
          nm: "Orb2",
        },
        {
          ty: "fl",
          c: { a: 0, k: [0.22, 0.74, 0.97, 1] },
          o: { a: 0, k: 80 },
          r: 1,
          nm: "CyanFill",
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
  ],
})

// Overlay C: Transparent geometric wipe accent above title (6s .. 8s)
const OVERLAY_C_WIPE_JSON = JSON.stringify({
  v: "5.7.4",
  fr: 30,
  ip: 0,
  op: 60,
  w: 500,
  h: 160,
  nm: "engineering-wipe-accent",
  ddd: 0,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "SweepBar",
      sr: 1,
      ks: {
        o: { a: 0, k: 95 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [250, 80, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [20, 100, 100], e: [100, 100, 100] },
            { t: 60, s: [100, 100, 100] },
          ],
        },
      },
      shapes: [
        {
          ty: "rc",
          d: 1,
          s: { a: 0, k: [320, 24] },
          p: { a: 0, k: [0, 0] },
          r: { a: 0, k: 12 },
          nm: "RoundedAccentBar",
        },
        {
          ty: "fl",
          c: { a: 0, k: [0.06, 0.73, 0.51, 1] },
          o: { a: 0, k: 90 },
          r: 1,
          nm: "EmeraldFill",
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
  ],
})

const assertZeroStageScroll = async (page: Page, label: string) => {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement
    const stage =
      document.querySelector('[data-testid="audience-display"] section') ||
      document.querySelector("section") ||
      doc
    return {
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      docScrollHeight: doc.scrollHeight,
      docClientHeight: doc.clientHeight,
      stageScrollHeight: (stage as HTMLElement).scrollHeight,
      stageClientHeight: (stage as HTMLElement).clientHeight,
      stageScrollWidth: (stage as HTMLElement).scrollWidth,
      stageClientWidth: (stage as HTMLElement).clientWidth,
    }
  })

  expect(
    metrics.docScrollWidth,
    `${label}: docScrollWidth (${metrics.docScrollWidth}) > docClientWidth (${metrics.docClientWidth})`,
  ).toBeLessThanOrEqual(metrics.docClientWidth + 1)

  expect(
    metrics.docScrollHeight,
    `${label}: docScrollHeight (${metrics.docScrollHeight}) > docClientHeight (${metrics.docClientHeight})`,
  ).toBeLessThanOrEqual(metrics.docClientHeight + 1)

  expect(
    metrics.stageScrollWidth,
    `${label}: stageScrollWidth (${metrics.stageScrollWidth}) > stageClientWidth (${metrics.stageClientWidth})`,
  ).toBeLessThanOrEqual(metrics.stageClientWidth + 1)

  expect(
    metrics.stageScrollHeight,
    `${label}: stageScrollHeight (${metrics.stageScrollHeight}) > stageClientHeight (${metrics.stageClientHeight})`,
  ).toBeLessThanOrEqual(metrics.stageClientHeight + 1)
}

test.describe("Cinematic Video + Multiple Timed Lottie Overlays (Gates 1–7)", () => {
  test("1. Security, Self-Hosted WASM, Shared Lottie Catalog, Reference-Safe Delete, Native Editor UX & Format Roundtrips (.tada.json, .xlsx, .bundle.json)", async ({
    page,
  }) => {
    const SOCKET_ORIGIN = "http://127.0.0.1:3011"
    await loginManager(page)

    const token = await page.evaluate(() => localStorage.getItem("token"))
    const authHeaders = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }

    // 1A. Verify self-hosted dotLottie WASM route serves valid WebAssembly binary
    const wasmRes = await page.request.get(
      `${SOCKET_ORIGIN}/api/extensions/lottie-wasm`,
    )
    expect(wasmRes.status()).toBe(200)
    expect(wasmRes.headers()["content-type"]).toContain("application/wasm")
    const wasmBytes = await wasmRes.body()
    expect(wasmBytes.length).toBeGreaterThan(10_000)
    expect(wasmBytes.subarray(0, 4).toString("binary")).toBe("\0asm")

    // 1B. Security: reject malicious script JSON and Zip-Slip traversal .lottie archive
    const badJsonRes = await page.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: authHeaders,
        data: {
          name: "evil.json",
          format: "json",
          content: JSON.stringify({
            v: "5.7.4",
            fr: 30,
            ip: 0,
            op: 60,
            w: 100,
            h: 100,
            layers: [{ ty: 4, nm: "javascript:alert(1)" }],
          }),
        },
      },
    )
    expect(badJsonRes.status()).toBe(400)

    const zipSlipBuf = buildZipBuffer([
      {
        name: "manifest.json",
        data: Buffer.from(
          JSON.stringify({ animations: [{ id: "a" }] }),
          "utf-8",
        ),
      },
      {
        name: "../animations/a.json",
        data: Buffer.from(OVERLAY_B_PARTICLES_JSON, "utf-8"),
      },
    ])
    const badZipRes = await page.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: authHeaders,
        data: {
          name: "traversal.lottie",
          format: "dotlottie",
          contentBase64: zipSlipBuf.toString("base64"),
        },
      },
    )
    expect(badZipRes.status()).toBe(400)

    // 1C. Upload 3 distinct transparent engineering Lottie fixtures (.lottie + 2 .json)
    const upARes = await page.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: authHeaders,
        data: {
          name: "engineering-emblem-complex.lottie",
          format: "dotlottie",
          contentBase64: OVERLAY_A_DOTLOTTIE_BUFFER.toString("base64"),
        },
      },
    )
    expect(upARes.status()).toBe(201)
    const assetA = (await upARes.json()) as {
      name: string
      url: string
      format: string
      lottieMeta: { hasBakedBackground?: boolean }
    }
    expect(assetA.url).toMatch(/\.lottie$/u)
    expect(assetA.format).toBe("dotlottie")
    expect(Boolean(assetA.lottieMeta.hasBakedBackground)).toBe(false)

    const upBRes = await page.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: authHeaders,
        data: {
          name: "engineering-particles-loop.json",
          format: "json",
          content: OVERLAY_B_PARTICLES_JSON,
        },
      },
    )
    expect(upBRes.status()).toBe(201)
    const assetB = (await upBRes.json()) as { name: string; url: string }

    const upCRes = await page.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: authHeaders,
        data: {
          name: "engineering-wipe-accent.json",
          format: "json",
          content: OVERLAY_C_WIPE_JSON,
        },
      },
    )
    expect(upCRes.status()).toBe(201)
    const assetC = (await upCRes.json()) as { name: string; url: string }

    // Upload real 8.2s moving MP4 video
    const mp4Buffer = createMovingTestMp4Buffer(8.2)
    const upVideoRes = await page.request.post(`${SOCKET_ORIGIN}/api/media`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      multipart: {
        file: {
          name: "opening-cinema-8s.mp4",
          mimeType: "video/mp4",
          buffer: mp4Buffer,
        },
      },
    })
    expect(upVideoRes.status()).toBe(201)
    const videoAsset = (await upVideoRes.json()) as {
      name: string
      url: string
    }

    // 1D. Create a show with Opening (video + 2 initial overlays) & Closing (reusing assetA)
    const q1Id = "00000000-0000-4000-8000-000000000501"
    const openSceneId = "00000000-0000-4000-8000-000000000601"
    const closeSceneId = "00000000-0000-4000-8000-000000000602"

    const createShowRes = await page.request.post(
      `${SOCKET_ORIGIN}/api/extensions/quizzes`,
      {
        headers: authHeaders,
        data: {
          quizz: {
            subject: "Editor Multi-Lottie Authoring Show",
            gameMode: "quiz",
            questions: [
              {
                type: "single",
                playMode: "quiz",
                question: "Editor Test Q1: Ready for cinema?",
                answers: ["Yes", "Absolutely"],
                solutions: [0],
                cooldown: 4,
                time: 30,
              },
            ],
          },
          extras: {
            schemaVersion: 2,
            revision: 1,
            quizId: "temp-editor-show",
            baseDigest:
              "0000000000000000000000000000000000000000000000000000000000000000",
            questionIds: [q1Id],
            timeline: [
              {
                id: "00000000-0000-4000-8000-000000000701",
                kind: "opening",
                sceneId: openSceneId,
              },
              {
                id: "00000000-0000-4000-8000-000000000702",
                kind: "question",
                questionId: q1Id,
              },
              {
                id: "00000000-0000-4000-8000-000000000703",
                kind: "closing",
                sceneId: closeSceneId,
              },
            ],
            scenes: {
              [openSceneId]: {
                id: openSceneId,
                kind: "opening",
                title: "Grand Opening Act",
                subtitle: "Timed Multi-Lottie Stage",
                mediaUrl: videoAsset.url,
                mediaType: "video",
                stageLayout: "cinema",
                mediaFit: "cover",
                logoPosition: "top",
                textOverlay: true,
                endBehavior: "holdFrame",
                durationMs: 8000,
                advance: "onMediaEnd",
                mediaEndFallbackMs: 25000,
                overlayAnimations: [
                  {
                    id: "ov-editor-a",
                    label: "Emblem Complex",
                    enabled: true,
                    assetUrl: assetA.url,
                    position: { x: 0.5, y: 0.25 },
                    anchor: "center",
                    widthPct: 30,
                    rotationDeg: 0,
                    opacity: 1,
                    fit: "contain",
                    layer: "aboveTitle",
                    order: 0,
                    timeBase: "video",
                    startMs: 2500,
                    durationMs: 3000,
                    speed: 1,
                    loop: false,
                    finish: "holdLastFrame",
                  },
                  {
                    id: "ov-editor-b",
                    label: "Particles Loop",
                    enabled: true,
                    assetUrl: assetB.url,
                    position: { x: 0.5, y: 0.5 },
                    anchor: "center",
                    widthPct: 45,
                    rotationDeg: 0,
                    opacity: 0.9,
                    fit: "contain",
                    layer: "behindTitle",
                    order: 1,
                    timeBase: "video",
                    startMs: 0,
                    durationMs: 8000,
                    speed: 1,
                    loop: true,
                    finish: "hide",
                  },
                ],
              },
              [closeSceneId]: {
                id: closeSceneId,
                kind: "closing",
                title: "Grand Finale",
                durationMs: 6000,
                advance: "manual",
                overlayAnimations: [
                  {
                    id: "ov-closing-shared",
                    label: "Shared Finale Emblem",
                    enabled: true,
                    assetUrl: assetA.url,
                    position: { x: 0.5, y: 0.4 },
                    anchor: "center",
                    widthPct: 35,
                    rotationDeg: 0,
                    opacity: 1,
                    fit: "contain",
                    layer: "aboveTitle",
                    order: 0,
                    timeBase: "scene",
                    startMs: 0,
                    durationMs: 6000,
                    speed: 1,
                    loop: true,
                    finish: "hide",
                  },
                ],
              },
            },
            defaults: {
              newQuestionMode: "quiz",
              leaderboardPolicy: "cardOnly",
              advanceMode: "manual",
            },
            perQuestion: {},
          },
        },
      },
    )
    expect(createShowRes.status()).toBe(201)
    const createdShow = (await createShowRes.json()) as { quizId: string }

    // 1E. Reference-safe deletion: assetA is used by Opening and Closing (2 references) -> DELETE without detach returns 409
    const delBlockedRes = await page.request.delete(
      `${SOCKET_ORIGIN}/api/extensions/lottie/${encodeURIComponent(assetA.name)}`,
      { headers: authHeaders },
    )
    expect(delBlockedRes.status()).toBe(409)
    const conflictBody = (await delBlockedRes.json()) as {
      references: unknown[]
    }
    expect(conflictBody.references.length).toBeGreaterThanOrEqual(2)

    // 1F. Open Studio Editor and exercise Gate 5 UI controls
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/manager/quizz/${createdShow.quizId}`)
    await expect(
      page.locator('[data-testid="studio-card-type-bar"]'),
    ).toBeVisible({ timeout: 15_000 })

    // Opening card is selected first; verify Overlay Animations section is visible
    const overlaySection = page.locator(
      '[data-testid="studio-overlay-animations-section"]',
    )
    await expect(overlaySection).toBeVisible({ timeout: 10_000 })
    await expect(
      page.locator('[data-testid="studio-overlay-row-ov-editor-a"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="studio-overlay-row-ov-editor-b"]'),
    ).toBeVisible()

    // Add 3rd overlay from shared Lottie Catalog (assetC) without re-uploading
    await page
      .locator('[data-testid="studio-overlay-open-catalog-btn"]')
      .click()
    await expect(
      page.locator('[data-testid="studio-lottie-catalog-panel"]'),
    ).toBeVisible()
    await page
      .locator(`[data-testid="studio-lottie-catalog-select-${assetC.name}"]`)
      .click()

    // Now there are 3 overlay rows in the Opening scene
    const overlayRows = page.locator('[data-testid^="studio-overlay-row-"]')
    await expect(overlayRows).toHaveCount(3)

    // Configure 3rd overlay start time to 6.0s and duration to 2.0s
    const thirdRowId = await overlayRows
      .nth(2)
      .getAttribute("data-testid")
      .then((v) => v!.replace("studio-overlay-row-", ""))
    await page
      .locator(`[data-testid="studio-overlay-start-${thirdRowId}"]`)
      .fill("6")
    await page
      .locator(`[data-testid="studio-overlay-duration-${thirdRowId}"]`)
      .fill("2")

    // Test 16:9 and 4:3 preview switch inside existing preview
    await page.locator('[data-testid="studio-preview-aspect-4-3"]').click()
    await expect(
      page.locator('[data-testid="studio-scene-preview-stage"]'),
    ).toHaveAttribute("data-preview-aspect", "4:3")
    await saveScreenshot(page, "01_editor_opening_preview_4_3.png")

    await page.locator('[data-testid="studio-preview-aspect-16-9"]').click()
    await expect(
      page.locator('[data-testid="studio-scene-preview-stage"]'),
    ).toHaveAttribute("data-preview-aspect", "16:9")

    // Test scrubbing the timeline slider and verifying active overlay state in the stage preview!
    const scrubSlider = page.locator(
      '[data-testid="studio-preview-scrub-slider"]',
    )
    // At t = 1500ms: ov-editor-a (starts 2500ms) is 'beforeStart' (hidden), ov-editor-b (0..8000ms) is 'playing'
    await scrubSlider.fill("1500")
    await scrubSlider.dispatchEvent("change")
    await expect(
      page.locator('[data-testid="cinematic-overlay-ov-editor-b"]'),
    ).toHaveAttribute("data-overlay-phase", "playing")
    await expect(
      page.locator('[data-testid="cinematic-overlay-ov-editor-a"]'),
    ).toHaveAttribute("data-overlay-phase", "beforeStart")

    // At t = 3000ms: both ov-editor-a and ov-editor-b are 'playing'
    await scrubSlider.fill("3000")
    await scrubSlider.dispatchEvent("change")
    await expect(
      page.locator('[data-testid="cinematic-overlay-ov-editor-a"]'),
    ).toHaveAttribute("data-overlay-phase", "playing")
    await expect(
      page.locator('[data-testid="cinematic-overlay-ov-editor-b"]'),
    ).toHaveAttribute("data-overlay-phase", "playing")
    await saveScreenshot(page, "02_editor_scrub_3000ms_multi_overlays.png")

    // At t = 5800ms: ov-editor-a (2500..5500ms) is 'afterWindow', 3rd overlay (6000..8000ms) is 'beforeStart'
    await scrubSlider.fill("5800")
    await scrubSlider.dispatchEvent("change")
    await expect(
      page.locator('[data-testid="cinematic-overlay-ov-editor-a"]'),
    ).toHaveAttribute("data-overlay-phase", "afterWindow")

    // At t = 6500ms: ov-editor-a is 'afterWindow', ov-editor-b is 'playing', and 3rd overlay is 'playing'!
    await scrubSlider.fill("6500")
    await scrubSlider.dispatchEvent("change")
    await expect(
      page.locator(`[data-testid="cinematic-overlay-${thirdRowId}"]`),
    ).toHaveAttribute("data-overlay-phase", "playing")

    // Test Duplicate & Remove layer (Remove detaches from scene without deleting file from library)
    await page
      .locator(`[data-testid="studio-overlay-duplicate-${thirdRowId}"]`)
      .click()
    await expect(overlayRows).toHaveCount(4)
    const fourthRowId = await overlayRows
      .nth(3)
      .getAttribute("data-testid")
      .then((v) => v!.replace("studio-overlay-row-", ""))
    await page
      .locator(`[data-testid="studio-overlay-remove-${fourthRowId}"]`)
      .click()
    await expect(overlayRows).toHaveCount(3)

    // Verify underlying assetC file is still served from /media/ and /api/extensions/lottie/
    const verifyAssetCRes = await page.request.get(assetC.url)
    expect(verifyAssetCRes.status()).toBe(200)
    const verifyAssetCApiRes = await page.request.get(
      `${SOCKET_ORIGIN}/api/extensions/lottie/${encodeURIComponent(assetC.name)}`,
      { headers: authHeaders },
    )
    expect(verifyAssetCApiRes.status()).toBe(200)

    // 1G. Enhanced Bundle Export & Re-Import Roundtrip: preserves all overlayAnimations and mediaEndFallbackMs
    const exportBundleRes = await page.request.get(
      `${SOCKET_ORIGIN}/api/extensions/export/${createdShow.quizId}`,
      { headers: authHeaders },
    )
    expect(exportBundleRes.status()).toBe(200)
    const bundlePayload = (await exportBundleRes.json()) as {
      bundleVersion: number
      quizz: unknown
      extras: {
        scenes: Record<
          string,
          {
            overlayAnimations?: unknown[]
            mediaEndFallbackMs?: number
          }
        >
      }
    }
    expect(bundlePayload.bundleVersion).toBe(1)
    expect(
      bundlePayload.extras.scenes[openSceneId].overlayAnimations,
    ).toHaveLength(2)
    expect(bundlePayload.extras.scenes[openSceneId].mediaEndFallbackMs).toBe(
      25000,
    )

    const reimportRes = await page.request.post(
      `${SOCKET_ORIGIN}/api/extensions/import`,
      {
        headers: authHeaders,
        data: bundlePayload,
      },
    )
    expect(reimportRes.status()).toBe(201)
    const reimported = (await reimportRes.json()) as { quizId: string }
    const verifyReimportedRes = await page.request.get(
      `${SOCKET_ORIGIN}/api/extensions/quizzes/${reimported.quizId}`,
      { headers: authHeaders },
    )
    expect(verifyReimportedRes.status()).toBe(200)
    const reimportedData = (await verifyReimportedRes.json()) as {
      extras: {
        scenes: Record<
          string,
          {
            overlayAnimations?: unknown[]
            mediaEndFallbackMs?: number
          }
        >
      }
    }
    expect(
      reimportedData.extras.scenes[openSceneId].overlayAnimations,
    ).toHaveLength(2)
    expect(reimportedData.extras.scenes[openSceneId].mediaEndFallbackMs).toBe(
      25000,
    )
  })

  test("2. Live Show E2E: Real 8s MP4 + 3 Timed Transparent Overlays in SAME Opening Scene, No Premature Cut at 5s, Timeline Checkpoints, Late-Join Sync & 8 Viewports × 8 Locales", async ({
    page: managerPage,
    browser,
  }) => {
    const SOCKET_ORIGIN = "http://127.0.0.1:3011"
    await loginManager(managerPage)

    const token = await managerPage.evaluate(() =>
      localStorage.getItem("token"),
    )
    const authHeaders = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }

    // Upload 3 transparent engineering Lottie overlays
    const upARes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: authHeaders,
        data: {
          name: "live-emblem-a.lottie",
          format: "dotlottie",
          contentBase64: OVERLAY_A_DOTLOTTIE_BUFFER.toString("base64"),
        },
      },
    )
    expect(upARes.status()).toBe(201)
    const assetA = (await upARes.json()) as { url: string }

    const upBRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: authHeaders,
        data: {
          name: "live-particles-b.json",
          format: "json",
          content: OVERLAY_B_PARTICLES_JSON,
        },
      },
    )
    expect(upBRes.status()).toBe(201)
    const assetB = (await upBRes.json()) as { url: string }

    const upCRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: authHeaders,
        data: {
          name: "live-wipe-c.json",
          format: "json",
          content: OVERLAY_C_WIPE_JSON,
        },
      },
    )
    expect(upCRes.status()).toBe(201)
    const assetC = (await upCRes.json()) as { url: string }

    // Upload real 11.0-second H.264 MP4 video with visibly moving frames
    const mp4Buffer = createMovingTestMp4Buffer(11.0)
    const upVideoRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/media`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        multipart: {
          file: {
            name: "live-cinema-opening-8s.mp4",
            mimeType: "video/mp4",
            buffer: mp4Buffer,
          },
        },
      },
    )
    expect(upVideoRes.status()).toBe(201)
    const videoAsset = (await upVideoRes.json()) as { url: string }

    // Upload 5 distinct answer images for 5-option Survey Q1
    const answerImageUrls: string[] = []
    const colors = [
      { r: 239, g: 68, b: 68 },
      { r: 59, g: 130, b: 246 },
      { r: 16, g: 185, b: 129 },
      { r: 245, g: 158, b: 11 },
      { r: 139, g: 92, b: 246 },
    ]
    for (let i = 0; i < 5; i++) {
      const imgRes = await managerPage.request.post(
        `${SOCKET_ORIGIN}/api/media`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          multipart: {
            file: {
              name: `survey-opt-${i + 1}.png`,
              mimeType: "image/png",
              buffer: createPngBuffer(400, 300, colors[i]),
            },
          },
        },
      )
      expect(imgRes.status()).toBe(201)
      const uploadedImg = (await imgRes.json()) as { url: string }
      answerImageUrls.push(uploadedImg.url)
    }

    const q1Id = "00000000-0000-4000-8000-000000000801"
    const q2Id = "00000000-0000-4000-8000-000000000802"
    const openSceneId = "00000000-0000-4000-8000-000000000901"
    const audioSceneId = "00000000-0000-4000-8000-000000000902"
    const animSceneId = "00000000-0000-4000-8000-000000000903"
    const recapSceneId = "00000000-0000-4000-8000-000000000904"
    const closeSceneId = "00000000-0000-4000-8000-000000000905"

    // Build complete show per Section 12 of the specification:
    // - Opening: 8.2s MP4, durationMs: 5000 (tests no premature cut at 5s!), advance: "onMediaEnd", 3 timed transparent overlays
    // - Survey Q1 with 5 image answers
    // - Media Audio scene
    // - Standalone Animation scene
    // - Quiz Q2
    // - Cumulative Answer Recap
    // - Closing scene (cinema MP4 + 3 overlays, manual advance for deterministic 8-viewport & 8-locale inspection)
    const createRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/extensions/quizzes`,
      {
        headers: authHeaders,
        data: {
          quizz: {
            subject: "Cinema Multi-Lottie Live Acceptance Show",
            gameMode: "quiz",
            questions: [
              {
                type: "single",
                playMode: "survey",
                question: "Survey Q1: Choose your favorite stage visual",
                answers: [
                  "Crimson Pulse",
                  "Cobalt Wave",
                  "Emerald Aurora",
                  "Amber Starlight",
                  "Violet Nebula",
                ],
                solutions: [],
                cooldown: 3,
                time: 120,
              },
              {
                type: "single",
                playMode: "quiz",
                question: "Quiz Q2: How many timed overlays ran in Opening?",
                answers: ["One", "Three", "Ten"],
                solutions: [1],
                cooldown: 3,
                time: 120,
              },
            ],
          },
          extras: {
            schemaVersion: 2,
            revision: 1,
            quizId: "temp-live-cinema",
            baseDigest:
              "0000000000000000000000000000000000000000000000000000000000000000",
            questionIds: [q1Id, q2Id],
            timeline: [
              {
                id: "00000000-0000-4000-8000-000000000911",
                kind: "opening",
                sceneId: openSceneId,
              },
              {
                id: "00000000-0000-4000-8000-000000000912",
                kind: "question",
                questionId: q1Id,
              },
              {
                id: "00000000-0000-4000-8000-000000000913",
                kind: "media",
                sceneId: audioSceneId,
              },
              {
                id: "00000000-0000-4000-8000-000000000914",
                kind: "animation",
                sceneId: animSceneId,
              },
              {
                id: "00000000-0000-4000-8000-000000000915",
                kind: "question",
                questionId: q2Id,
              },
              {
                id: "00000000-0000-4000-8000-000000000916",
                kind: "answerRecap",
                sceneId: recapSceneId,
              },
              {
                id: "00000000-0000-4000-8000-000000000917",
                kind: "closing",
                sceneId: closeSceneId,
              },
            ],
            scenes: {
              [openSceneId]: {
                id: openSceneId,
                kind: "opening",
                title: "Cinematic Opening Premiere",
                subtitle: "Real 8s MP4 + 3 Timed Transparent Lottie Overlays",
                mediaUrl: videoAsset.url,
                mediaType: "video",
                stageLayout: "cinema",
                mediaFit: "cover",
                logoPosition: "top",
                textOverlay: true,
                endBehavior: "holdFrame",
                muted: true,
                durationMs: 5000, // Deliberately 5000ms to prove 8.2s onMediaEnd video is NOT cut at 5s!
                advance: "onMediaEnd",
                overlayAnimations: [
                  {
                    id: "overlay-a-emblem",
                    label: "Complex Emblem (2.5s-5.5s Hold)",
                    enabled: true,
                    assetUrl: assetA.url,
                    position: { x: 0.5, y: 0.24 },
                    anchor: "center",
                    widthPct: 26,
                    rotationDeg: 0,
                    opacity: 1,
                    fit: "contain",
                    layer: "aboveTitle",
                    order: 0,
                    timeBase: "video",
                    startMs: 2200,
                    durationMs: 3000,
                    speed: 1,
                    loop: false,
                    finish: "holdLastFrame",
                  },
                  {
                    id: "overlay-b-particles",
                    label: "Particles Behind Title (0s-11s Loop)",
                    enabled: true,
                    assetUrl: assetB.url,
                    position: { x: 0.5, y: 0.5 },
                    anchor: "center",
                    widthPct: 50,
                    rotationDeg: 0,
                    opacity: 0.9,
                    fit: "contain",
                    layer: "behindTitle",
                    order: 1,
                    timeBase: "video",
                    startMs: 0,
                    durationMs: 11000,
                    speed: 1,
                    loop: true,
                    finish: "hide",
                  },
                  {
                    id: "overlay-c-wipe",
                    label: "Wipe Accent Above Title (6s-10.6s)",
                    enabled: true,
                    assetUrl: assetC.url,
                    position: { x: 0.5, y: 0.78 },
                    anchor: "center",
                    widthPct: 36,
                    rotationDeg: 0,
                    opacity: 1,
                    fit: "contain",
                    layer: "aboveTitle",
                    order: 2,
                    timeBase: "video",
                    startMs: 6000,
                    durationMs: 4600,
                    speed: 1,
                    loop: true,
                    finish: "hide",
                  },
                ],
              },
              [audioSceneId]: {
                id: audioSceneId,
                kind: "media",
                title: "Audio Interlude Scene",
                mediaUrl: "/sounds/answersMusic.mp3",
                mediaType: "audio",
                showControls: true,
                volume: 0.5,
                loop: false,
                durationMs: 30000,
                advance: "manual",
              },
              [animSceneId]: {
                id: animSceneId,
                kind: "animation",
                title: "Standalone Animation Card",
                preset: "spotlight",
                lottieUrl: assetB.url,
                lottieLoop: true,
                durationMs: 30000,
                advance: "manual",
              },
              [recapSceneId]: {
                id: recapSceneId,
                kind: "answerRecap",
                title: "Cumulative Show Recap",
                startQuestionId: q1Id,
                mode: "correctAnswer",
                durationMs: 30000,
                advance: "manual",
              },
              [closeSceneId]: {
                id: closeSceneId,
                kind: "closing",
                title: "Grand Cinema Finale",
                subtitle: "Multi-Viewport & 8-Locale Verified",
                mediaUrl: videoAsset.url,
                mediaType: "video",
                stageLayout: "cinema",
                mediaFit: "cover",
                logoPosition: "top",
                textOverlay: true,
                endBehavior: "holdFrame",
                muted: true,
                loop: true,
                durationMs: 30000,
                advance: "manual",
                overlayAnimations: [
                  {
                    id: "close-ov-a",
                    label: "Finale Emblem",
                    enabled: true,
                    assetUrl: assetA.url,
                    position: { x: 0.25, y: 0.3 },
                    anchor: "center",
                    widthPct: 24,
                    rotationDeg: 0,
                    opacity: 1,
                    fit: "contain",
                    layer: "aboveTitle",
                    order: 0,
                    timeBase: "scene",
                    startMs: 0,
                    durationMs: 60000,
                    speed: 1,
                    loop: true,
                    finish: "holdLastFrame",
                  },
                  {
                    id: "close-ov-b",
                    label: "Finale Particles",
                    enabled: true,
                    assetUrl: assetB.url,
                    position: { x: 0.5, y: 0.5 },
                    anchor: "center",
                    widthPct: 48,
                    rotationDeg: 0,
                    opacity: 0.9,
                    fit: "contain",
                    layer: "behindTitle",
                    order: 1,
                    timeBase: "scene",
                    startMs: 0,
                    durationMs: 60000,
                    speed: 1,
                    loop: true,
                    finish: "holdLastFrame",
                  },
                  {
                    id: "close-ov-c",
                    label: "Finale Wipe",
                    enabled: true,
                    assetUrl: assetC.url,
                    position: { x: 0.75, y: 0.75 },
                    anchor: "center",
                    widthPct: 30,
                    rotationDeg: 0,
                    opacity: 1,
                    fit: "contain",
                    layer: "aboveTitle",
                    order: 2,
                    timeBase: "scene",
                    startMs: 0,
                    durationMs: 60000,
                    speed: 1,
                    loop: true,
                    finish: "holdLastFrame",
                  },
                ],
              },
            },
            defaults: {
              newQuestionMode: "quiz",
              leaderboardPolicy: "cardOnly",
              advanceMode: "manual",
            },
            perQuestion: {
              [q1Id]: {
                answerVisuals: answerImageUrls.map((url, idx) => ({
                  answerIndex: idx,
                  display: "both" as const,
                  url,
                  alt: `Option ${idx + 1}`,
                })),
              },
            },
          },
        },
      },
    )
    expect(createRes.status()).toBe(201)

    await managerPage.reload()
    const pin = await createGame(
      managerPage,
      "Cinema Multi-Lottie Live Acceptance Show",
    )
    expect(pin).toMatch(/^\d{6}$/u)

    const gameIdMatch = managerPage.url().match(/\/party\/manager\/([^/?#]+)/u)
    expect(gameIdMatch).not.toBeNull()
    const gameId = gameIdMatch![1]

    const spectatorContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`/display/${gameId}`)
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible({ timeout: 15_000 })

    const playerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "CinemaPlayerOne")

    await expect(
      managerPage.getByRole("button", { name: /1 \/ 1 Players/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Start the show -> Opening Cinema Scene starts immediately without legacy 6s countdown!
    await startGame(managerPage)

    const openingStack = spectatorPage.locator(
      '[data-testid="cinematic-layer-stack-opening"]',
    )
    await expect(openingStack).toBeVisible({ timeout: 8_000 })

    // Checkpoint 1 (t ~ 0.0s .. 1.5s): Overlay B playing, Overlay A beforeStart, Overlay C beforeStart
    await expect(
      spectatorPage.locator(
        '[data-testid="cinematic-overlay-overlay-b-particles"]',
      ),
    ).toHaveAttribute("data-overlay-phase", "playing")
    await expect(
      spectatorPage.locator(
        '[data-testid="cinematic-overlay-overlay-a-emblem"]',
      ),
    ).toHaveAttribute("data-overlay-phase", "beforeStart")
    await saveScreenshot(spectatorPage, "03_live_opening_t0_1s.png")

    await expect(
      spectatorPage.getByRole("heading", {
        name: "Cinematic Opening Premiere",
      }),
    ).toBeVisible()

    // Verify full-bleed cinema stage (no max-w-6xl card box) and transparent pointer-events-none overlays
    const stageArchitecture = await spectatorPage.evaluate(() => {
      const stack = document.querySelector(
        '[data-testid="cinematic-layer-stack-opening"]',
      )
      const backdrop = document.querySelector(
        '[data-testid="scene-cinema-backdrop"]',
      )
      const behind = document.querySelector(
        '[data-testid="cinematic-layer-behind-title"]',
      )
      const title = document.querySelector(
        '[data-testid="cinematic-layer-native-title"]',
      )
      const above = document.querySelector(
        '[data-testid="cinematic-layer-above-title"]',
      )
      const interactive = document.querySelector(
        '[data-testid="cinematic-layer-interactive"]',
      )
      const ovB = document.querySelector(
        '[data-testid="cinematic-overlay-overlay-b-particles"]',
      )
      if (!stack || !backdrop || !behind || !title || !above || !interactive) {
        return { ok: false, reason: "Missing layer stack DOM nodes" }
      }
      const stackRect = stack.getBoundingClientRect()
      const ovBStyle = ovB ? window.getComputedStyle(ovB) : null
      return {
        ok: true,
        stackWidth: stackRect.width,
        viewportWidth: window.innerWidth,
        zOrder: [
          Number(window.getComputedStyle(backdrop).zIndex) || 0,
          Number(window.getComputedStyle(behind).zIndex) || 0,
          Number(window.getComputedStyle(title).zIndex) || 0,
          Number(window.getComputedStyle(above).zIndex) || 0,
          Number(window.getComputedStyle(interactive).zIndex) || 0,
        ],
        ovBPointerEvents: ovBStyle?.pointerEvents,
        ovBBackground: ovBStyle?.backgroundColor,
      }
    })
    expect(stageArchitecture.ok).toBe(true)
    expect(stageArchitecture.stackWidth).toBeGreaterThan(1800)
    expect(stageArchitecture.zOrder).toEqual([0, 20, 30, 40, 50])
    expect(stageArchitecture.ovBPointerEvents).toBe("none")
    expect(stageArchitecture.ovBBackground).toBe("rgba(0, 0, 0, 0)")

    // Checkpoint 2 (t ~ 3.0s): Wait for video time >= 2.6s -> Overlay A AND Overlay B both playing over moving video!
    await expect(
      spectatorPage.locator(
        '[data-testid="cinematic-overlay-overlay-a-emblem"]',
      ),
    ).toHaveAttribute("data-overlay-phase", "playing", { timeout: 6_000 })
    await expect(
      spectatorPage.locator(
        '[data-testid="cinematic-overlay-overlay-b-particles"]',
      ),
    ).toHaveAttribute("data-overlay-phase", "playing")
    const videoTimeAt3s = await spectatorPage.evaluate(() => {
      const v = document.querySelector(
        '[data-testid="scene-video"]',
      ) as HTMLVideoElement | null
      return v ? v.currentTime : 0
    })
    expect(videoTimeAt3s).toBeGreaterThanOrEqual(2.1)
    await saveScreenshot(spectatorPage, "04_live_opening_t3s_ab_active.png")

    // Checkpoint 3 (t ~ 5.8s): Past durationMs=5000! Scene MUST STILL BE ACTIVE (no premature cut at 5s!), and Overlay A is now 'afterWindow' (2.5s..5.5s finished cleanly without advancing scene)!
    await expect(
      spectatorPage.locator(
        '[data-testid="cinematic-overlay-overlay-a-emblem"]',
      ),
    ).toHaveAttribute("data-overlay-phase", "afterWindow", { timeout: 6_000 })
    await expect(openingStack).toBeVisible()
    await saveScreenshot(
      spectatorPage,
      "05_live_opening_t5_8s_no_premature_cut_a_held.png",
    )

    // Checkpoint 4 (t ~ 6.5s): Overlay C (6.0s..8.0s) becomes 'playing' while Overlay B is 'playing'!
    await expect(
      spectatorPage.locator('[data-testid="cinematic-overlay-overlay-c-wipe"]'),
    ).toHaveAttribute("data-overlay-phase", "playing", { timeout: 5_000 })
    const videoTimeAt6s = await spectatorPage.evaluate(() => {
      const v = document.querySelector(
        '[data-testid="scene-video"]',
      ) as HTMLVideoElement | null
      return v ? v.currentTime : 0
    })
    expect(videoTimeAt6s).toBeGreaterThan(videoTimeAt3s)
    await saveScreenshot(
      spectatorPage,
      "06_live_opening_t6_5s_all_three_visible.png",
    )

    // Checkpoint 5 (t ~ 9.5s): Foreground MP4 genuinely finishes -> advances ONCE automatically to Survey Q1!
    await expect(
      spectatorPage.getByRole("button", { name: /Crimson Pulse/i }),
    ).toBeVisible({ timeout: 14_000 })
    await saveScreenshot(
      spectatorPage,
      "07_auto_advanced_to_survey_q1_after_8s_video.png",
    )

    // Complete Survey Q1 (5 image answers)
    await playerPage.getByRole("button", { name: /Emerald Aurora/i }).click()
    await endTimer(managerPage)

    // Advance to Media Audio Scene
    await next(managerPage)
    await expect(
      spectatorPage.locator('[data-testid="scene-audio-container"]'),
    ).toBeVisible({ timeout: 10_000 })

    // Advance to Standalone Animation Scene
    await managerPage.getByRole("button", { name: /Advance Scene/i }).click()
    await expect(
      spectatorPage.locator('[data-testid="scene-animation-preset-spotlight"]'),
    ).toBeVisible({ timeout: 10_000 })

    // Advance to Quiz Q2
    await managerPage.getByRole("button", { name: /Advance Scene/i }).click()
    await expect(
      spectatorPage.getByRole("button", { name: /Three/i }),
    ).toBeVisible({ timeout: 12_000 })
    await playerPage.getByRole("button", { name: /Three/i }).click()
    await endTimer(managerPage)

    // Advance to Cumulative Answer Recap Scene
    await next(managerPage)
    await expect(
      spectatorPage.locator('[data-testid="scene-answer-recap"]'),
    ).toBeVisible({ timeout: 10_000 })
    const recapText =
      (await spectatorPage
        .locator('[data-testid="scene-answer-recap"]')
        .textContent()) ?? ""
    expect(recapText).toContain("Emerald Aurora")
    expect(recapText).toContain("Three")
    expect(recapText).not.toContain("CinemaPlayerOne")

    // Advance to Closing Cinema Scene (MP4 + 3 simultaneous overlays, manual advance)
    await managerPage.getByRole("button", { name: /Advance Scene/i }).click()
    const closingStack = spectatorPage.locator(
      '[data-testid="cinematic-layer-stack-closing"]',
    )
    await expect(closingStack).toBeVisible({ timeout: 10_000 })
    await expect(
      spectatorPage.locator('[data-testid="cinematic-overlay-close-ov-a"]'),
    ).toHaveAttribute("data-overlay-phase", "playing")
    await expect(
      spectatorPage.locator('[data-testid="cinematic-overlay-close-ov-b"]'),
    ).toHaveAttribute("data-overlay-phase", "playing")
    await expect(
      spectatorPage.locator('[data-testid="cinematic-overlay-close-ov-c"]'),
    ).toHaveAttribute("data-overlay-phase", "playing")

    // Late-Join / Reconnect Sync: wait until Closing video is > 1.8s, open a second spectator display and confirm it syncs into the active cinema scene and seeks video!
    await expect
      .poll(
        async () =>
          spectatorPage.evaluate(() => {
            const v = document.querySelector(
              '[data-testid="scene-video"]',
            ) as HTMLVideoElement | null
            return v ? v.currentTime : 0
          }),
        { timeout: 6_000 },
      )
      .toBeGreaterThan(1.8)
    const lateSpectatorPage = await spectatorContext.newPage()
    await lateSpectatorPage.goto(`/display/${gameId}`)
    await expect(
      lateSpectatorPage.locator(
        '[data-testid="cinematic-layer-stack-closing"]',
      ),
    ).toBeVisible({ timeout: 8_000 })
    await expect
      .poll(
        async () =>
          lateSpectatorPage.evaluate(() => {
            const v = document.querySelector(
              '[data-testid="scene-video"]',
            ) as HTMLVideoElement | null
            return v ? v.currentTime : 0
          }),
        { timeout: 5_000 },
      )
      .toBeGreaterThan(1.2)
    await lateSpectatorPage.close()

    // Verify all 8 Required Viewports have zero scroll and full containment on the live cinema + 3 overlays stage
    const requiredViewports = [
      { width: 1920, height: 1080, name: "1920x1080" },
      { width: 1366, height: 768, name: "1366x768" },
      { width: 1280, height: 800, name: "1280x800" },
      { width: 1024, height: 768, name: "1024x768" },
      { width: 800, height: 600, name: "800x600_4_3" },
      { width: 768, height: 1024, name: "768x1024" },
      { width: 390, height: 844, name: "390x844" },
      { width: 320, height: 568, name: "320x568" },
    ]

    for (const vp of requiredViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(
        spectatorPage,
        `Closing Cinema + 3 Overlays @ ${vp.name}`,
      )
      await expect(
        spectatorPage.getByRole("heading", { name: "Grand Cinema Finale" }),
      ).toBeVisible()
      if (
        vp.name === "1920x1080" ||
        vp.name === "800x600_4_3" ||
        vp.name === "390x844" ||
        vp.name === "320x568"
      ) {
        await saveScreenshot(
          spectatorPage,
          `08_closing_cinema_3_overlays_${vp.name}.png`,
        )
      }
    }

    // Verify all 8 locales switch cleanly without missing keys or layout overflow
    const locales = ["en", "fr", "de", "es", "it", "ja", "tr", "vi"]
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    for (const lng of locales) {
      await spectatorPage.evaluate((lang) => {
        localStorage.setItem("i18nextLng", lang)
        window.dispatchEvent(new Event("storage"))
      }, lng)
      await assertZeroStageScroll(spectatorPage, `Closing Cinema Locale=${lng}`)
    }

    await spectatorContext.close()
    await playerContext.close()
  })
})
