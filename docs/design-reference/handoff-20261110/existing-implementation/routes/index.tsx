import { createFileRoute } from "@tanstack/react-router"
import { MarketingPreview } from "@razzia/web/features/tadazz-site/SitePreview"

export const Route = createFileRoute("/site/")({ component: MarketingPreview })
