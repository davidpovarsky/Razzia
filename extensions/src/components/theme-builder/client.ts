// oxlint-disable typescript/no-invalid-void-type -- Stateless adapter methods use the standard this:void annotation for safe extraction.
// oxlint-disable eslint/max-params -- Preserve the existing explicit identity, revision, role and abort arguments at this adapter boundary.
import {
  parseBuilderDocument,
  builderDigest,
  type BuilderDocument,
} from "./document"
import { z } from "zod"

const versionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u)
const publicationStateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  activeVersion: versionSchema.nullable(),
  archived: z.boolean(),
  canPublish: z.boolean(),
  versions: z
    .array(
      z.strictObject({
        version: versionSchema,
        digest: z.string().regex(/^[a-f0-9]{64}$/u),
      }),
    )
    .max(256),
})

export type BuilderPublicationState = z.infer<typeof publicationStateSchema>

export class BuilderRequestError extends Error {
  constructor(readonly status: number) {
    super("theme-builder:request-failed")
  }
}

export interface BuilderReceipt {
  document: BuilderDocument
  revision: number
  digest: string
}

export interface BuilderClient {
  save(
    this: void,
    document: BuilderDocument,
    expectedRevision: number,
    signal: AbortSignal,
  ): Promise<BuilderReceipt>
  versions?(
    this: void,
    id: string,
    signal: AbortSignal,
  ): Promise<BuilderVersion[]>
  createVersion?(
    this: void,
    id: string,
    revision: number,
    version: string,
    signal: AbortSignal,
  ): Promise<void>
  restoreVersion?(
    this: void,
    id: string,
    revision: number,
    version: string,
    signal: AbortSignal,
  ): Promise<BuilderReceipt>
  publication?(
    this: void,
    id: string,
    signal: AbortSignal,
  ): Promise<BuilderPublicationState>
  publish?(
    this: void,
    id: string,
    revision: number,
    headRevision: number,
    version: string,
    rollback: boolean,
    signal: AbortSignal,
  ): Promise<BuilderPublicationState>
  archive?(
    this: void,
    id: string,
    revision: number,
    headRevision: number,
    archived: boolean,
    signal: AbortSignal,
  ): Promise<BuilderPublicationState>
}

export interface BuilderVersion {
  version: string
  revision: number
  restorable: boolean
  runtimeAcceptance: "not-evaluated"
}

/** Uses the existing authenticated installer host; no anonymous or local-storage fallback. */
export function createBuilderClient(
  tenantId: string,
  token: () => Promise<string>,
  request: typeof fetch = fetch,
) {
  const base = `/api/themes/builder/${encodeURIComponent(tenantId)}/documents`
  const send = async (path: string, init: RequestInit = {}) => {
    const bearer = await token()

    if (!bearer) {
      throw new BuilderRequestError(401)
    }

    const response = await request(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    })

    if (!response.ok) {
      throw new BuilderRequestError(response.status)
    }

    return response.json() as Promise<unknown>
  }
  const receipt = (input: unknown): BuilderReceipt => {
    if (!input || typeof input !== "object") {
      throw new BuilderRequestError(502)
    }

    const value = input as BuilderReceipt
    const document = parseBuilderDocument(value.document)

    if (
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      builderDigest(document) !== value.digest
    ) {
      throw new BuilderRequestError(502)
    }

    return { document, revision: value.revision, digest: value.digest }
  }

  return {
    async publication(id: string, signal: AbortSignal) {
      return publicationStateSchema.parse(
        await send(`${base}/${encodeURIComponent(id)}/publication`, { signal }),
      )
    },
    async publish(
      id: string,
      revision: number,
      headRevision: number,
      version: string,
      rollback: boolean,
      signal: AbortSignal,
    ) {
      return publicationStateSchema.parse(
        await send(
          `${base}/${encodeURIComponent(id)}/${rollback ? "rollback" : "publish"}`,
          {
            method: "POST",
            body: JSON.stringify({
              expectedRevision: revision,
              expectedHeadRevision: headRevision,
              version,
            }),
            signal,
          },
        ),
      )
    },
    async archive(
      id: string,
      revision: number,
      headRevision: number,
      archived: boolean,
      signal: AbortSignal,
    ) {
      return publicationStateSchema.parse(
        await send(`${base}/${encodeURIComponent(id)}/archive`, {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: revision,
            expectedHeadRevision: headRevision,
            archived,
          }),
          signal,
        }),
      )
    },
    async versions(id: string, signal: AbortSignal): Promise<BuilderVersion[]> {
      const value = (await send(`${base}/${encodeURIComponent(id)}/versions`, {
        signal,
      })) as { versions?: BuilderVersion[] }

      if (
        !Array.isArray(value.versions) ||
        value.versions.some(
          (v) =>
            !/^\d+\.\d+\.\d+$/u.test(v.version) ||
            !Number.isSafeInteger(v.revision) ||
            v.revision < 1 ||
            typeof v.restorable !== "boolean" ||
            (v as { runtimeAcceptance?: unknown }).runtimeAcceptance !==
              "not-evaluated",
        )
      ) {
        throw new BuilderRequestError(502)
      }

      return value.versions
    },
    async createVersion(
      id: string,
      revision: number,
      version: string,
      signal: AbortSignal,
    ) {
      const value = (await send(`${base}/${encodeURIComponent(id)}/versions`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision: revision, version }),
        signal,
      })) as { version?: string; revision?: number; runtimeAcceptance?: string }

      if (
        value.version !== version ||
        value.revision !== revision ||
        value.runtimeAcceptance !== "not-evaluated"
      ) {
        throw new BuilderRequestError(502)
      }
    },
    async restoreVersion(
      id: string,
      revision: number,
      version: string,
      signal: AbortSignal,
    ) {
      const result = receipt(
        await send(`${base}/${encodeURIComponent(id)}/restore`, {
          method: "POST",
          body: JSON.stringify({ expectedRevision: revision, version }),
          signal,
        }),
      )

      if (result.document.id !== id || result.revision !== revision + 1) {
        throw new BuilderRequestError(502)
      }

      return result
    },
    async list(
      signal: AbortSignal,
    ): Promise<Array<{ id: string; name: string; revision: number }>> {
      const data = (await send(base, { signal })) as {
        documents?: Array<{ id: string; name: string; revision: number }>
      }

      if (
        !Array.isArray(data.documents) ||
        data.documents.length > 128 ||
        data.documents.some(
          (d) =>
            typeof d.id !== "string" ||
            typeof d.name !== "string" ||
            !Number.isSafeInteger(d.revision) ||
            d.revision < 1,
        )
      ) {
        throw new BuilderRequestError(502)
      }

      return data.documents
    },
    async read(id: string, signal: AbortSignal) {
      return receipt(
        await send(`${base}/${encodeURIComponent(id)}`, { signal }),
      )
    },
    async save(
      document: BuilderDocument,
      expectedRevision: number,
      signal: AbortSignal,
    ) {
      const result = receipt(
        await send(`${base}/${encodeURIComponent(document.id)}`, {
          method: "PUT",
          body: JSON.stringify({
            expectedRevision,
            document: parseBuilderDocument(document),
          }),
          signal,
        }),
      )

      if (
        result.document.id !== document.id ||
        result.revision !== expectedRevision + 1 ||
        result.digest !== builderDigest(document)
      ) {
        throw new BuilderRequestError(502)
      }

      return result
    },
  }
}
