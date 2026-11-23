import { SiteAccountGateway } from "@razzia/web/features/tadazz-site/SiteAccountGateway"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/site/login")({
  component: () => <SiteAccountGateway initialStep="login" />,
})
