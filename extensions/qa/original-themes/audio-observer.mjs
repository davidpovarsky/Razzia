/** Passive observations of genuine HTMLMediaElement playback; no fake clocks or play results. */
export async function installAudioObserver(page) {
  await page.addInitScript(() => {
    const elements = []
    const plays = []
    const errors = []
    let armed = false,
      frame = 0,
      samples = 0,
      ownerViolations = 0,
      duplicateTracks = 0
    const original = HTMLMediaElement.prototype.play
    function wrapped(...args) {
      let attempt = undefined

      if (this instanceof HTMLAudioElement) {
        if (!elements.includes(this)) {
          elements.push(this)
        }

        attempt = { url: this.currentSrc || this.src, status: "pending" }
        plays.push(attempt)
      }

      try {
        const result = Reflect.apply(original, this, args)

        if (attempt) {
          void Promise.resolve(result).then(
            () => {
              attempt.status = "fulfilled"
            },
            () => {
              attempt.status = "rejected"
            },
          )
        }

        return result
      } catch (error) {
        if (attempt) {
          attempt.status = "rejected"
        }

        throw error
      }
    }
    HTMLMediaElement.prototype.play = wrapped
    const active = () =>
      elements.filter(
        (element) =>
          !element.paused &&
          !element.ended &&
          !element.muted &&
          element.volume > 0 &&
          element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          !element.error,
      )
    const tick = () => {
      if (armed && document.querySelector('[data-testid="tadazz-show"]')) {
        samples += 1
        const owners = document.querySelectorAll(
          '[data-testid="audio-cue-player-state"]',
        )

        if (owners.length !== 1) {
          ownerViolations += 1
        }

        const counts = new Map()
        for (const element of active()) {
          const url = element.currentSrc || element.src
          counts.set(url, (counts.get(url) ?? 0) + 1)
        }

        if ([...counts.values()].some((count) => count > 1)) {
          duplicateTracks += 1
        }
      }

      frame = requestAnimationFrame(tick)
    }
    const onError = (event) => {
      if (event.target instanceof HTMLMediaElement) {
        errors.push({
          url: event.target.currentSrc || event.target.src,
          code: event.target.error?.code,
        })
      }
    }
    document.addEventListener("error", onError, true)
    window.__originalAudio = {
      arm: () => {
        armed = true
      },
      read: () => ({
        samples,
        ownerViolations,
        duplicateTracks,
        errors: [...errors],
        fulfilled: plays
          .filter((play) => play.status === "fulfilled")
          .map((play) => play.url),
        rejected: plays
          .filter((play) => play.status === "rejected")
          .map((play) => play.url),
        active: active().map((element) => ({
          url: element.currentSrc || element.src,
          time: element.currentTime,
        })),
      }),
      stop: () => {
        cancelAnimationFrame(frame)
        document.removeEventListener("error", onError, true)

        if (HTMLMediaElement.prototype.play === wrapped) {
          HTMLMediaElement.prototype.play = original
        }
      },
    }
    frame = requestAnimationFrame(tick)
  })
}
