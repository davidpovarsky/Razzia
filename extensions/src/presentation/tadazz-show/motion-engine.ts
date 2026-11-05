import {
  DEFAULT_TIMING,
  tzEaseOutCubic,
  type Keyframes,
  type MotionTiming,
} from "./motion-spec"

interface TweenTask {
  ended: boolean
  finish: () => void
  cancel: () => void
}

/**
 * TypeScript port of the reference `TadazzMotion` animation core
 * (`_animate`, `_tweenText`, `_resetAnimations`, `finishAnimations`,
 * `setReducedMotion`). It drives the Web Animations API with the exact
 * semantics of the reference:
 *  - every animation is `fill: 'both'`, so delayed elements are held on their
 *    first frame (no flash before entrance);
 *  - when it finishes, the last keyframe is written to the inline style and
 *    the animation is cancelled (no lingering compositor animations);
 *  - `reset()` advances the sequence and finishes everything still running;
 *  - `finishAll()` fast-forwards the current sequence only;
 *  - reduced motion or fast-forward jump straight to the final frame.
 */
export class MotionEngine {
  reducedMotion = false
  private sequence = 0
  private fastForwardSeq = -1
  private readonly active = new Set<Animation>()
  private readonly tweens = new Set<TweenTask>()
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()

  get currentSequence(): number {
    return this.sequence
  }

  /** `_resetAnimations()` */
  reset(): number {
    this.sequence += 1
    this.fastForwardSeq = -1
    for (const t of Array.from(this.tweens)) t.cancel()
    for (const a of Array.from(this.active)) {
      try {
        a.finish()
      } catch {
        try {
          a.cancel()
        } catch {
          /* already gone */
        }
      }
    }
    this.active.clear()
    return this.sequence
  }

  /** `finishAnimations()` — completes the current motion without navigating. */
  finishAll(): void {
    this.fastForwardSeq = this.sequence
    for (const t of Array.from(this.tweens)) t.finish()
    for (const a of Array.from(this.active)) {
      try {
        a.finish()
      } catch {
        try {
          a.cancel()
        } catch {
          /* already gone */
        }
      }
    }
  }

  isStale(token: number): boolean {
    return token !== this.sequence
  }

  private get skipping(): boolean {
    return this.reducedMotion || this.fastForwardSeq === this.sequence
  }

  /** `_animate(node, frames, {duration, delay, easing})` */
  animate(
    node: HTMLElement | null | undefined,
    frames: Keyframes,
    timing: Partial<MotionTiming> = {},
  ): Promise<void> {
    if (!node) return Promise.resolve()
    const { duration, delay, easing } = { ...DEFAULT_TIMING, ...timing }
    const last = frames[frames.length - 1]
    const apply = () => {
      for (const [k, v] of Object.entries(last)) {
        if (k !== "offset" && k !== "easing") {
          ;(node.style as unknown as Record<string, string>)[k] = String(v)
        }
      }
    }
    if (this.skipping || typeof node.animate !== "function") {
      apply()
      return Promise.resolve()
    }
    const anim = node.animate(frames as Keyframe[], {
      duration: Math.max(0, Number(duration) || 0),
      delay: Math.max(0, Number(delay) || 0),
      easing,
      fill: "both",
    })
    this.active.add(anim)
    return new Promise((resolve) => {
      let settled = false
      const done = (finished: boolean) => {
        if (settled) return
        settled = true
        if (finished) apply()
        try {
          anim.cancel()
        } catch {
          /* noop */
        }
        this.active.delete(anim)
        resolve()
      }
      anim.onfinish = () => done(true)
      anim.oncancel = () => done(false)
    })
  }

  /** `_tweenText(node, start, end, duration, delay, format)` */
  tweenText(
    node: HTMLElement | null | undefined,
    start: number,
    end: number,
    duration: number,
    delay: number,
    format: (n: number) => string,
  ): Promise<void> {
    if (!node) return Promise.resolve()
    const finishValue = () => {
      node.textContent = format(end)
    }
    if (this.skipping || typeof requestAnimationFrame !== "function") {
      finishValue()
      return Promise.resolve()
    }
    const token = this.sequence
    return new Promise((resolve) => {
      const begin = performance.now() + delay
      const task: TweenTask = {
        ended: false,
        finish: () => done(true),
        cancel: () => done(false),
      }
      const done = (final: boolean) => {
        if (task.ended) return
        task.ended = true
        if (final) finishValue()
        this.tweens.delete(task)
        resolve()
      }
      this.tweens.add(task)
      const frame = (now: number) => {
        if (task.ended) return
        if (token !== this.sequence) {
          done(false)
          return
        }
        if (now < begin) {
          requestAnimationFrame(frame)
          return
        }
        const p = Math.min(1, Math.max(0, (now - begin) / duration))
        node.textContent = format(start + (end - start) * tzEaseOutCubic(p))
        if (p < 1) requestAnimationFrame(frame)
        else done(true)
      }
      requestAnimationFrame(frame)
    })
  }

  /** `_countNumber()` */
  countPercent(node: HTMLElement | null | undefined, start: number, end: number, duration = 900, delay = 0) {
    return this.tweenText(node, start, end, duration, delay, (n) => `${Math.round(n)}%`)
  }

  /** `_animateNumeric()` */
  countNumber(node: HTMLElement | null | undefined, start: number, end: number, duration = 850, delay = 0) {
    return this.tweenText(node, start, end, duration, delay, (n) =>
      Math.round(n).toLocaleString("en-US"),
    )
  }

  /** `wait(t)` — cancelled timers are cleared on dispose. */
  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve()
    return new Promise((resolve) => {
      const id = setTimeout(() => {
        this.timers.delete(id)
        resolve()
      }, ms)
      this.timers.add(id)
    })
  }

  /** `destroy()` */
  dispose(): void {
    this.reset()
    for (const id of this.timers) clearTimeout(id)
    this.timers.clear()
  }
}
