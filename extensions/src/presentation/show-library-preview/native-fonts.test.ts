import { describe, expect, it, vi } from "vitest"
import { acquireNativePreviewFonts } from "./native-fonts"

function fixture(deferred = false) {
  const faces: FakeFace[] = []
  const pending: Array<{
    resolve: () => void
    reject: (error: Error) => void
  }> = []
  const installed = new Set<FontFace>()

  class FakeFace {
    status = "unloaded"
    constructor(
      readonly family: string,
      readonly source: string,
      readonly descriptors: FontFaceDescriptors,
    ) {
      faces.push(this)
    }
    load() {
      this.status = "loading"

      if (!deferred) {
        this.status = "loaded"

        return Promise.resolve(this)
      }

      return new Promise<FakeFace>((resolve, reject) => {
        pending.push({
          resolve: () => {
            this.status = "loaded"
            resolve(this)
          },
          reject: (error) => {
            this.status = "error"
            reject(error)
          },
        })
      })
    }
  }

  const rule = (range: string, source: string) => ({
    cssText: "@font-face { font-family: Rubik Variable; }",
    style: {
      getPropertyValue: (name: string) =>
        ({
          "font-family": '"Rubik Variable"',
          "font-style": "normal",
          "font-weight": "300 900",
          "font-display": "swap",
          "unicode-range": range,
          src: source,
        })[name] ?? "",
    },
  })
  const Sheet = vi.fn(function createSheet() {
    return {
      cssRules: [
        rule("U+0-FF", 'url("data:font/woff2;base64,bGF0aW4=")'),
        rule("U+590-5FF", 'url("data:font/woff2;base64,aGVicmV3")'),
      ],
      replaceSync: vi.fn(),
    }
  })
  Object.defineProperty(Sheet.prototype, "replaceSync", { value: vi.fn() })

  const document = {
    defaultView: {
      FontFace: FakeFace,
      CSSStyleSheet: Sheet,
      CSSRule: { FONT_FACE_RULE: 5 },
    },
    fonts: installed,
  } as unknown as Document

  return { document, faces, pending, installed }
}

describe("private native preview document font ownership", () => {
  it("decodes immutable faces in the target document with original variable weights and ranges", async () => {
    const f = fixture()
    const binding = acquireNativePreviewFonts(f.document, "immutable-css")
    await binding.ready
    expect(f.faces).toHaveLength(2)
    expect(f.installed.size).toBe(2)
    expect(f.faces[1]).toMatchObject({
      family: "Rubik Variable",
      status: "loaded",
      descriptors: { weight: "300 900", unicodeRange: "U+590-5FF" },
    })
    binding.dispose()
    expect(f.installed.size).toBe(0)
  })

  it("shares duplicate mounts and removes only owned faces when the last mount closes", async () => {
    const f = fixture()
    const unrelated = {} as FontFace
    f.installed.add(unrelated)
    const first = acquireNativePreviewFonts(f.document, "immutable-css")
    const second = acquireNativePreviewFonts(f.document, "immutable-css")
    await Promise.all([first.ready, second.ready])
    expect(f.faces).toHaveLength(2)
    first.dispose()
    first.dispose()
    expect(f.installed.size).toBe(3)
    second.dispose()
    expect([...f.installed]).toEqual([unrelated])
    const next = acquireNativePreviewFonts(f.document, "immutable-css")
    await next.ready
    expect(f.faces).toHaveLength(4)
    next.dispose()
  })

  it("isolates parent and iframe documents", async () => {
    const parent = fixture()
    const frame = fixture()
    const first = acquireNativePreviewFonts(parent.document, "immutable-css")
    const second = acquireNativePreviewFonts(frame.document, "immutable-css")
    await Promise.all([first.ready, second.ready])
    first.dispose()
    expect(parent.installed.size).toBe(0)
    expect(frame.installed.size).toBe(2)
    second.dispose()
  })

  it("does not reinstall a face when an asynchronous decode finishes after disposal", async () => {
    const f = fixture(true)
    const binding = acquireNativePreviewFonts(f.document, "immutable-css")
    binding.dispose()
    expect(f.installed.size).toBe(0)
    for (const pending of f.pending) {
      pending.resolve()
    }
    await binding.ready
    expect(f.installed.size).toBe(0)
  })

  it("exposes decode failure and still releases every owned face", async () => {
    const f = fixture(true)
    const binding = acquireNativePreviewFonts(f.document, "immutable-css")
    f.pending[0].reject(new Error("Invalid font data"))
    f.pending[1].resolve()
    await expect(binding.ready).rejects.toThrow("Invalid font data")
    binding.dispose()
    expect(f.installed.size).toBe(0)
  })
})
