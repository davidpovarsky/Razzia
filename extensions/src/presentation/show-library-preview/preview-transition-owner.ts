import { runSteps, type StageStep } from "../tadazz-show/show-director"
import type { TadazzStageHandle } from "../tadazz-show/TadazzStage"

/** Owns one mounted stage. Invalidation must precede unmount or replacement. */
export function createPreviewTransitionOwner(
  stage: TadazzStageHandle,
  latestVoting?: (
    questionKey: string | null,
  ) => { seconds: number | null; deadlineMs?: number } | null,
) {
  let generation = 0
  let disposed = false
  const unsafe = new Set<Promise<unknown>>()

  function track<T>(promise: Promise<T>): Promise<T> {
    unsafe.add(promise)
    void promise.then(
      () => unsafe.delete(promise),
      () => unsafe.delete(promise),
    )
    return promise
  }

  function invalidate() {
    generation += 1
  }

  async function run(steps: StageStep[]): Promise<boolean> {
    if (
      steps.some(
        (step) =>
          ![
            "showQuestion",
            "presentOptions",
            "nextQuestion",
            "openVoting",
            "lockVoting",
            "revealResults",
          ].includes(step.op),
      )
    ) {
      throw new Error("show-preview:unsupported-step")
    }
    const captured = ++generation
    const current = () => !disposed && captured === generation
    if (unsafe.size) await Promise.allSettled([...unsafe])
    if (!current()) return false

    // The proxy captures this stage instance, never a mutable React ref. A wipe
    // callback can execute after runSteps has checked its generation.
    const guarded = new Proxy(stage, {
      get(target, property) {
        if (property === "nextQuestion") {
          return (question: Parameters<TadazzStageHandle["nextQuestion"]>[0]) =>
            track(
              (async () => {
                if (!current()) {
                  return
                }

                const entrance: { promise?: Promise<void> } = {}
                await target.playZZWipe(async () => {
                  if (current()) {
                    entrance.promise = target.showQuestion(question)
                    await entrance.promise
                  }
                })

                if (entrance.promise) {
                  await entrance.promise
                } else if (current()) {
                  throw new Error("show-preview:wipe-not-covered")
                }
              })(),
            )
        }
        if (property === "openVoting" && latestVoting) {
          return (...args: Parameters<TadazzStageHandle["openVoting"]>) => {
            if (!current()) return Promise.resolve()

            const [, , question] = args
            const timing = latestVoting(question?.key ?? target.questionKey)

            return timing
              ? target.openVoting(timing.seconds, timing.deadlineMs, question)
              : Promise.resolve()
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
          const result = Reflect.apply(value, target, safeArgs)

          return (property === "lockVoting" || property === "playZZWipe") &&
            result instanceof Promise
            ? track(result)
            : result
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
    hasUnsafe: () => unsafe.size > 0,
    async drain() {
      await Promise.allSettled([...unsafe])
    },
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
