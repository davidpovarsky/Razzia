import { io as connect } from "socket.io-client"
import type {
  HttpClient,
  RazziaTransport,
  SocketConnection,
  SocketFactory,
} from "../telephony/transport"

/**
 * Creates a real Razzia Transport connecting over true HTTP fetch and real Socket.IO WebSockets.
 * Used for live integration acceptance tests against running local Razzia instances.
 */
export const createRealRazziaTransport = (): RazziaTransport => {
  const http: HttpClient = {
    fetch: (url: string, init?: RequestInit) => fetch(url, init),
  }

  const createSocket: SocketFactory = (
    url: string,
    options: {
      path: string
      auth: { token: string }
    },
  ): SocketConnection => {
    const socket = connect(url, {
      path: options.path,
      auth: options.auth,
      transports: ["websocket"],
      forceNew: true,
    })

    const proxySocket = new Proxy(socket, {
      get(target, prop, receiver) {
        if (prop === "on") {
          return (event: string, listener: (...args: unknown[]) => void) => {
            if (event === "game:status") {
              return target.on(event, (...args: unknown[]) => {
                if (
                  args[0] &&
                  typeof args[0] === "object" &&
                  "name" in (args[0] as Record<string, unknown>)
                ) {
                  const payload = args[0] as { name: unknown; data?: unknown }
                  listener(payload.name, payload.data)
                } else {
                  listener(...args)
                }
              })
            }

            return target.on(event, listener)
          }
        }

        const value = Reflect.get(target, prop, receiver) as unknown

        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value
      },
    })

    return proxySocket as unknown as SocketConnection
  }

  return { http, createSocket }
}

export class RealRazziaTransport implements RazziaTransport {
  readonly http: HttpClient
  readonly createSocket: SocketFactory

  constructor() {
    const transport = createRealRazziaTransport()
    this.http = transport.http
    this.createSocket = transport.createSocket
  }
}
