import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/(auth)/")({
  beforeLoad: ({ search }) => {
    // Existing printed/old QR links remain valid after moving player joining.
    if (search.pin)
      throw redirect({
        to: "/game",
        search: { pin: search.pin },
        replace: true,
      })
    throw redirect({ to: "/manager", replace: true })
  },
})
