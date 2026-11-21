import { createHash, randomUUID } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PackageStore } from "../../src/server/packages/store.ts"

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const requireFixture = (condition, code) => {
  if (!condition) {
    throw new Error("STORED_GAME_MEDIA_" + code)
  }
}

function checkedPath(root, relative) {
  requireFixture(
    typeof relative === "string" &&
      relative.length > 0 &&
      !relative.includes("\\") &&
      !relative.includes("\0") &&
      !path.posix.isAbsolute(relative) &&
      relative
        .split("/")
        .every((part) => part && part !== "." && part !== ".."),
    "RELATIVE_PATH",
  )
  const parts = relative.split("/")
  let current = root
  for (const part of parts) {
    current = path.join(current, part)
    const entry = lstatSync(current, { throwIfNoEntry: false })
    if (entry) {
      requireFixture(!entry.isSymbolicLink(), "SYMLINK")
    }
  }
  requireFixture(current.startsWith(root + path.sep), "PATH_BOUNDARY")
  return current
}

function fixtureBytes(fixtureRoot, media) {
  requireFixture(
    /^[a-f0-9]{64}$/u.test(media.sha256 ?? "") &&
      Number.isSafeInteger(media.bytes) &&
      media.bytes >= 0,
    "DIGEST_METADATA",
  )
  const source = checkedPath(fixtureRoot, media.fixtureRelativePath)
  const info = lstatSync(source)
  requireFixture(info.isFile() && info.size === media.bytes, "BLOB_SIZE")
  const bytes = readFileSync(source)
  requireFixture(sha256(bytes) === media.sha256, "BLOB_DIGEST")
  return bytes
}

function copyVerified(root, relative, bytes, expectedSha256) {
  const target = checkedPath(root, relative)
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  if (existsSync(target)) {
    requireFixture(lstatSync(target).isFile(), "DESTINATION_TYPE")
    requireFixture(
      sha256(readFileSync(target)) === expectedSha256,
      "DESTINATION_CONFLICT",
    )
  } else {
    writeFileSync(target, bytes, { flag: "wx", mode: 0o600 })
  }
  requireFixture(sha256(readFileSync(target)) === expectedSha256, "COPY_DIGEST")
}

function summary(media, status) {
  return {
    referenceDigest: sha256(String(media.url)),
    ...(media.sha256 ? { sha256: media.sha256, bytes: media.bytes } : {}),
    status,
  }
}

function seedExternalMirror(fixtureRoot, config, tenantRelative, media) {
  const manifestPath = checkedPath(fixtureRoot, "external-assets.json")
  if (!existsSync(manifestPath)) {
    return summary(media, "external-not-fetched")
  }
  const manifestBytes = readFileSync(manifestPath)
  const manifestSha256 = sha256(manifestBytes)
  requireFixture(
    manifestSha256 === process.env.TADAZZ_PRIVATE_EXTERNAL_MEDIA_SHA256,
    "EXTERNAL_MANIFEST_PIN",
  )
  const manifest = JSON.parse(manifestBytes.toString("utf8"))
  requireFixture(
    manifest.schemaVersion === 1 &&
      Array.isArray(manifest.assets) &&
      manifest.sourceFixtureSha256 === process.env.TADAZZ_PRIVATE_GAME_FIXTURES_SHA256 &&
      manifest.originalGameUrlsChanged === false &&
      manifest.productionChanged === false,
    "EXTERNAL_MANIFEST_SCHEMA",
  )
  const matches = manifest.assets.filter((asset) => asset.sourceUrl === media.url)
  if (matches.length === 0) {
    return summary(media, "external-not-fetched")
  }
  requireFixture(matches.length === 1, "EXTERNAL_MANIFEST_DUPLICATE")
  const asset = matches[0]
  const source = new URL(asset.sourceUrl)
  requireFixture(
    source.protocol === "https:" &&
      source.hostname === "placehold.co" &&
      /^\/[1-9][0-9]*x[1-9][0-9]*\.png$/u.test(source.pathname) &&
      !source.username && !source.password && !source.search && !source.hash &&
      asset.finalUrl === asset.sourceUrl &&
      asset.publicSource === true &&
      asset.sourceHttpStatus === 200 &&
      asset.contentType === "image/png" &&
      Number.isFinite(Date.parse(asset.verifiedAt)) &&
      asset.targetRelativePath === "media/qa-external-" + asset.sha256 + ".png",
    "EXTERNAL_PROVENANCE",
  )
  const bytes = fixtureBytes(fixtureRoot, asset)
  requireFixture(
    bytes.length >= 24 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.readUInt32BE(16) === asset.width &&
      bytes.readUInt32BE(20) === asset.height,
    "EXTERNAL_IMAGE_FORMAT",
  )
  copyVerified(config, tenantRelative + "/" + asset.targetRelativePath, bytes, asset.sha256)
  return {
    ...summary(media, "offline-mirror-seeded"),
    mirror: {
      sourceUrl: asset.sourceUrl,
      nativeUrl: "/" + asset.targetRelativePath,
      sha256: asset.sha256,
      bytes: asset.bytes,
      contentType: asset.contentType,
      verifiedAt: asset.verifiedAt,
      sourceHttpStatus: asset.sourceHttpStatus,
      manifestSha256,
      originalUrlPlayedOverInternet: false,
    },
  }
}

