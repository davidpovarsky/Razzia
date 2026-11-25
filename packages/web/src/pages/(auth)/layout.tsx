import Background from "@razzia/web/components/Background"
import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
import ManagerAuthBackground from "@razzia/web/features/manager/components/ManagerAuthBackground"
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { z } from "zod"

const searchSchema = z.object({
  pin: z.coerce.string().optional(),
})

const AuthLayout = () => {
  const isManager = useRouterState({
    select: (state) => state.location.pathname.startsWith("/manager"),
  })

  if (isManager) {
    return (
      <ManagerAuthBackground>
        <Outlet />
      </ManagerAuthBackground>
    )
  }

  return (
    <Background>
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Outlet />
    </Background>
  )
}

export const Route = createFileRoute("/(auth)")({
  component: AuthLayout,
  validateSearch: searchSchema,
})
