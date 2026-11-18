interface OwnedFontBinding {
  references: number
  faces: FontFace[]
  ready: Promise<void>
}

/** Font faces belong to a document, even when the renderer lives in a ShadowRoot. */
const bindingsByDocument = new WeakMap<
  Document,
  Map<string, OwnedFontBinding>
>()

function fontRules(rules: CSSRuleList): CSSFontFaceRule[] {
  const result: CSSFontFaceRule[] = []
  for (const rule of rules) {
    if (rule.cssText.startsWith("@font-face") && "style" in rule) {
      result.push(rule as CSSFontFaceRule)
    } else if ("cssRules" in rule) {
      result.push(...fontRules((rule as CSSGroupingRule).cssRules))
    }
  }

  return result
}

function immutableFontRules(
  ownerDocument: Document,
  immutableCss: string,
): CSSFontFaceRule[] {
  const owner = ownerDocument.defaultView

  if (
    typeof owner?.CSSStyleSheet === "function" &&
    typeof owner.CSSStyleSheet.prototype.replaceSync === "function"
  ) {
    const sheet = new owner.CSSStyleSheet()
    sheet.replaceSync(immutableCss)

    return fontRules(sheet.cssRules)
  }

  // Parse trusted immutable CSS without applying it to the host document.
  // This preserves the existing <style> renderer fallback on browsers that
  // support FontFace but do not support constructable stylesheets.
  const parser = ownerDocument.createElement("style")
  parser.media = "not all"
  parser.textContent = immutableCss
  ownerDocument.head.append(parser)

  try {
    return parser.sheet ? fontRules(parser.sheet.cssRules) : []
  } finally {
    parser.remove()
  }
}

export function acquireNativePreviewFonts(
  ownerDocument: Document,
  immutableCss: string,
): { ready: Promise<void>; dispose: () => void } {
  const owner = ownerDocument.defaultView

  if (!owner || typeof owner.FontFace !== "function") {
    return { ready: Promise.resolve(), dispose: () => undefined }
  }

  let bindings = bindingsByDocument.get(ownerDocument)

  if (!bindings) {
    bindings = new Map()
    bindingsByDocument.set(ownerDocument, bindings)
  }

  let binding = bindings.get(immutableCss)

  if (!binding) {
    const faces = immutableFontRules(ownerDocument, immutableCss).map(
      (rule) => {
        const value = (name: string) => rule.style.getPropertyValue(name).trim()
        const family = value("font-family").replace(/^(['"])(.*)\1$/u, "$2")
        const display = value("font-display")

        return new owner.FontFace(family, value("src"), {
          style: value("font-style") || "normal",
          weight: value("font-weight") || "normal",
          stretch: value("font-stretch") || "normal",
          display:
            display === "auto" ||
            display === "block" ||
            display === "fallback" ||
            display === "optional"
              ? display
              : "swap",
          unicodeRange: value("unicode-range") || "U+0-10FFFF",
        })
      },
    )
    for (const face of faces) {
      ownerDocument.fonts.add(face)
    }
    const ready = Promise.all(faces.map((face) => face.load())).then(
      () => undefined,
    )
    // A mount may be disposed before its first update. Preserve rejection for
    // update callers without leaving an unhandled font-loading promise.
    void ready.catch(() => undefined)
    binding = { references: 0, faces, ready }
    bindings.set(immutableCss, binding)
  }

  const owned = binding
  owned.references += 1
  let disposed = false

  return {
    ready: owned.ready,
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      owned.references -= 1

      if (owned.references === 0) {
        for (const face of owned.faces) {
          ownerDocument.fonts.delete(face)
        }
        bindings.delete(immutableCss)

        if (bindings.size === 0) {
          bindingsByDocument.delete(ownerDocument)
        }
      }
    },
  }
}
