import { useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useEffect } from "react"
import { siteText as t } from "../../locales"
import { useManagedClientText } from "../../locales/clients"
import { catalogue } from "../marketing/Catalogue"
import { resolveSiteMetadata } from "./site-metadata-policy"

/** One metadata owner for site and native routes in the downstream entry. */
export function SiteMetadata({ tenantName }: { tenantName?: string }) {
  const location = useRouterState({ select: (state) => state.location })
  useTranslation("tadazzSite")
  const clientText = useManagedClientText()
  const metadata = resolveSiteMetadata({
    pathname: location.pathname,
    search: location.searchStr,
    origin: window.location.origin,
    products: catalogue,
    tenantName,
  })
  const title = metadata.isHome
    ? metadata.brand
    : `${metadata.clientTitleKey ? clientText(metadata.clientTitleKey) : t(metadata.titleKey)} | ${metadata.brand}`
  const description = metadata.clientTitleKey
    ? clientText(
        metadata.clientTitleKey === "entryTitle"
          ? "entryDescription"
          : "ownerDescription",
      )
    : t("Explore the collection. Preview anything. Make a show your own.")

  useEffect(() => {
    const oldTitle = document.title
    document.title = title
    const entries: Array<[string, string, string]> = [
      ["name", "application-name", metadata.brand],
      ["name", "description", description],
      ["property", "og:title", title],
      ["property", "og:description", description],
      ["name", "twitter:title", title],
      ["name", "twitter:description", description],
    ]
    const cleanup = entries.map(([attribute, name, value]) => {
      const existing = document.head.querySelector<HTMLMetaElement>(
        `meta[${attribute}="${name}"]`,
      )
      const element = existing ?? document.createElement("meta")
      const previous = element.getAttribute("content")
      element.setAttribute(attribute, name)
      element.content = value

      if (!existing) {
        document.head.append(element)
      }

      return () => {
        if (!existing) {
          element.remove()
        } else if (previous === null) {
          element.removeAttribute("content")
        } else {
          element.content = previous
        }
      }
    })
    const existingLink = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    )
    const link = existingLink ?? document.createElement("link")
    const previousHref = link.getAttribute("href")
    link.rel = "canonical"
    link.href = metadata.canonical

    if (!existingLink) {
      document.head.append(link)
    }

    return () => {
      document.title = oldTitle
      cleanup.forEach((restore) => {
        restore()
      })

      if (!existingLink) {
        link.remove()
      } else if (previousHref === null) {
        link.removeAttribute("href")
      } else {
        link.setAttribute("href", previousHref)
      }
    }
  }, [title, description, metadata.brand, metadata.canonical])

  return null
}
