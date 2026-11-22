// Private stopped-service maintenance only. This module never starts an HTTP host.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const persisted = (value) => JSON.parse(JSON.stringify(value))
const requireGate = (condition, code) => {
  if (!condition) {
    const error = new Error(code)
    error.code = code
    throw error
  }
}
const writePrivate = (file, value) => {
  const temporary = `${file}.pending`
  const fd = fs.openSync(temporary, "wx", 0o600)
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(temporary, file)
}
const readRegular = (file, limit) => {
  const before = fs.lstatSync(file)
  requireGate(
    before.isFile() && before.nlink === 1 && before.size <= limit,
    "UNSAFE_INPUT_FILE",
  )
  const bytes = fs.readFileSync(file)
  const after = fs.lstatSync(file)
  requireGate(
    before.ino === after.ino &&
      before.dev === after.dev &&
      before.size === after.size &&
      before.mtimeMs === after.mtimeMs,
    "INPUT_CHANGED_DURING_READ",
  )
  return bytes
}
const relativeFile = (root, relative) => {
  requireGate(
    typeof relative === "string" &&
      relative &&
      !path.isAbsolute(relative) &&
      !relative
        .split("/")
        .some((part) => !part || part === "." || part === ".."),
    "UNSAFE_RELATIVE_PATH",
  )
  const result = path.join(root, relative)
  requireGate(result.startsWith(`${root}${path.sep}`), "PATH_ESCAPE")
  return result
}
// Every old authored property must survive, apart from the two reviewed URLs.
function preserveOriginal(original, result, allowed, pointer = "") {
  if (allowed.has(pointer)) return
  if (Array.isArray(original)) {
    requireGate(
      Array.isArray(result) && original.length === result.length,
      "AUTHORED_ARRAY_CHANGED",
    )
    original.forEach((value, index) =>
      preserveOriginal(value, result[index], allowed, `${pointer}/${index}`),
    )
  } else if (original && typeof original === "object") {
    requireGate(
      result && typeof result === "object" && !Array.isArray(result),
      "AUTHORED_OBJECT_CHANGED",
    )
    for (const [key, value] of Object.entries(original)) {
      requireGate(Object.hasOwn(result, key), "AUTHORED_PROPERTY_REMOVED")
      preserveOriginal(value, result[key], allowed, `${pointer}/${key}`)
    }
  } else {
    requireGate(isDeepStrictEqual(original, result), "AUTHORED_VALUE_CHANGED")
  }
}

