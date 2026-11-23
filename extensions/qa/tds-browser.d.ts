export {}

interface RecordedWireEvent {
  name: string
  payload?: { action?: string; payload?: Record<string, unknown> }
}

declare global {
  interface Window {
    __tdsMotionEvents: string[]
    __tdsLayoutMutations: number
    __tdsEvents: RecordedWireEvent[]
    __socket: {
      onAnyOutgoing: (
        listener: (
          name: string,
          payload?: RecordedWireEvent["payload"],
        ) => void,
      ) => void
    }
  }
}
