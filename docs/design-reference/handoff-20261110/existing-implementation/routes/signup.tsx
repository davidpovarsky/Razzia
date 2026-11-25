import { SiteAccountGateway } from "@razzia/web/features/tadazz-site/SiteAccountGateway"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/site/signup")({
  component: () => <SiteAccountGateway initialStep="register" />,
})
