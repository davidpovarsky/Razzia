import { describe, expect, it } from "vitest"
import { showMediaCatalogItemSchema } from "./card-appearance"
import {
  createDotLottieArchive,
  MAX_LOTTIE_JSON_BYTES,
  validateDotLottieContainer,
  validateLottieJson,
} from "./lottie"

export const MINIMAL_VALID_LOTTIE_FIXTURE = {
  v: "5.7.4",
  fr: 60,
  ip: 0,
  op: 120,
  w: 400,
  h: 400,
  nm: "Tada Engineering Test Pulse",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Pulse Circle",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 200, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [80, 80, 100], e: [110, 110, 100] },
            { t: 60, s: [110, 110, 100], e: [80, 80, 100] },
            { t: 120, s: [80, 80, 100] },
          ],
        },
      },
      shapes: [
        {
          ty: "el",
          p: { a: 0, k: [0, 0] },
          s: { a: 0, k: [160, 160] },
          nm: "Ellipse Path 1",
        },
        {
          ty: "fl",
          c: { a: 0, k: [0.98, 0.75, 0.14, 1] },
          o: { a: 0, k: 100 },
          nm: "Fill 1",
        },
      ],
      ip: 0,
      op: 120,
      st: 0,
    },
  ],
}

describe("Lottie JSON Security & Schema Validator", () => {
  it("validates a clean Bodymovin Lottie JSON fixture and extracts metadata", () => {
    const res = validateLottieJson(JSON.stringify(MINIMAL_VALID_LOTTIE_FIXTURE))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.meta.fr).toBe(60)
      expect(res.meta.ip).toBe(0)
      expect(res.meta.op).toBe(120)
      expect(res.meta.w).toBe(400)
      expect(res.meta.h).toBe(400)
      expect(res.meta.durationMs).toBe(2000)
      expect(res.meta.layerCount).toBe(1)
      expect(res.meta.nm).toBe("Tada Engineering Test Pulse")
    }
  })

  it("rejects empty strings, malformed JSON, and non-object roots", () => {
    expect(validateLottieJson("").ok).toBe(false)
    expect(validateLottieJson("{bad json").ok).toBe(false)
    expect(validateLottieJson("[]").ok).toBe(false)
    expect(validateLottieJson("null").ok).toBe(false)
  })

  it("rejects missing or out-of-range Bodymovin dimensions, frame rates, and layers", () => {
    expect(
      validateLottieJson({ ...MINIMAL_VALID_LOTTIE_FIXTURE, fr: 0 }).ok,
    ).toBe(false)
    expect(
      validateLottieJson({ ...MINIMAL_VALID_LOTTIE_FIXTURE, fr: 500 }).ok,
    ).toBe(false)
    expect(
      validateLottieJson({ ...MINIMAL_VALID_LOTTIE_FIXTURE, ip: 120, op: 60 }).ok,
    ).toBe(false)
    expect(
      validateLottieJson({ ...MINIMAL_VALID_LOTTIE_FIXTURE, w: 0 }).ok,
    ).toBe(false)
    expect(
      validateLottieJson({ ...MINIMAL_VALID_LOTTIE_FIXTURE, layers: [] }).ok,
    ).toBe(false)
  })

  it("rejects executable Lottie expressions (property 'x' on animated values)", () => {
    const withExpression = structuredClone(MINIMAL_VALID_LOTTIE_FIXTURE)
    ;(withExpression.layers[0].ks.o as Record<string, unknown>).x =
      "var $bm_rt = wiggle(5, 20);"
    const res = validateLottieJson(withExpression)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("errors:extensions.unsafeLottieContent")
    }
  })

  it("rejects embedded script tags, javascript: URLs, foreignObject, and eval()", () => {
    for (const payload of [
      "<script>alert(1)</script>",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "<foreignObject><body onload=alert(1)>",
      "eval('alert(1)')",
    ]) {
      const bad = {
        ...MINIMAL_VALID_LOTTIE_FIXTURE,
        nm: payload,
      }
      const res = validateLottieJson(bad)
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe("errors:extensions.unsafeLottieContent")
      }
    }
  })

  it("rejects external network URLs and path traversal in Lottie assets", () => {
    const withExternalAssetDir = {
      ...MINIMAL_VALID_LOTTIE_FIXTURE,
      assets: [{ id: "img_0", w: 100, h: 100, u: "https://cdn.example.com/", p: "logo.png" }],
    }
    expect(validateLottieJson(withExternalAssetDir).ok).toBe(false)

    const withExternalAssetPath = {
      ...MINIMAL_VALID_LOTTIE_FIXTURE,
      assets: [{ id: "img_0", w: 100, h: 100, u: "", p: "https://cdn.example.com/logo.png" }],
    }
    expect(validateLottieJson(withExternalAssetPath).ok).toBe(false)

    const withTraversalAsset = {
      ...MINIMAL_VALID_LOTTIE_FIXTURE,
      assets: [{ id: "img_0", w: 100, h: 100, u: "", p: "../../etc/passwd" }],
    }
    expect(validateLottieJson(withTraversalAsset).ok).toBe(false)

    // Safe inline raster base64 data URI is allowed when u is empty
    const withSafeInlineRaster = {
      ...MINIMAL_VALID_LOTTIE_FIXTURE,
      assets: [
        {
          id: "img_0",
          w: 1,
          h: 1,
          u: "",
          p: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          e: 1,
        },
      ],
    }
    expect(validateLottieJson(withSafeInlineRaster).ok).toBe(true)
  })

  it("rejects oversized Lottie payloads exceeding 2MB", () => {
    const huge = new Uint8Array(MAX_LOTTIE_JSON_BYTES + 10)
    const res = validateLottieJson(huge)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("errors:extensions.lottieTooLarge")
    }
  })

  it("validates showMediaCatalogItemSchema with type 'lottie' and lottieMeta", () => {
    const validation = validateLottieJson(MINIMAL_VALID_LOTTIE_FIXTURE)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    const item = {
      name: "pulse.lottie.json",
      url: "/media/pulse.lottie.json",
      type: "lottie" as const,
      addedAt: Date.now(),
      lottieMeta: {
        ...validation.meta,
        loop: true,
        playbackRate: 1.25,
        fit: "contain" as const,
        role: "sceneAnimation" as const,
      },
    }
    const parsed = showMediaCatalogItemSchema.safeParse(item)
    expect(parsed.success).toBe(true)
  })

  it("detects baked full-frame solid backgrounds and warns without rejecting", () => {
    const withBakedBg = {
      ...MINIMAL_VALID_LOTTIE_FIXTURE,
      layers: [
        ...MINIMAL_VALID_LOTTIE_FIXTURE.layers,
        {
          ddd: 0,
          ind: 99,
          ty: 1,
          nm: "Solid BG",
          sw: 400,
          sh: 400,
          sc: "#000000",
          ip: 0,
          op: 120,
          st: 0,
        },
      ],
    }
    const res = validateLottieJson(withBakedBg)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.meta.hasBakedBackground).toBe(true)
      expect(res.meta.warnings).toContain(
        "warnings:extensions.lottieBakedBackground",
      )
    }
  })

  it("validates a self-contained .lottie ZIP container with manifest and internal PNG image", () => {
    const png1x1 = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    )
    const animWithArchiveImage = {
      ...MINIMAL_VALID_LOTTIE_FIXTURE,
      assets: [{ id: "img_0", w: 1, h: 1, u: "images/", p: "dot.png", e: 0 }],
    }
    const archive = createDotLottieArchive([
      {
        name: "manifest.json",
        data: JSON.stringify({
          version: "1.0",
          animations: [{ id: "intro", loop: false, speed: 1 }],
        }),
      },
      {
        name: "animations/intro.json",
        data: JSON.stringify(animWithArchiveImage),
      },
      { name: "images/dot.png", data: png1x1 },
    ])

    const res = validateDotLottieContainer(archive)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.animationIds).toEqual(["intro"])
      expect(res.convertedFromBodymovinZip).toBe(false)
      expect(res.meta.durationMs).toBe(2000)
    }
  })

  it("safely packages a clean Bodymovin ZIP (data.json + images/) into a canonical .lottie container", () => {
    const png1x1 = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    )
    const rawBodymovinZip = createDotLottieArchive([
      {
        name: "data.json",
        data: JSON.stringify({
          ...MINIMAL_VALID_LOTTIE_FIXTURE,
          assets: [
            { id: "img_0", w: 1, h: 1, u: "images/", p: "dot.png", e: 0 },
          ],
        }),
      },
      { name: "images/dot.png", data: png1x1 },
    ])

    const res = validateDotLottieContainer(rawBodymovinZip)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.convertedFromBodymovinZip).toBe(true)
      expect(res.animationIds).toEqual(["default"])
      // Resulting packaged archive must pass strict .lottie validation with conversion disabled
      const revalidated = validateDotLottieContainer(res.archiveBytes, {
        allowBodymovinZipConversion: false,
      })
      expect(revalidated.ok).toBe(true)
    }
  })

  it("rejects Zip Slip path traversal, nested ZIPs, bad image magic bytes, and scripts inside .lottie", () => {
    const traversalZip = createDotLottieArchive([
      {
        name: "../evil.json",
        data: JSON.stringify(MINIMAL_VALID_LOTTIE_FIXTURE),
      },
    ])
    expect(validateDotLottieContainer(traversalZip).ok).toBe(false)

    const nestedZip = createDotLottieArchive([
      {
        name: "manifest.json",
        data: JSON.stringify({ animations: [{ id: "a" }] }),
      },
      {
        name: "animations/a.json",
        data: JSON.stringify(MINIMAL_VALID_LOTTIE_FIXTURE),
      },
      { name: "images/fake.png", data: traversalZip },
    ])
    expect(validateDotLottieContainer(nestedZip).ok).toBe(false)

    const scriptManifestZip = createDotLottieArchive([
      {
        name: "manifest.json",
        data: JSON.stringify({
          generator: "<script>alert(1)</script>",
          animations: [{ id: "a" }],
        }),
      },
      {
        name: "animations/a.json",
        data: JSON.stringify(MINIMAL_VALID_LOTTIE_FIXTURE),
      },
    ])
    expect(validateDotLottieContainer(scriptManifestZip).ok).toBe(false)
  })
})