const mode = process.env.TADAZZ_NATIVE_MAINTENANCE_MODE
const resultPath = "/output/native-result.json"
const state = {
  version: 1,
  mode,
  passed: false,
  productionListenerStarted: false,
  saves: [],
}
try {
  requireGate(
    process.platform === "linux" && ["qualify", "apply"].includes(mode),
    "MAINTENANCE_MODE_REQUIRED",
  )
  requireGate(
    process.env.CONFIG_PATH === "/maintenance-config" &&
      process.env.TADAZZ_ACCOUNTS_ENABLED === "true",
    "MAINTENANCE_SCOPE_REQUIRED",
  )
  const rawPlan = readRegular("/input/plan.json", 4_000_000)
  requireGate(
    digest(rawPlan) === process.env.TADAZZ_PRIVATE_REPAIR_PLAN_SHA256,
    "PLAN_HASH_CHANGED",
  )
  const plan = JSON.parse(rawPlan)
  requireGate(
    plan.kind === "tadazz-example-media-repair-plan" &&
      plan.version === 1 &&
      plan.planId === process.env.TADAZZ_OWNED_MAINTENANCE_NONCE,
    "PLAN_IDENTITY_CHANGED",
  )
  requireGate(
    plan.sourceUrl === "https://placehold.co/600x400.png",
    "REPAIR_SOURCE_URL_CHANGED",
  )
  requireGate(
    plan.targets.length > 0 && plan.targets.length <= 2,
    "TARGET_COUNT_REJECTED",
  )
  requireGate(
    new Set(plan.targets.map((target) => target.ownerSha256)).size ===
      plan.targets.length,
    "DUPLICATE_TARGET_OWNER",
  )
  state.planSha256 = digest(rawPlan)
  state.planId = plan.planId
  const png = readRegular("/input/source.png", 8_000)
  requireGate(
    png.length === 7347 &&
      digest(png) ===
        "80899a7fbb91160fc4c494f22c31dfd8face8c47b189d2528e6471f1f2207bcf",
    "PNG_PIN_CHANGED",
  )
  requireGate(
    png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
      png.readUInt32BE(16) === 600 &&
      png.readUInt32BE(20) === 400,
    "PNG_DIMENSIONS_CHANGED",
  )
  let qualification = null
  if (mode === "apply") {
    const raw = readRegular("/input/qualified-native-result.json", 4_000_000)
    requireGate(
      digest(raw) === process.env.TADAZZ_QUALIFIED_NATIVE_SHA256,
      "QUALIFIED_NATIVE_HASH_CHANGED",
    )
    qualification = JSON.parse(raw)
    requireGate(
      qualification.passed === true &&
        qualification.mode === "qualify" &&
        qualification.planSha256 === state.planSha256,
      "MATCHING_QUALIFICATION_REQUIRED",
    )
  }

  // Load the reviewed candidate's ordinary services only after input admission.
  const [scope, native, mediaService, storage, core, preview, validators] =
    await Promise.all([
      import("../../../packages/socket/src/services/account-scope.ts"),
      import("../../../packages/socket/src/services/config.ts"),
      import("../../../packages/socket/src/services/media.ts"),
      import("../../src/server/storage/service.ts"),
      import("../../src/core/index.ts"),
      import("../../src/server/api/account-preview-source.ts"),
      import("../../../packages/common/src/validators/quizz.ts"),
    ])
  const configRoot = fs.realpathSync(process.env.CONFIG_PATH)
  const service = new storage.CompositeStorageService({
    getPath: native.getPath,
    getQuizzById: native.getQuizzById,
    saveQuizz: native.saveQuizz,
    updateQuizz: native.updateQuizz,
    deleteQuizz: native.deleteQuizz,
  })
  const prepared = []
  for (const target of plan.targets) {
    requireGate(
      digest(target.ownerId) === target.ownerSha256 &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(target.ownerId),
      "OWNER_BINDING_CHANGED",
    )
    requireGate(
      path.posix.dirname(target.baseRelative) ===
        `tenants/${target.ownerId}/quizz` &&
        target.sidecarRelative ===
          `tenants/${target.ownerId}/extensions/quizzes/${target.quizId}.json`,
      "OWNER_PHYSICAL_PATH_CHANGED",
    )
    await scope.withAccount(target.ownerId, () => {
      requireGate(
        native.getPath() === path.join(configRoot, "tenants", target.ownerId),
        "NATIVE_OWNER_SCOPE_CHANGED",
      )
      const raw = readRegular(
        relativeFile(configRoot, target.baseRelative),
        1_048_576,
      )
      requireGate(
        digest(raw) === target.baseSha256,
        "BASE_PRECONDITION_CHANGED",
      )
      const stored = JSON.parse(raw)
      requireGate(
        stored.id === target.quizId &&
          target.quizId === "TwGGo21j0nTD9XoSZAFzZ",
        "QUIZ_BINDING_CHANGED",
      )
      const side = relativeFile(configRoot, target.sidecarRelative)
      requireGate(
        target.sidecarSha256 === null
          ? !fs.existsSync(side)
          : fs.existsSync(side) &&
              digest(readRegular(side, 1_048_576)) === target.sidecarSha256,
        "SIDECAR_PRECONDITION_CHANGED",
      )
      const normalized = validators.quizzValidator.parse(
        validators.normalizeLegacyQuizz(stored),
      )
      preserveOriginal(stored, { id: stored.id, ...normalized }, new Set())
      requireGate(
        normalized.questions.length === 4 &&
          isDeepStrictEqual(target.questionIndices, [1, 2]),
        "QUESTION_SHAPE_CHANGED",
      )
      for (const index of target.questionIndices) {
        requireGate(
          normalized.questions[index]?.media?.type === "image" &&
            normalized.questions[index].media.url === plan.sourceUrl,
          "IMAGE_REFERENCE_CHANGED",
        )
      }
      const current = service.getCompositeQuiz(target.quizId)
      requireGate(
        current.exists &&
          current.digestMatches &&
          (current.extras?.revision ?? null) === target.expectedRevision,
        "NATIVE_COMPOSITE_CHANGED",
      )
      const qualified = qualification?.saves.find(
        (save) =>
          save.ownerSha256 === target.ownerSha256 &&
          save.quizIdHash === digest(target.quizId),
      )
      const extras =
        current.extras ??
        (mode === "apply"
          ? qualified?.preparedExtras
          : core.upgradeLegacyExtrasToV2(normalized, null, {
              quizId: target.quizId,
              baseDigest: core.computeCanonicalBaseDigest(normalized),
            }))
      requireGate(
        extras &&
          extras.quizId === target.quizId &&
          extras.questionIds.length === normalized.questions.length,
        "PREPARED_EXTRAS_REQUIRED",
      )
      if (mode === "apply") {
        requireGate(
          qualified &&
            isDeepStrictEqual(persisted(extras), qualified.preparedExtras),
          "QUALIFIED_EXTRA_IDS_CHANGED",
        )
      }
      prepared.push({ target, stored, normalized, extras: persisted(extras) })
    })
  }

  for (const item of prepared) {
    const { target, stored, normalized, extras } = item
    const record = {
      ownerSha256: target.ownerSha256,
      quizIdHash: digest(target.quizId),
      preparedExtras: extras,
      uploadedAsset: null,
      mayBeOrphan: false,
      committed: false,
    }
    state.saves.push(record)
    writePrivate(resultPath, state)
    await scope.withAccount(target.ownerId, async () => {
      requireGate(
        digest(
          readRegular(relativeFile(configRoot, target.baseRelative), 1_048_576),
        ) === target.baseSha256,
        "BASE_CHANGED_BEFORE_SAVE",
      )
      const uploaded = await mediaService.saveMedia(
        new File([png], "example-illustration.png", { type: "image/png" }),
      )
      requireGate(
        uploaded.type === "image" &&
          /^\/media\/[A-Za-z0-9_-]+\.png$/u.test(uploaded.url),
        "NATIVE_UPLOAD_REJECTED",
      )
      const assetRelative = `tenants/${target.ownerId}/${uploaded.url.slice(1)}`
      record.uploadedAsset = {
        relative: assetRelative,
        url: uploaded.url,
        sha256: digest(png),
        bytes: png.length,
      }
      record.mayBeOrphan = true
      writePrivate(resultPath, state)
      requireGate(
        digest(readRegular(relativeFile(configRoot, assetRelative), 8_000)) ===
          digest(png),
        "UPLOADED_BYTES_CHANGED",
      )
      const next = structuredClone(normalized)
      for (const index of target.questionIndices)
        next.questions[index].media.url = uploaded.url
      const allowed = new Set(
        target.questionIndices.map((index) => `/questions/${index}/media/url`),
      )
      preserveOriginal(stored, { id: stored.id, ...next }, allowed)
      const targetExtras = {
        ...structuredClone(extras),
        baseDigest: core.computeCanonicalBaseDigest(next),
      }
      const saved = service.saveCompositeQuiz({
        quizId: target.quizId,
        expectedRevision: target.expectedRevision,
        quizz: next,
        extras: targetExtras,
      })
      requireGate(
        saved.revision ===
          (target.expectedRevision === null ? 1 : target.expectedRevision + 1),
        "SAVED_REVISION_CHANGED",
      )
      const physical = JSON.parse(
        readRegular(relativeFile(configRoot, target.baseRelative), 1_048_576),
      )
      preserveOriginal(stored, physical, allowed)
      requireGate(
        isDeepStrictEqual(physical, { id: target.quizId, ...next }),
        "SAVED_BASE_CHANGED",
      )
      const final = service.getCompositeQuiz(target.quizId)
      requireGate(
        final.digestMatches &&
          isDeepStrictEqual(
            persisted(final.extras),
            persisted({ ...targetExtras, revision: saved.revision }),
          ),
        "SAVED_EXTRAS_CHANGED",
      )
      const projected = preview.readAccountPreviewSource(
        { getPath: native.getPath },
        target.quizId,
      )
      requireGate(
        projected.assets.some(
          (asset) =>
            asset.url === uploaded.url &&
            asset.sha256 === digest(png) &&
            asset.bytes === png.length,
        ),
        "NATIVE_PREVIEW_NOT_REPAIRED",
      )
      requireGate(
        final.quizz.questions.every(
          (question) => question.media?.url !== plan.sourceUrl,
        ),
        "EXTERNAL_IMAGE_REFERENCE_REMAINS",
      )
      record.committed = true
      record.mayBeOrphan = false
      record.revision = saved.revision
      record.baseSha256 = digest(
        readRegular(relativeFile(configRoot, target.baseRelative), 1_048_576),
      )
      record.sidecarSha256 = digest(
        readRegular(
          relativeFile(configRoot, target.sidecarRelative),
          1_048_576,
        ),
      )
      record.nativePreviewVerified = true
      writePrivate(resultPath, state)
    })
  }
  state.passed = true
  state.finishedAt = new Date().toISOString()
  writePrivate(resultPath, state)
  console.log(
    JSON.stringify({ passed: true, repairedOwners: state.saves.length, mode }),
  )
} catch (error) {
  state.failureCode =
    typeof error?.code === "string" && /^[A-Z_]{1,80}$/u.test(error.code)
      ? error.code
      : "NATIVE_REPAIR_FAILED"
  state.errorDigest = digest(String(error?.stack ?? error))
  state.finishedAt = new Date().toISOString()
  try {
    writePrivate(resultPath, state)
  } catch {
    /* Preserve the original private failure log. */
  }
  console.error(error)
  console.log(
    JSON.stringify({
      passed: false,
      mode,
      failureCode: state.failureCode,
      committedOwners: state.saves.filter((save) => save.committed).length,
      possibleOrphanAssets: state.saves.filter((save) => save.mayBeOrphan)
        .length,
    }),
  )
  process.exitCode = 1
}
