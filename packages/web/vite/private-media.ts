import type { ProxyOptions } from "vite"

export const usesPrivateMediaRoutes = () =>
  process.env.TADAZZ_ACCOUNTS_ENABLED === "true"

/** Preview/dev must enforce the same tenant/room media boundary as nginx. */
export function createPrivateMediaProxy(
  socketUrl: string,
): Record<string, ProxyOptions> {
  return usesPrivateMediaRoutes()
    ? {
        "/media/": {
          target: socketUrl,
          rewrite: (path) => path.replace(/^\/media\//u, "/api/media/raw/"),
        },
      }
    : {}
}
