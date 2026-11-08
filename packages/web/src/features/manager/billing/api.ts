import { ensureSession } from "@razzia/web/lib/session"

export async function billingRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const session = await ensureSession()
  const response = await fetch(`/api/billing${path}`, {
    method: body === undefined ? "GET" : "POST",
    signal,
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const result = (await response.json()) as { error?: string }

  if (!response.ok) {
    throw new Error(
      result.error?.startsWith("extensions:billing.")
        ? result.error
        : "extensions:billing.errors.unavailable",
    )
  }

  return result as T
}