/**
 * Restore sanitized media fixtures only into the runner's fresh temporary host.
 * Package metadata is seeded as test data using the real PackageStore schema;
 * each object is then resolved through its real readMedia implementation.
 * This exercises installed-media playback, not upload/review/install approval.
 * Private fixture contents and production account identities never enter Git.
 */
export async function seedStoredGameMedia({
  fixtureRoot,
  fixture,
  packageRecords = [],
  configRoot,
  accountId,
}) {
  requireFixture(
    process.env.TADAZZ_QA_OWNED_RUN_DIR === "1",
    "OWNED_RUN_REQUIRED",
  )
  const config = realpathSync(configRoot)
  const fixtures = realpathSync(fixtureRoot)
  requireFixture(
    path.dirname(config) === realpathSync(tmpdir()) &&
      path.basename(config).startsWith("tadazz-stored-games-") &&
      lstatSync(config).isDirectory() &&
      config !== fixtures &&
      !config.startsWith(fixtures + path.sep),
    "ISOLATED_CONFIG_REQUIRED",
  )
  requireFixture(
    typeof accountId === "string" && /^[A-Za-z0-9_-]{8,128}$/u.test(accountId),
    "QA_ACCOUNT_REQUIRED",
  )
  requireFixture(
    Array.isArray(fixture?.sourceSummary?.media) &&
      Array.isArray(packageRecords),
    "MANIFEST_REQUIRED",
  )
  const tenantRelative = "tenants/" + accountId
  const tenantRoot = checkedPath(config, tenantRelative)
  mkdirSync(tenantRoot, { recursive: true, mode: 0o700 })
  const result = {
    copiedMedia: [],
    packageMedia: [],
    publicAssets: [],
    externalAssets: [],
  }
  const packages = []
  for (const media of fixture.sourceSummary.media) {
    if (media.kind === "external") {
      result.externalAssets.push(seedExternalMirror(fixtures, config, tenantRelative, media))
      continue
    }
    if (media.kind === "embedded") {
      result.externalAssets.push(summary(media, "embedded"))
      continue
    }
    const bytes = fixtureBytes(fixtures, media)
    if (media.kind === "media") {
      requireFixture(
        typeof media.targetRelativePath === "string" &&
          media.targetRelativePath.startsWith("media/"),
        "TENANT_MEDIA_PATH",
      )
      copyVerified(
        config,
        tenantRelative + "/" + media.targetRelativePath,
        bytes,
        media.sha256,
      )
      result.copiedMedia.push(summary(media, "copied-and-verified"))
    } else if (media.kind === "public") {
      // The browser must request the candidate's actual public asset route.
      // Do not replace candidate files with fixture bytes and mask regressions.
      result.publicAssets.push(
        summary(media, "fixture-verified-candidate-pending"),
      )
    } else {
      requireFixture(media.kind === "package", "UNKNOWN_MEDIA_KIND")
      packages.push({ media, bytes })
    }
  }
  if (packages.length === 0) {
    return result
  }

  const packageRoot = checkedPath(config, "extensions/packages")
  for (const name of [
    "packages.sqlite",
    "packages.sqlite-wal",
    "packages.sqlite-shm",
  ]) {
    checkedPath(config, "extensions/packages/" + name)
  }
  const store = new PackageStore(
    packageRoot,
    "qa-fixtures-no-signing-authority",
    (tenant) => {
      requireFixture(tenant === accountId, "TENANT_BOUNDARY")
      return tenantRoot
    },
  )
  try {
    const records = new Map()
    for (const { media } of packages) {
      const matches = packageRecords.filter(
        (record) => record.recordKey === media.packageRecordKey,
      )
      requireFixture(matches.length === 1, "PACKAGE_RECORD")
      const record = matches[0]
      requireFixture(
        record.sourceKey === fixture.sourceKey &&
          record.phase === "installed" &&
          /^[a-f0-9]{64}$/u.test(record.source ?? "") &&
          record.source === media.packageSource &&
          record.report?.sourceDigest === record.source &&
          record.report?.manifest?.id === record.packageId &&
          record.report?.manifest?.version === record.version &&
          Array.isArray(record.report?.manifest?.files) &&
          Number.isSafeInteger(record.revision) &&
          record.revision > 0,
        "PACKAGE_METADATA",
      )
      records.set(record.recordKey, record)
    }

    for (const { media, bytes } of packages) {
      const record = records.get(media.packageRecordKey)
      const name = String(media.url).split("/").at(-1)
      requireFixture(
        /^pkg_[a-f0-9]{24}_[a-f0-9]{64}\.[a-z0-9]+$/u.test(name),
        "PACKAGE_MEDIA_NAME",
      )
      const entry = record.report.manifest.files.find(
        (file) =>
          !["descriptor", "source", "style", "font"].includes(file.kind) &&
          "pkg_" +
            record.source.slice(0, 24) +
            "_" +
            file.sha256 +
            "." +
            file.path.split(".").at(-1).toLowerCase() ===
            name,
      )
      requireFixture(
        entry?.sha256 === media.sha256 && entry.bytes === media.bytes,
        "PACKAGE_ASSET_METADATA",
      )
      const relative =
        path
          .relative(config, store.tenantRoot(accountId))
          .split(path.sep)
          .join("/") +
        "/objects/" +
        media.sha256
      copyVerified(config, relative, bytes, media.sha256)
    }

    store.db.exec("BEGIN IMMEDIATE")
    try {
      for (const record of records.values()) {
        const metadata = [
          JSON.stringify(record.definitions ?? []),
          JSON.stringify(record.games ?? []),
          JSON.stringify(record.targets ?? []),
          JSON.stringify(record.report),
          record.installedSelection == null
            ? null
            : JSON.stringify(record.installedSelection),
        ]
        let row = store.db
          .prepare(
            "SELECT * FROM packages WHERE tenant=? AND package_id=? AND version=?",
          )
          .get(accountId, record.packageId, record.version)
        if (row) {
          requireFixture(
            row.source === record.source &&
              row.phase === "installed" &&
              row.revision === record.revision &&
              row.report === metadata[3] &&
              row.definitions === metadata[0] &&
              row.games === metadata[1] &&
              row.targets === metadata[2] &&
              row.installed_selection === metadata[4],
            "PACKAGE_RECORD_CONFLICT",
          )
        } else {
          const upload = randomUUID()
          store.db
            .prepare(
              "INSERT INTO packages(tenant,upload,package_id,version,source,phase,revision,author,review,build,definitions,games,targets,report,installed_selection) VALUES(?,?,?,?,?,'installed',?,?,NULL,NULL,?,?,?,?,?)",
            )
            .run(
              accountId,
              upload,
              record.packageId,
              record.version,
              record.source,
              record.revision,
              accountId,
              ...metadata,
            )
          row = { upload }
        }
        const active = store.db
          .prepare(
            "SELECT upload FROM package_active WHERE tenant=? AND package_id=?",
          )
          .get(accountId, record.packageId)
        requireFixture(
          !active || active.upload === row.upload,
          "PACKAGE_ACTIVE_CONFLICT",
        )
        if (!active) {
          store.db
            .prepare(
              "INSERT INTO package_active(tenant,package_id,upload) VALUES(?,?,?)",
            )
            .run(accountId, record.packageId, row.upload)
        }
      }
      store.db.exec("COMMIT")
    } catch (error) {
      store.db.exec("ROLLBACK")
      throw error
    }

    for (const { media } of packages) {
      const loaded = store.readMedia(
        accountId,
        String(media.url).split("/").at(-1),
      )
      requireFixture(
        loaded &&
          loaded.bytes.length === media.bytes &&
          sha256(loaded.bytes) === media.sha256,
        "PACKAGE_ROUTE_DIGEST",
      )
      result.packageMedia.push(summary(media, "package-store-read-verified"))
    }
    return result
  } finally {
    store.close()
  }
}
