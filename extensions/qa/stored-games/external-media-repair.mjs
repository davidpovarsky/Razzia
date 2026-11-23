/**
 * Plan a narrow owner media repair, then qualify it using ordinary native APIs.
 * The pure planner can support a separately reviewed production repair. This
 * executor is deliberately limited to the fresh isolated Linux QA host.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { computeCanonicalBaseDigest } from "../../src/core/digest.ts"

const byteDigest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const digest = computeCanonicalBaseDigest
const imageUrl = /^\/media\/[A-Za-z0-9_-]+\.png$/u

/** No reads or writes: preserve every field except the admitted typed image URLs. */
export function planQuestionImageRepair({ base, extras, replacements }) {
  assert(base && typeof base.id === "string" && Array.isArray(base.questions))
  assert(
    extras && Number.isInteger(extras.revision) && extras.revision > 0,
    "Repair requires the existing editor-created revision; never force an unversioned save",
  )
  assert.equal(extras.quizId, base.id)
  assert.equal(extras.questionIds.length, base.questions.length)
  const { id: _originalIdentity, ...originalPayload } = base
  assert(
    [digest(originalPayload), digest(base)].includes(extras.baseDigest),
    "The admitted revision must describe the current canonical base",
  )
  assert(Array.isArray(replacements) && replacements.length > 0)
  const targets = new Map()
  for (const item of replacements) {
    assert.equal(new URL(item.sourceUrl).protocol, "https:")
    assert.match(item.targetUrl, imageUrl)
    assert(
      !targets.has(item.sourceUrl),
      "One mapping for each exact external URL",
    )
    targets.set(item.sourceUrl, item.targetUrl)
  }
  const nextBase = structuredClone(base)
  const paths = []
  const counts = new Map([...targets.keys()].map((url) => [url, 0]))
  for (const [index, question] of nextBase.questions.entries()) {
    const target = targets.get(question.media?.url)

    if (!target) {
      continue
    }

    assert.equal(
      question.media.type,
      "image",
      "Only explicitly typed question images may be repaired",
    )
    const source = question.media.url
    question.media.url = target
    counts.set(source, counts.get(source) + 1)
    paths.push(`questions[${index}].media.url`)
  }
  assert(
    [...counts.values()].every((count) => count > 0),
    "Every mapping has an active typed image reference",
  )
  const { id: _storageIdentity, ...quizz } = nextBase
  const baseDigest = digest(quizz)

  return {
    base: nextBase,
    paths,
    mappings: replacements.map((item) => ({
      sourceUrlDigest: digest(item.sourceUrl),
      targetUrlDigest: digest(item.targetUrl),
      references: counts.get(item.sourceUrl),
    })),
    payload: {
      expectedRevision: extras.revision,
      quizz,
      extras: { ...structuredClone(extras), baseDigest },
    },
  }
}

/**
 * The request is the existing Playwright APIRequestContext of the synthetic owner.
 * Mirror bytes are read through its authenticated native /media route, verified,
 * then uploaded through POST /api/media. The mirror URL is never saved directly.
 */

