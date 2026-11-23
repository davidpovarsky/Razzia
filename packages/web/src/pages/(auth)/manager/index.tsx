import { ManagerAuthPage } from "@razzia/web/features/manager/components/ManagerAuthPage"
import { managerAuthBeforeLoad } from "@razzia/web/features/manager/account-route-guard"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/(auth)/manager/")({
  beforeLoad: managerAuthBeforeLoad,
  component: ManagerAuthPage,
})
