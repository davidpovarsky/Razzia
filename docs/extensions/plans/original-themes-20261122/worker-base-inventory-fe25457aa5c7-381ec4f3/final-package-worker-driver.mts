/** Fresh synthetic same-source qualification; run only in the owned Linux sandbox. */
import fs from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import { createPackageFixture } from "/cleanup/extensions/src/testkit/package-fixtures.ts"
import { PackageStore } from "/cleanup/extensions/src/server/packages/store.ts"
import {
  unpackPackage,
  packPackage,
  packageSha,
} from "/cleanup/extensions/src/server/packages/archive.ts"
import {
  normalizePackageDocument,
  packageMediaName,
} from "/cleanup/extensions/src/server/packages/references.ts"
import { inspectPackage } from "/cleanup/extensions/src/server/packages/preflight.ts"
import type { ThemePrincipal } from "/cleanup/extensions/src/server/show-themes/review.ts"
import { probePackageMedia } from "/cleanup/extensions/qa/package-media-probe.ts"

assert.equal(process.platform, "linux")
assert.equal(process.env.TADAZZ_BUILD_SANDBOX, "1")
const root = "/proof"
const mode = process.argv[2]
assert(typeof mode === "string")
assert(["prepare", "accept", "negative"].includes(mode))
const qualification = JSON.parse(
  fs.readFileSync(path.join(root, "qualification-plan.json"), "utf8"),
)
assert.match(qualification.revision, /^[a-f0-9]{40}$/)
const principal: ThemePrincipal = {
  tenantId: "qa-worker-owner",
  userId: "qa-worker-author",
  grants: ["author"],
}
const write = (name: string, value: unknown) => {
  const destination = path.join(root, name)
  assert(!fs.existsSync(destination), `Evidence already exists: ${name}`)
  fs.writeFileSync(destination, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  })
}
const emit = (name: string, value: unknown) => {
  write(name + ".json", value)
  console.log(JSON.stringify(value))
}

