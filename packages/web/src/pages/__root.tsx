import ErrorPage from "@razzia/web/components/ErrorPage"
import NotFound from "@razzia/web/components/NotFound"
import { SocketProvider } from "@razzia/web/features/game/contexts/socket-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router"
import { Tooltip } from "radix-ui"
import { useEffect, useLayoutEffect } from "react"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

const GameLayout = () => {
  const isGameRoute = useLocation({
    select: (location) => /^\/(party|display)(\/|$)/u.test(location.pathname),
  })
  // Continue the document bootstrap before a client-side route paints, even
  // while room state is loading or the shared platform opening is active.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.toggleAttribute("data-tadazz-game-route", isGameRoute)

    return () => root.removeAttribute("data-tadazz-game-route")
  }, [isGameRoute])

  useEffect(() => {
    document.body.classList.add("bg-secondary")

    return () => {
      document.body.classList.remove("bg-secondary")
    }
  }, [])

  return (
    <div className="bg-secondary antialiased">
      <Outlet />
    </div>
  )
}

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <Tooltip.Provider delayDuration={150}>
          <GameLayout />
        </Tooltip.Provider>
      </SocketProvider>
    </QueryClientProvider>
  ),
  errorComponent: ({ error }) => (
    <div className="bg-secondary antialiased">
      <ErrorPage error={error} />
    </div>
  ),
  notFoundComponent: () => (
    <div className="bg-secondary antialiased">
      <NotFound />
    </div>
  ),
})
