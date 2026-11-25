// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
/**
 * The owner's opening Lotties (TADAZZ-Opening-4-5s.json, Scene-1.json) were
 * exported with an opaque full-canvas background plate as their bottom layer
 * (a 640×360 `rc` + `fl` shape). Played over the stage MP4 that plate would
 * hide the video completely, so the overlay copy removes ONLY that plate at
 * load time. The served asset stays byte-identical to the original file.
 */
export interface StrippedLottie {
  data: Record<string, unknown>
  removed: Array<{
    index: number
    kind: "solid" | "shape-rect"
    color?: number[]
  }>
}

type Json = Record<string, unknown>

/** Remove the identified export badge from the owner's 640×360 opening. */
export function stripOpeningExportWatermark(source: Json): Json {
  const meta = source.meta as Json | undefined
  const layers = source.layers as Json[] | undefined

  if (
    source.w !== 640 ||
    source.h !== 360 ||
    meta?.g !== "https://jitter.video" ||
    !Array.isArray(layers)
  ) {
    return source
  }

  const { 0: badge } = layers
  const parent = layers.find((layer) => layer.ind === badge?.parent)
  const position = (parent?.ks as Json | undefined)?.p as Json | undefined

  // This stationary topmost precomposition is the small lower-right export
  // badge, not one of the animated TADAZZ letters. Other animations are intact.
  if (
    badge?.ty !== 0 ||
    badge.refId !== "13" ||
    parent?.ty !== 3 ||
    position?.a !== 0 ||
    JSON.stringify(position.k) !== "[542,324]"
  ) {
    return source
  }

  return { ...source, layers: layers.slice(1) }
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" ? v : undefined

function staticValue(prop: unknown): unknown {
  if (prop && typeof prop === "object" && (prop as Json).a === 0) {
    return (prop as Json).k
  }

  return undefined
}

function isFullCanvasRectLayer(
  layer: Json,
  w: number,
  h: number,
): number[] | null {
  if (layer.ty !== 4 || layer.hasMask || layer.masksProperties) {
    return null
  }

  const shapes = Array.isArray(layer.shapes) ? (layer.shapes as Json[]) : []
  // Accept a flat [rc, fl] pair or a single group wrapping exactly that.
  const items =
    shapes.length === 1 && shapes[0]?.ty === "gr" && Array.isArray(shapes[0].it)
      ? (shapes[0].it as Json[]).filter((s) => s.ty !== "tr")
      : shapes

  if (items.length !== 2) {
    return null
  }

  const rc = items.find((s) => s.ty === "rc")
  const fl = items.find((s) => s.ty === "fl")

  if (!rc || !fl) {
    return null
  }

  const size = staticValue(rc.s)
  const pos = staticValue(rc.p)
  const opacity = staticValue(fl.o)
  const color = staticValue(fl.c)

  if (!Array.isArray(size) || !Array.isArray(pos) || !Array.isArray(color)) {
    return null
  }

  const [sw, sh] = size.map(Number)
  const [px, py] = pos.map(Number)
  const coversCanvas =
    sw >= w * 0.98 &&
    sh >= h * 0.98 &&
    Math.abs(px - w / 2) <= w * 0.02 &&
    Math.abs(py - h / 2) <= h * 0.02

  if (!coversCanvas || (typeof opacity === "number" && opacity < 99)) {
    return null
  }

  return color.map(Number)
}

export function stripLottieBackgroundPlate(source: Json): StrippedLottie {
  const w = num(source.w) ?? 0
  const h = num(source.h) ?? 0
  const layers = Array.isArray(source.layers) ? (source.layers as Json[]) : []
  const removed: StrippedLottie["removed"] = []
  // Only inspect the bottom of the stack (last layers), skipping null parents (ty 3).
  const keep = new Set(layers.map((_, i) => i))
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i]

    if (layer.ty === 3) {
      continue
    }

    if (layer.ty === 1) {
      const sw = num(layer.sw) ?? 0
      const sh = num(layer.sh) ?? 0

      if (sw >= w * 0.98 && sh >= h * 0.98) {
        keep.delete(i)
        removed.push({ index: i, kind: "solid" })

        continue
      }

      break
    }

    const color = isFullCanvasRectLayer(layer, w, h)

    if (color) {
      keep.delete(i)
      removed.push({ index: i, kind: "shape-rect", color })

      continue
    }

    break
  }

  return {
    data: { ...source, layers: layers.filter((_, i) => keep.has(i)) },
    removed,
  }
}
