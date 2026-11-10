import { createFileRoute } from "@tanstack/react-router"
import { StudioPreview } from "@razzia/web/features/tadazz-site/SitePreview"

export const Route = createFileRoute("/site/studio")({
  component: StudioPreview,
})