export async function qualifyOwnerImageRepair(options) {
  assert.equal(process.platform, "linux")
  assert.equal(process.env.TADAZZ_QA_OWNED_RUN_DIR, "1")
  const {
    request,
    origin,
    token,
    quizId,
    externalAssets,
    evidenceDirectory,
    fixtureId,
  } = options
  assert.match(quizId, /^[A-Za-z0-9_-]{1,200}$/u)
  assert.match(fixtureId, /^stored-[a-f0-9]{20}$/u)
  const nativeOrigin = new URL(origin)
  assert.equal(nativeOrigin.hostname, "127.0.0.1")
  assert.equal(nativeOrigin.protocol, "https:")
  assert.equal(nativeOrigin.origin, origin)
  const evidence = resolve(evidenceDirectory)
  assert(
    evidence.startsWith("/evidence/") && realpathSync(evidence) === evidence,
  )
  assert(
    lstatSync(evidence).isDirectory() && !lstatSync(evidence).isSymbolicLink(),
  )
  const privateDirectory = join(evidence, "external-media-repairs")
  mkdirSync(privateDirectory, { recursive: true, mode: 0o700 })
  assert(realpathSync(privateDirectory) === privateDirectory)
  const headers = { Authorization: `Bearer ${token}` }
  const path = `/api/extensions/quizzes/${quizId}`
  const previewPath = `/api/extensions/preview/quizzes/${quizId}`
  const read = async (suffix) => {
    const response = await request.get(origin + suffix, { headers })
    assert.equal(response.status(), 200, "Authenticated owner read")

    return response.json()
  }
  const snapshot = async () => ({
    base: await read(`/api/quizz/${quizId}`),
    composite: await read(path),
  })
  const savePrivate = (name, value) =>
    writeFileSync(
      join(privateDirectory, `${fixtureId}.${name}.json`),
      `${JSON.stringify(value, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    )
  const receipt = {
    fixtureId,
    passed: false,
    scope: "synthetic-owner-only",
    productionChanged: false,
    quizIdentityDigest: digest(quizId),
    sourceFixtureWritten: false,
    originalUrlPlayedOverInternet: false,
    operation: "owner-upload-and-revisioned-composite-save",
    assets: [],
  }
  let phase = "original-preview"

  try {
    const originalPreview = await request.get(origin + previewPath, { headers })
    receipt.originalPreviewStatus = originalPreview.status()
    assert.equal(
      originalPreview.status(),
      422,
      "Observe the original strict external-media rejection",
    )
    const before = await snapshot()
    assert.equal(before.base.id, quizId)
    assert.equal(before.composite.quizId, quizId)
    assert(
      before.composite.extras,
      "Perform the normal editor save before repairing a legacy quiz",
    )
    const mirrors = externalAssets.map((item) => item.mirror)
    assert(
      mirrors.length > 0 && mirrors.every(Boolean),
      "Every repaired URL requires an admitted exact mirror",
    )
    assert.equal(
      new Set(mirrors.map((mirror) => mirror.sourceUrl)).size,
      mirrors.length,
    )
    // Validate eligible typed references before making even the first upload.
    planQuestionImageRepair({
      base: before.base,
      extras: before.composite.extras,
      replacements: mirrors.map((mirror) => ({
        sourceUrl: mirror.sourceUrl,
        targetUrl: "/media/qa-preflight.png",
      })),
    })
    savePrivate("before", before)
    receipt.before = {
      baseSha256: digest(before.base),
      extrasSha256: digest(before.composite.extras),
      revision: before.composite.extras.revision,
    }
    phase = "verified-owner-upload"
    const replacements = []
    for (const mirror of mirrors) {
      assert.equal(mirror.sourceHttpStatus, 200)
      assert.equal(mirror.contentType, "image/png")
      assert.match(mirror.sha256, /^[a-f0-9]{64}$/u)
      assert.match(
        mirror.nativeUrl,
        /^\/media\/qa-external-[a-f0-9]{64}\.png$/u,
      )
      assert.equal(
        mirror.manifestSha256,
        process.env.TADAZZ_PRIVATE_EXTERNAL_MEDIA_SHA256,
      )
      const original = await request.get(origin + mirror.nativeUrl, { headers })
      assert.equal(original.status(), 200)
      assert.match(
        original.headers()["content-type"] ?? "",
        /^image\/png(?:;|$)/u,
      )
      const bytes = await original.body()
      assert.equal(bytes.length, mirror.bytes)
      assert.equal(byteDigest(bytes), mirror.sha256)
      const upload = await request.post(`${origin}/api/media`, {
        headers,
        multipart: {
          file: {
            name: "verified-question-image.png",
            mimeType: "image/png",
            buffer: bytes,
          },
        },
      })
      assert.equal(
        upload.status(),
        201,
        "Use the ordinary authenticated MIME-checked media upload",
      )
      const media = await upload.json()
      assert.equal(media.type, "image")
      assert.match(media.url, imageUrl)
      assert.equal(media.url, `/media/${media.name}`)
      assert.notEqual(
        media.url,
        mirror.nativeUrl,
        "Save the real upload result, not the preseeded mirror",
      )
      const downloaded = await request.get(origin + media.url, { headers })
      assert.equal(downloaded.status(), 200)
      assert.match(
        downloaded.headers()["content-type"] ?? "",
        /^image\/png(?:;|$)/u,
      )
      assert.equal(
        byteDigest(await downloaded.body()),
        mirror.sha256,
        "Uploaded image bytes remain identical",
      )
      replacements.push({ sourceUrl: mirror.sourceUrl, targetUrl: media.url })
      receipt.assets.push({
        sourceUrlDigest: digest(mirror.sourceUrl),
        uploadedUrlDigest: digest(media.url),
        sha256: mirror.sha256,
        bytes: bytes.length,
        uploadStatus: 201,
        uploadedHttpStatus: 200,
        sourceVerifiedAt: mirror.verifiedAt,
        sourceHttpStatus: mirror.sourceHttpStatus,
        manifestSha256: mirror.manifestSha256,
      })
    }
    phase = "revisioned-composite-save"
    const latest = await snapshot()
    assert.deepEqual(
      latest,
      before,
      "Do not rebase or overwrite a concurrent edit after upload",
    )
    const plan = planQuestionImageRepair({
      base: latest.base,
      extras: latest.composite.extras,
      replacements,
    })
    savePrivate("plan", plan)
    const saved = await request.put(origin + path, {
      headers,
      data: plan.payload,
    })
    assert.equal(
      saved.status(),
      200,
      "Revision conflict must stop repair; never force overwrite",
    )
    const savedResult = await saved.json()
    assert.equal(savedResult.quizId, quizId)
    assert.equal(savedResult.revision, plan.payload.expectedRevision + 1)
    assert.equal(savedResult.baseDigest, plan.payload.extras.baseDigest)
    const after = await snapshot()
    assert.deepEqual(
      after.base,
      plan.base,
      "Only the admitted image URL fields may change",
    )
    assert.deepEqual(
      after.composite.extras,
      {
        ...plan.payload.extras,
        revision: savedResult.revision,
      },
      "Keep every authored ID, timeline, scene, audio and other sidecar field",
    )
    savePrivate("after", after)
    receipt.after = {
      baseSha256: digest(after.base),
      extrasSha256: digest(after.composite.extras),
      revision: after.composite.extras.revision,
    }
    receipt.semanticDelta = {
      kind: "typed-question-image-url-only",
      paths: plan.paths,
      mappings: plan.mappings,
    }
    receipt.authoredFieldsPreserved = true
    phase = "strict-preview-and-revision-verification"
    const preview = await request.get(origin + previewPath, { headers })
    receipt.repairedPreviewStatus = preview.status()
    assert.equal(
      preview.status(),
      200,
      "The repaired saved game must pass the unchanged strict preview reader",
    )
    const projected = await preview.json()
    assert.equal(projected.source.quizId, quizId)
    for (const [index, replacement] of replacements.entries()) {
      const asset = projected.assets.find(
        (item) => item.url === replacement.targetUrl,
      )
      assert(asset, "Strict preview admits each actual owner upload")
      assert.equal(asset.sha256, receipt.assets[index].sha256)
      assert.equal(asset.bytes, receipt.assets[index].bytes)
    }
    const foreignUrl = await request.post(
      `${origin}/api/extensions/preview/assets`,
      {
        headers,
        data: { urls: [mirrors[0].sourceUrl] },
      },
    )
    assert.equal(
      foreignUrl.status(),
      422,
      "Foreign HTTPS URLs remain outside the owner media boundary",
    )
    const stale = await request.put(origin + path, {
      headers,
      data: plan.payload,
    })
    assert.equal(
      stale.status(),
      409,
      "A stale revision cannot overwrite the repaired game",
    )
    assert.deepEqual(
      await snapshot(),
      after,
      "Rejected stale save changes no game data",
    )
    receipt.staleRevisionStatus = 409
    receipt.externalUrlStillDeniedStatus = 422
    receipt.passed = true
    savePrivate("receipt", receipt)

    return {
      base: after.base,
      extras: after.composite.extras,
      uploadedUrls: replacements.map((item) => item.targetUrl),
      receipt,
    }
  } catch (error) {
    receipt.failedAt = phase
    receipt.errorDigest = digest(String(error?.message ?? error))
    savePrivate("failure", receipt)
    Object.defineProperty(error, "repairReceipt", { value: receipt })
    throw error
  }
}
