// oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
export function checkoutRequestId(
  account: string,
  planId: string,
  currency: string,
  gameId?: string,
) {
  const key = `tadazz-checkout:${account}:${planId}:${currency}:${gameId ?? ""}`
  let id: string | null = null

  try {
    id = sessionStorage.getItem(key)
  } catch {
    /* Private browsing may restrict storage. */
  }

  if (!id) {
    id = crypto.randomUUID()

    try {
      sessionStorage.setItem(key, id)
    } catch {
      /* The in-flight mutation still prevents double clicks. */
    }
  }

  return {
    id,
    clear: () => {
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* Restricted storage. */
      }
    },
  }
}
