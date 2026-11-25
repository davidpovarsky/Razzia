/* oxlint-disable typescript/only-throw-error -- TanStack Router redirects are intentionally thrown by beforeLoad. */
import { SESSION_ROLES } from "@razzia/common/constants"
import { ThemeInstallationPreview } from "@razzia/web/features/manager/components/ThemeInstallationPreview"
import { getRole } from "@razzia/web/lib/session"
import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/manager/themes/$tenantId/$artifactId")({
  beforeLoad: () => {
    if (getRole() !== SESSION_ROLES.MANAGER) {
      throw redirect({ to: "/manager" })
    }
  },
  component: () => <ThemeInstallationPreview {...Route.useParams()} />,
})
