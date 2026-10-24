import React, { useEffect, useState } from "react"
import type { KeypadSimulatorCore, SimulatorDisplayState } from "./simulator"

export interface KeypadSimulatorProps {
  simulator: KeypadSimulatorCore
  title?: string
  className?: string
}

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
]

/**
 * Interactive React Keypad Simulator Component for browser-based testing.
 * Provides a vintage telephone keypad and LCD display connected to KeypadSimulatorCore.
 */
export const KeypadSimulator: React.FC<KeypadSimulatorProps> = ({
  simulator,
  title = "Telephone Keypad Simulator",
  className = "",
}) => {
  const [state, setState] = useState<SimulatorDisplayState>(
    simulator.getState(),
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsubscribe = simulator.subscribe((s: SimulatorDisplayState) =>
      setState(s),
    )
    return unsubscribe
  }, [simulator])

  const handleCall = async () => {
    setLoading(true)
    try {
      await simulator.startCall()
    } finally {
      setLoading(false)
    }
  }

  const handleHangup = async () => {
    setLoading(true)
    try {
      await simulator.hangup()
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = async (key: string) => {
    if (state.status !== "connected" || loading) return
    setLoading(true)
    try {
      await simulator.pressKey(key)
    } finally {
      setLoading(false)
    }
  }

  const isConnected = state.status === "connected"

  return (
    <div
      className={`flex max-w-sm flex-col rounded-2xl border border-neutral-700 bg-neutral-900 p-5 font-sans text-neutral-100 shadow-2xl ${className}`}
      data-testid="keypad-simulator"
    >
      <div className="mb-4 flex items-center justify-between border-b border-neutral-800 pb-3">
        <h3 className="text-sm font-semibold tracking-wider text-amber-500 uppercase">
          {title}
        </h3>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              isConnected
                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                : state.status === "calling"
                  ? "animate-pulse bg-amber-400"
                  : "bg-neutral-600"
            }`}
          />
          <span className="text-xs text-neutral-400 uppercase">
            {state.status}
          </span>
        </div>
      </div>

      {/* LCD Display */}
      <div className="mb-5 flex min-h-[90px] flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs text-emerald-400 shadow-inner">
        <div className="line-clamp-3 leading-relaxed">
          {state.displayMessage}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-neutral-800/60 pt-1 text-sm font-bold text-amber-400">
          <span className="text-neutral-500">INPUT:</span>
          <span>{state.enteredDigits || "—"}</span>
        </div>
      </div>

      {/* 3x4 Telephone Keypad */}
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {KEYS.flat().map((key) => (
          <button
            key={key}
            type="button"
            disabled={!isConnected || loading}
            onClick={() => handleKeyPress(key)}
            className="flex h-12 items-center justify-center rounded-xl bg-neutral-800 text-lg font-bold text-neutral-200 transition-colors hover:bg-neutral-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid={`key-${key}`}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Control Buttons: Call / Hangup / Clear */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={isConnected || loading}
          onClick={handleCall}
          className="flex h-11 items-center justify-center rounded-xl bg-emerald-600 text-xs font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="btn-call"
        >
          CALL
        </button>
        <button
          type="button"
          disabled={!isConnected || loading}
          onClick={() => simulator.clearInput()}
          className="flex h-11 items-center justify-center rounded-xl bg-neutral-700 text-xs font-bold text-neutral-300 transition hover:bg-neutral-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="btn-clear"
        >
          CLEAR
        </button>
        <button
          type="button"
          disabled={!isConnected || loading}
          onClick={handleHangup}
          className="flex h-11 items-center justify-center rounded-xl bg-rose-600 text-xs font-bold text-white transition hover:bg-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="btn-hangup"
        >
          END
        </button>
      </div>
    </div>
  )
}
