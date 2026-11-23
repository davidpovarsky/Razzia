import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { StatusCodes } from "http-status-codes"
import { getPublicDemo } from "../../core/show-library/public-demo-catalogue"
import { CompositeStorageError } from "../storage/error"
import { CompositeStorageService } from "../storage/service"
import type { StorageInjections } from "../storage/sidecar"
import { publicGameCatalogueEnabled } from "./public-preview-source"

const receiptSchema = z.strictObject({
  version: z.literal(1),
  catalogueId: z.string().regex(/^[a-z0-9-]{1,80}$/u),
  quizId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/u),
})

// The authenticated storage adapter is the only source of account ownership.
// Reopening a template never overwrites a customer's edits. Each account gets
// a fresh native game, independent question identities and its own receipt.
//
export function installPublicCatalogueGame(
  injections: StorageInjections,
  catalogueId: string,
) {
  const example = getPublicDemo(catalogueId)

  if (!example || !publicGameCatalogueEnabled()) {
    throw new CompositeStorageError(
      "Public game unavailable",
      StatusCodes.NOT_FOUND,
    )
  }

  const service = new CompositeStorageService(injections)
  const receiptPath = injections.getPath(
    `extensions/gallery-installs/${example.metadata.id}.json`,
  )
  let existingId: string | undefined = undefined

  if (fs.existsSync(receiptPath)) {
    const stat = fs.lstatSync(receiptPath)

    if (!stat.isFile() || stat.size > 4096) {
      throw new CompositeStorageError(
        "Invalid gallery receipt",
        StatusCodes.CONFLICT,
      )
    }

    const receipt = receiptSchema.parse(
      JSON.parse(fs.readFileSync(receiptPath, "utf8")),
    )

    if (receipt.catalogueId !== example.metadata.id) {
      throw new CompositeStorageError(
        "Gallery receipt mismatch",
        StatusCodes.CONFLICT,
      )
    }

    try {
      service.getCompositeQuiz(receipt.quizId)
      existingId = receipt.quizId
    } catch (error) {
      if (
        !(error instanceof CompositeStorageError) ||
        error.statusCode !== StatusCodes.NOT_FOUND
      ) {
        throw error
      }
    }
  }

  if (existingId) {
    return installationResult(existingId, false)
  }

  // The established importer validates media and allocates all native IDs.
  const created = service.importEnhancedBundle(structuredClone(example.show))
  const temporaryPath = `${receiptPath}.${randomUUID()}.tmp`

  try {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true })
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify({
        version: 1,
        catalogueId: example.metadata.id,
        quizId: created.quizId,
      }),
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    )
    fs.renameSync(temporaryPath, receiptPath)
  } catch (error) {
    // Roll back only the game this request just created, never an older copy.
    service.deleteCompositeQuiz(created.quizId)
    throw error
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }

  return installationResult(created.quizId, true)
}

function installationResult(quizzId: string, created: boolean) {
  return {
    quizzId,
    created,
    editorUrl: `/manager/quizz/${encodeURIComponent(quizzId)}`,
    launchUrl: `/studio/prepare?quiz=${encodeURIComponent(quizzId)}`,
  }
}
