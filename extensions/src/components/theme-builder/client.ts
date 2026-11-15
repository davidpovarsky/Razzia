import {
  parseBuilderDocument,
  builderDigest,
  type BuilderDocument,
} from "./document"

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
    document: BuilderDocument,
    expectedRevision: number,
    signal: AbortSignal,
  ): Promise<BuilderReceipt>
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
    if (!bearer) throw new BuilderRequestError(401)
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
    if (!response.ok) throw new BuilderRequestError(response.status)
    return response.json() as Promise<unknown>
  }
  const receipt = (input: unknown): BuilderReceipt => {
    if (!input || typeof input !== "object") throw new BuilderRequestError(502)
    const value = input as BuilderReceipt
    const document = parseBuilderDocument(value.document)
    if (
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      builderDigest(document) !== value.digest
    )
      throw new BuilderRequestError(502)
    return { document, revision: value.revision, digest: value.digest }
  }
  return {
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
      )
        throw new BuilderRequestError(502)
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
      )
        throw new BuilderRequestError(502)
      return result
    },
  }
}
