import { Link, type AnyRouter } from "@tanstack/react-router"
import type { AnchorHTMLAttributes } from "react"

/** Keep site navigation in the existing router/cache; native editor/show links reload. */
export function SiteLink({
  href = "/",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const url = new URL(href, window.location.origin)
  const managed =
    url.origin === window.location.origin &&
    /^\/(?:$|site(?:\/(?:login|signup|studio))?\/?$|studio(?:\/[a-z-]+)?\/?$|(?:login|signup|verify|forgot|reset)\/?$)/u.test(
      url.pathname,
    )

  if (!managed || props.download) {
    return <a href={href} {...props} />
  }

  return (
    <Link<AnyRouter, string, string>
      {...props}
      to={url.pathname}
      search={() => Object.fromEntries(url.searchParams)}
      hash={url.hash.slice(1)}
      preload="intent"
    />
  )
}