if (mode === "prepare") {
  const fixture = createPackageFixture(
    "complete",
    `qualified-${qualification.revision.slice(0, 12)}`,
    "1.0.0",
  )
  const games = fixture.manifest.contents.filter((item) => item.kind === "game")
  assert.equal(games.length, 2)
  const game = games[0]
  const theme = fixture.manifest.contents.find((item) => item.kind === "sandboxed-react-theme")
  assert(theme)
  assert.equal(game.themeRef, `${theme.id}@${fixture.manifest.version}`)
  const files = new Map(fixture.files)
  const document = JSON.parse(files.get(game.path)!.toString())
  const questions = document.cards.filter((card: { kind: string }) =>
    ["quiz", "survey"].includes(card.kind),
  )
  assert.equal(questions.length, 10)
  for (const card of questions) card.cooldownSeconds = 2
  const authored = Buffer.from(JSON.stringify(document))
  files.set(game.path, authored)
  files.delete(games[1].path)
  const manifest = {
    ...fixture.manifest,
    contents: fixture.manifest.contents.filter((item) => item !== games[1]),
    files: fixture.manifest.files
      .filter((file) => file.path !== games[1].path)
      .map((file) =>
        file.path === game.path
          ? { ...file, bytes: authored.length, sha256: packageSha(authored) }
          : file,
      ),
  }
  const bytes = packPackage(manifest, files)
  const pkg = inspectPackage(bytes).pkg
  const cards = normalizePackageDocument(pkg, game.path).cards.filter((card) =>
    ["quiz", "survey"].includes(card.kind),
  )
  assert.equal(cards.length, 10)
  assert.deepEqual([...new Set(cards.map((card) => card.cooldownSeconds))], [2])
  const store = new PackageStore(
    path.join(root, "synthetic-store"),
    "synthetic-worker-proof-secret-not-a-live-credential",
    (tenant) => path.join(root, "native", tenant),
  )
  try {
    const uploaded = store.upload(
      principal,
      bytes,
      `qa-same-source-${qualification.revision}`,
    )
    const exported = store.export(principal, uploaded.uploadId)
    assert.equal(packageSha(exported), packageSha(bytes))
    fs.writeFileSync(path.join(root, "fresh-minimum-two.tadazz"), exported, {
      mode: 0o600,
      flag: "wx",
    })
    store.requestBuild(principal, uploaded.uploadId)
    assert.equal(store.details(principal, uploaded.uploadId).phase, "building")
    write("native-plan.json", {
      uploadId: uploaded.uploadId,
      gameId: game.id,
      gamePath: game.path,
      themeId: theme.id,
      themeVersion: fixture.manifest.version,
      inputSourceDigest: packageSha(exported),
    })
    emit("prepare", {
      revision: qualification.revision,
      syntheticFixture: true,
      currentExampleAndExportUsed: true,
      phase: "building",
      inputSourceDigest: packageSha(exported),
      questionCount: 10,
      cooldownSeconds: [2],
      gameCount: 1,
      selectedThemeId: theme.id,
      sourceFileCount: manifest.files.length,
    })
  } finally {
    store.close()
  }
} else {
  const plan = JSON.parse(fs.readFileSync(path.join(root, "native-plan.json"), "utf8"))
  const input = fs.readFileSync(path.join(root, "fresh-minimum-two.tadazz"))
  assert.equal(packageSha(input), plan.inputSourceDigest)
  const pkg = unpackPackage(input)
  const game = pkg.manifest.contents.find((item) => item.kind === "game")!
  assert.equal(game.id, plan.gameId)
  assert.equal(game.themeRef, `${plan.themeId}@${plan.themeVersion}`)
  assert(pkg.manifest.contents.some((item) => item.id === plan.themeId && item.kind === "sandboxed-react-theme"))
  const cards = normalizePackageDocument(pkg, game.path).cards.filter((card) =>
    ["quiz", "survey"].includes(card.kind),
  )
  assert.equal(cards.length, 10)
  assert.deepEqual([...new Set(cards.map((card) => card.cooldownSeconds))], [2])

  if (mode === "negative") {
    const document = JSON.parse(pkg.files.get(game.path)!.toString())
    document.cards.find((card: { kind: string }) =>
      ["quiz", "survey"].includes(card.kind),
    ).cooldownSeconds = 1
    const bytes = Buffer.from(JSON.stringify(document))
    pkg.files.set(game.path, bytes)
    const manifest = {
      ...pkg.manifest,
      files: pkg.manifest.files.map((file) =>
        file.path === game.path
          ? { ...file, bytes: bytes.length, sha256: packageSha(bytes) }
          : file,
      ),
    }
    const negative = packPackage(manifest, pkg.files)
    assert.throws(() => inspectPackage(negative), /cooldownSeconds/)
    fs.writeFileSync(path.join(root, "minimum-one-rejected.tadazz"), negative, {
      mode: 0o600,
      flag: "wx",
    })
    emit("negative-native", {
      revision: qualification.revision,
      nativePreflightRejected: true,
      sourceDigest: packageSha(negative),
      rejectedCooldownSeconds: 1,
      reason: "cooldownSeconds",
    })
  } else {
    const store = new PackageStore(
      path.join(root, "synthetic-store"),
      "synthetic-worker-proof-secret-not-a-live-credential",
      (tenant) => path.join(root, "native", tenant),
    )
    try {
      const job = path.join(store.tenantRoot(principal.tenantId), "jobs", plan.uploadId)
      const worker = JSON.parse(fs.readFileSync(path.join(job, "result.json"), "utf8"))
      const bundle = fs.readFileSync(path.join(job, "bundle.json"))
      assert.equal(worker.sourceDigest, packageSha(input))
      assert.equal(worker.outputDigest, packageSha(bundle))
      assert.equal(worker.mediaValidated, true)
      assert(!worker.error)
      const built = JSON.parse(bundle.toString())
      assert(Object.keys(built).length === 1)
      assert(Object.values(built).every((item: any) => item.js.length > 0))
      store.acceptBuild(principal, plan.uploadId)
      const ready = store.details(principal, plan.uploadId)
      assert.equal(ready.phase, "preview-ready")
      const installed = store.install(principal, plan.uploadId, ready.revision, [plan.themeId, plan.gameId])
      assert.equal(installed.installedGames.length, 1)
      const id = installed.installedGames[0]
      const base = JSON.parse(fs.readFileSync(path.join(root, "native", principal.tenantId, "quizz", id + ".json"), "utf8"))
      const extras = JSON.parse(fs.readFileSync(path.join(root, "native", principal.tenantId, "extensions/quizzes", id + ".json"), "utf8"))
      assert.equal(base.questions.length, 10)
      assert.deepEqual([...new Set(base.questions.map((question: any) => question.cooldown))], [2])
      assert.equal(extras.defaults.showTheme.id, plan.themeId)
      assert.equal(extras.defaults.showTheme.version, plan.themeVersion)
      const installedThemes = store.catalog(principal.tenantId)
      assert.equal(installedThemes.length, 1)
      assert.equal(installedThemes[0].id, plan.themeId)
      assert.equal(installedThemes[0].version, plan.themeVersion)
      assert.equal(installedThemes[0].kind, "sandboxed-react")

      // Decode the bytes actually retrieved from this installed synthetic tenant.
      const privateFiles = new Map(pkg.files)
      const privateMedia = pkg.manifest.files.filter((file) =>
        ["image", "audio", "video", "lottie"].includes(file.kind),
      )
      for (const file of privateMedia) {
        const media = store.readMedia(principal.tenantId, packageMediaName(pkg, file.path))
        assert(media, `Installed private fixture asset missing: ${file.path}`)
        assert.equal(packageSha(media.bytes), file.sha256)
        assert.equal(media.bytes.length, file.bytes)
        privateFiles.set(file.path, media.bytes)
      }
      assert(privateMedia.some((file) => file.kind === "image"))
      assert(privateMedia.some((file) => file.kind === "audio"))
      assert(privateMedia.some((file) => file.kind === "video"))
      probePackageMedia({ ...pkg, files: privateFiles })

      const exported = store.exportGame(principal, plan.uploadId, { bundleVersion: 1, quizz: base, extras })
      const exportedPkg = inspectPackage(exported).pkg
      const exportedGame = exportedPkg.manifest.contents.find((item) => item.kind === "game")!
      const reexport = normalizePackageDocument(exportedPkg, exportedGame.path)
      const reexported = reexport.cards.filter((card) => ["quiz", "survey"].includes(card.kind))
      assert.equal(reexported.length, 10)
      assert.deepEqual([...new Set(reexported.map((card) => card.cooldownSeconds))], [2])
      probePackageMedia(exportedPkg)
      fs.writeFileSync(path.join(root, "reexport-after-native-install.tadazz"), exported, { mode: 0o600, flag: "wx" })
      emit("native-accept", {
        revision: qualification.revision,
        inputSourceDigest: packageSha(input),
        buildDigest: ready.buildDigest,
        phaseBeforeInstall: ready.phase,
        phaseAfterInstall: store.details(principal, plan.uploadId).phase,
        nativeGames: 1,
        installedThemeId: plan.themeId,
        installedThemeVersion: plan.themeVersion,
        customThemeSelectionPreserved: true,
        questionCount: 10,
        preservedCooldownSeconds: [2],
        reexportPreservedCooldownSeconds: [2],
        reexportSourceDigest: packageSha(exported),
        privateMediaCount: privateMedia.length,
        privateMediaDecoded: true,
        reexportMediaDecoded: true,
        mediaValidated: true,
        customRuntimeCompiled: true,
        reviewFabricated: false,
      })
    } finally {
      store.close()
    }
  }
}
