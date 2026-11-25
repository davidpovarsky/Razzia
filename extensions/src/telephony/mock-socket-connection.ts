import type { SocketConnection, SocketEventHandler } from "./transport"

export interface MockTransportHost {
  handleSocketEmit(
    socket: MockSocketConnection,
    event: string,
    data: unknown,
  ): void
  handleSocketDisconnect(socketId: string): void
}

/**
 * Mock Socket.IO connection object with event emitter capabilities.
 */
export class MockSocketConnection implements SocketConnection {
  readonly id: string
  readonly clientId: string
  connected = true
  currentGameId: string | null = null
  currentUsername: string | null = null

  private readonly transport: MockTransportHost
  private handlers = new Map<string, Set<SocketEventHandler>>()

  constructor(id: string, clientId: string, transport: MockTransportHost) {
    this.id = id
    this.clientId = clientId
    this.transport = transport
  }

  emit(event: string, ...args: unknown[]): void {
    if (!this.connected) {
      return
    }

    this.transport.handleSocketEmit(this, event, args[0])
  }

  on(event: string, handler: SocketEventHandler): void {
    let set = this.handlers.get(event)

    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }

    set.add(handler)
  }

  off(event: string, handler: SocketEventHandler): void {
    this.handlers.get(event)?.delete(handler)
  }

  disconnect(): void {
    this.connected = false
    this.transport.handleSocketDisconnect(this.id)
    this.handlers.clear()
  }

  /**
   * Triggers an inbound event from the mock server to this socket.
   */
  triggerServerEvent(event: string, ...args: unknown[]): void {
    if (!this.connected) {
      return
    }

    const set = this.handlers.get(event)

    if (set) {
      for (const handler of set) {
        handler(...args)
      }
    }
  }
}
