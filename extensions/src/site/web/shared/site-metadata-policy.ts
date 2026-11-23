export interface MetadataProduct {
  id: string
  title: string
}

export function resolveSiteMetadata({
  pathname,
  search,
  origin,
  products,
  tenantName,
}: {
  pathname: string
  search: string
  origin: string
  products: readonly MetadataProduct[]
  tenantName?: string
}) {
  const path = pathname.replace(/\/$/u, "") || "/"
  const params = new URLSearchParams(search)
  const requestedView = params.get("view")
  const view =
    requestedView &&
    ["store", "how", "pricing", "custom", "demo", "product"].includes(
      requestedView,
    )
      ? requestedView
      : "home"
  const native = /^\/(?:manager|party|display|game)(?:\/|$)/u.test(path)
  const brand =
    native && tenantName?.trim() && !/^tadazz$/iu.test(tenantName.trim())
      ? tenantName.trim()
      : "Tadazz"
  const labels: Record<string, string> = {
    home: "Home",
    store: "Games",
    how: "How it works",
    pricing: "Pricing",
    custom: "Custom shows",
    demo: "Try a round",
    login: "Log in",
    signup: "Create account",
    verify: "Email verified",
    forgot: "Forgot password?",
    reset: "Reset password",
    studio: "Dashboard",
    games: "My Games",
    account: "Account & licences",
    prepare: "Prepare show",
    clients: "Clients",
    client: "Client access",
  }
  const product =
    products.find((game) => game.id === params.get("game")) ?? products.at(0)
  const segment = path.split("/").filter(Boolean).at(-1) ?? "home"
  let label = path === "/" || path === "/site" ? view : segment

  if (native) {
    if (/^\/manager\/quizz(?:\/|$)/u.test(path)) {
      label = "Editor"
    } else if (/^\/party\/manager(?:\/|$)/u.test(path)) {
      label = "Host"
    } else if (/^\/party(?:\/|$)/u.test(path)) {
      label = "Player"
    } else if (/^\/display(?:\/|$)/u.test(path)) {
      label = "Display"
    } else if (/^\/game(?:\/|$)/u.test(path)) {
      label = "Join game"
    } else {
      label = "Manager"
    }
  }

  let titleKey = native ? label : (labels[label] ?? "Home")

  if (label === "product") {
    titleKey = product?.title ?? "Home"
  }

  const canonical = new URL(path, origin)

  if ((path === "/" || path === "/site") && view !== "home") {
    canonical.searchParams.set("view", view)

    if (view === "product" && product) {
      canonical.searchParams.set("game", product.id)
    }
  }

  let clientTitleKey: "entryTitle" | "ownerTitle" | null = null

  if (path === "/client") {
    clientTitleKey = "entryTitle"
  } else if (path === "/studio/clients") {
    clientTitleKey = "ownerTitle"
  }

  return {
    native,
    brand,
    titleKey,
    clientTitleKey,
    isHome: !native && label === "home",
    canonical: canonical.href,
  }
}
