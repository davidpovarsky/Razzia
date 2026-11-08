import { SESSION_ROLES } from "@razzia/common/constants"
import ManagerAuthBackground from "@razzia/web/features/manager/components/ManagerAuthBackground"
import Configurations from "@razzia/web/features/manager/components/configurations"
import { getRole } from "@razzia/web/lib/session"
import { createFileRoute, redirect } from "@tanstack/react-router"

const ManagerConfigPage = () => (
  <ManagerAuthBackground showLanguageSwitcher={false}>
    <Configurations />
  </ManagerAuthBackground>
)

export const Route = createFileRoute("/manager/config")({
  beforeLoad: () => {
    if (getRole() !== SESSION_ROLES.MANAGER) {
      // oxlint-disable-next-line typescript/only-throw-error
      throw redirect({ to: "/manager" })
    }
  },
  component: ManagerConfigPage,
})
