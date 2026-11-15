import { runSteps, type StageStep } from "../tadazz-show/show-director"
import type { TadazzStageHandle } from "../tadazz-show/TadazzStage"

/** Owns one mounted stage. Invalidation must precede unmount or replacement. */
export function createPreviewTransitionOwner(stage: TadazzStageHandle) {
  let generation = 0
  let disposed = false

  function invalidate() {
    generation += 1
  }

  async function run(steps: StageStep[]): Promise<boolean> {
    const captured = ++generation
    const current = () => !disposed && captured === generation

    // The proxy captures this stage instance, never a mutable React ref. A wipe
    // callback can execute after runSteps has checked its generation.
    const guarded = new Proxy(stage, {
      get(target, property) {
        if (property === "nextQuestion") {
          return async (question: Parameters<TadazzStageHandle["nextQuestion"]>[0]) => {
            if (!current()) return
            await target.playZZWipe(async () => {
              if (current()) await target.showQuestion(question)
            })
          }
        }
        const value = Reflect.get(target, property, target)
        if (typeof value !== "function") return value
        return (...args: unknown[]) => {
          if (!current()) return undefined
          const safeArgs = args.map((arg) =>
            typeof arg === "function"
              ? (...callbackArgs: unknown[]) => {
                  if (current()) return arg(...callbackArgs)
                  return undefined
                }
              : arg,
          )
          return Reflect.apply(value, target, safeArgs)
        }
      },
    })
    try {
      return await runSteps(guarded, steps, current)
    } catch (error) {
      if (!current()) return false
      throw error
    }
  }

  return {
    run,
    invalidate,
    capture() {
      const captured = generation
      return () => !disposed && captured === generation
    },
    dispose() {
      invalidate()
      disposed = true
    },
  }
}
