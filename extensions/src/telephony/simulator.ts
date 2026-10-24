import { MockProvider } from "./mock-provider"
import { ProviderRegistry } from "./provider"
import type { TelephonyBridge } from "./bridge"
import type { TelephonyDirective } from "./types"

export interface SimulatorDisplayState {
  callId: string
  status: "idle" | "calling" | "connected" | "disconnected"
  displayMessage: string
  enteredDigits: string
  lastDirective: TelephonyDirective | null
  history: string[]
}

export type SimulatorDisplayListener = (state: SimulatorDisplayState) => void

/**
 * Headless telephone keypad simulator engine.
 * Provides a clean API for CLI tools, browser components, and automated tests.
 */
export class KeypadSimulatorCore {
  private readonly bridge: TelephonyBridge
  private readonly mockProvider: MockProvider
  private readonly secret: string

  private state: SimulatorDisplayState = {
    callId: `sim_call_${Math.random().toString(36).slice(2, 9)}`,
    status: "idle",
    displayMessage: "READY - Press CALL to connect",
    enteredDigits: "",
    lastDirective: null,
    history: [],
  }

  private listeners = new Set<SimulatorDisplayListener>()

  constructor(
    bridge: TelephonyBridge,
    options?: { secret?: string; callId?: string; provider?: MockProvider },
  ) {
    this.bridge = bridge

    if (options?.provider) {
      this.mockProvider = options.provider
      this.secret = options.provider.secret
    } else {
      const registered = ProviderRegistry.getInstance().get("mock")

      if (registered instanceof MockProvider) {
        this.mockProvider = registered
        this.secret = registered.secret
      } else {
        this.secret = options?.secret ?? "local-razzia-mock-secret-key-12345"
        this.mockProvider = new MockProvider({ secret: this.secret })
      }
    }

    if (options?.callId) {
      this.state.callId = options.callId
    }
  }

  getState(): Readonly<SimulatorDisplayState> {
    return { ...this.state }
  }

  subscribe(listener: SimulatorDisplayListener): () => void {
    this.listeners.add(listener)
    listener(this.getState())

    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    const current = this.getState()
    for (const l of this.listeners) {
      l(current)
    }
  }

  private logHistory(msg: string): void {
    this.state.history = [...this.state.history.slice(-19), msg]
  }

  /**
   * Dials in and starts the telephone call.
   */
  async startCall(callerId?: string): Promise<TelephonyDirective> {
    this.state.status = "calling"
    this.state.displayMessage = "DIALING..."
    this.state.enteredDigits = ""
    this.notify()

    const req = this.mockProvider.createSignedRequest({
      callId: this.state.callId,
      type: "CALL_START",
      callerId: callerId ?? `sim-${this.state.callId}`,
    })

    const response = await this.bridge.handleWebhookRequest("mock", req)
    let bodyData: Record<string, unknown> = {}

    try {
      const parsed: unknown = JSON.parse(response.body)

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        bodyData = parsed as Record<string, unknown>
      }
    } catch {
      bodyData = {}
    }

    if (response.statusCode >= 400) {
      const errMsg =
        typeof bodyData.error === "string"
          ? bodyData.error
          : `HTTP ${response.statusCode}`
      const directive: TelephonyDirective = {
        type: "play",
        message: errMsg,
      }
      this.state.status = "disconnected"
      this.state.displayMessage = directive.message
      this.state.lastDirective = directive
      this.logHistory(`[ERROR] ${directive.message}`)
      this.notify()

      return directive
    }

    const rawDirective = bodyData.directive
    const directive: TelephonyDirective =
      rawDirective && typeof rawDirective === "object"
        ? (rawDirective as TelephonyDirective)
        : {
            type: "play",
            message: "Call connected",
          }

    this.state.status = "connected"
    this.state.lastDirective = directive

    if (directive.type === "read" || directive.type === "play") {
      this.state.displayMessage = directive.message
      this.logHistory(`[SYSTEM] ${directive.message}`)
    }

    this.notify()

    return directive
  }

  /**
   * Simulates pressing a keypad key ('0'-'9', '*', '#').
   */
  async pressKey(key: string): Promise<TelephonyDirective> {
    if (this.state.status !== "connected") {
      this.state.displayMessage = "CALL NOT CONNECTED - Press CALL first"
      this.notify()

      return { type: "noop" }
    }

    this.state.enteredDigits += key
    this.logHistory(`[KEYPAD] ${key}`)

    const req = this.mockProvider.createSignedRequest({
      callId: this.state.callId,
      type: "DTMF",
      digit: key,
    })

    const response = await this.bridge.handleWebhookRequest("mock", req)
    let bodyData: Record<string, unknown> = {}

    try {
      const parsed: unknown = JSON.parse(response.body)

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        bodyData = parsed as Record<string, unknown>
      }
    } catch {
      bodyData = {}
    }

    if (response.statusCode >= 400) {
      const errMsg =
        typeof bodyData.error === "string"
          ? bodyData.error
          : `HTTP ${response.statusCode}`
      const directive: TelephonyDirective = {
        type: "play",
        message: errMsg,
      }
      this.state.displayMessage = directive.message
      this.state.lastDirective = directive
      this.logHistory(`[ERROR] ${directive.message}`)
      this.notify()

      return directive
    }

    const rawDirective = bodyData.directive
    const directive: TelephonyDirective =
      rawDirective && typeof rawDirective === "object"
        ? (rawDirective as TelephonyDirective)
        : { type: "noop" }
    this.state.lastDirective = directive

    if (directive.type === "read" || directive.type === "play") {
      this.state.displayMessage = directive.message
      this.logHistory(`[SYSTEM] ${directive.message}`)

      if (directive.type === "read") {
        this.state.enteredDigits = ""
      }
    } else if (directive.type === "hangup") {
      this.state.status = "disconnected"
      this.state.displayMessage = "CALL ENDED BY HOST"
      this.logHistory("[SYSTEM] Hangup")
    }

    this.notify()

    return directive
  }

  /**
   * Helper to enter an entire string of digits (e.g. 6-digit game PIN).
   */
  async enterDigits(digits: string): Promise<TelephonyDirective> {
    let chain: Promise<TelephonyDirective> = Promise.resolve(
      this.state.lastDirective ?? { type: "noop" },
    )

    for (const char of digits) {
      chain = chain.then(() => this.pressKey(char))
    }

    return await chain
  }

  /**
   * Clears currently entered buffer on the simulator display.
   */
  clearInput(): void {
    this.state.enteredDigits = ""
    this.notify()
  }

  /**
   * Ends/hangs up the call.
   */
  async hangup(): Promise<void> {
    if (this.state.status === "disconnected" || this.state.status === "idle") {
      return
    }

    const req = this.mockProvider.createSignedRequest({
      callId: this.state.callId,
      type: "HANGUP",
    })

    await this.bridge.handleWebhookRequest("mock", req)

    this.state.status = "disconnected"
    this.state.displayMessage = "CALL DISCONNECTED"
    this.state.enteredDigits = ""
    this.logHistory("[CALL] Hung up")
    this.notify()
  }

  /**
   * Resets simulator with a new call ID.
   */
  reset(newCallId?: string): void {
    this.state = {
      callId: newCallId ?? `sim_call_${Math.random().toString(36).slice(2, 9)}`,
      status: "idle",
      displayMessage: "READY - Press CALL to connect",
      enteredDigits: "",
      lastDirective: null,
      history: [],
    }
    this.notify()
  }
}
