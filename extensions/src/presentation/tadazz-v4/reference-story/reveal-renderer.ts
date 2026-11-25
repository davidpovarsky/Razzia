// @ts-nocheck -- supplied deterministic book/curtain/canvas choreography.
export function createRevealRenderer(root: HTMLElement) {
  const $ = (id) => root.querySelector("#" + id)
  const canvas = $("effects"),
    ctx = canvas.getContext("2d")
  const galleryEls = [...root.querySelectorAll(".story-card")],
    flyers = [...root.querySelectorAll(".fly-picture")]
  const book = $("bookSystem"),
    closedBook = $("closedBook"),
    openBook = $("openBook")
  const leftCurtain = $("curtainLeft"),
    rightCurtain = $("curtainRight"),
    seal = $("curtainCenter")
  const introWords = $("introWords"),
    headline = $("headline"),
    burstTitle = $("centralBurstTitle")
  const whiteout = $("stageWhiteout"),
    storyZ = $("storyZRise"),
    footer = $("storyFooter")
  const digits = $("timerDigits"),
    progress = $("timerProgress"),
    dot = $("timerDot")
  let remaining = 120
  const timerTotal = 120
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
  const mix = (a, b, u) => a + (b - a) * u
  const ease = (x) => {
    x = clamp(x)
    return x * x * (3 - 2 * x)
  }
  const phase = (a, b, t) => ease((t - a) / (b - a))
  const peak = (a, b, c, d, t) => phase(a, b, t) * (1 - phase(c, d, t))
  const cubic = (a, b, c, d, u) => {
    const v = 1 - u
    return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d
  }
  const rand = (n) => {
    const x = Math.sin(n * 137.137 + 78.132) * 43758.5453
    return x - Math.floor(x)
  }
  function renderCurtains(t) {
    const closed = phase(0.14, 1.02, t) * (1 - phase(1.22, 2.29, t))
    const travel = 855 * (1 - closed)
    leftCurtain.style.transform = `translate3d(${-travel.toFixed(2)}px,0,0)`
    rightCurtain.style.transform = `translate3d(${travel.toFixed(2)}px,0,0)`
    const sealAlpha = peak(0.58, 0.94, 1.22, 1.78, t)
    seal.style.opacity = String(sealAlpha)
    const medScale = mix(0.86, 1.0, phase(0.7, 1.2, t))
    seal.style.transform = `translate(-50%,-50%) scale(${medScale.toFixed(4)})`
    const wordAlpha = peak(0.03, 0.23, 0.6, 1.02, t)
    introWords.style.opacity = String(wordAlpha)
    introWords.style.transform = `translate3d(0,${mix(20, -8, phase(0.06, 0.91, t)).toFixed(2)}px,0) scale(${mix(0.975, 1.02, phase(0.08, 0.82, t)).toFixed(4)})`
  }
  function renderBook(t) {
    const rise = phase(1.32, 2.27, t)
    const settle = phase(3.15, 5.18, t)
    const initialScale = mix(0.64, 1.05, rise)
    const scale = mix(initialScale, 0.32, settle)
    const y = mix(mix(258, 88, rise), 460, settle)
    const rotate = mix(-7, 0, rise) * (1 - settle)
    book.style.opacity = String(phase(1.41, 1.8, t))
    book.style.transform = `translate3d(0,${y.toFixed(2)}px,0) rotate(${rotate.toFixed(3)}deg) scale(${scale.toFixed(4)})`
    const opening = phase(2.07, 2.77, t)
    closedBook.style.opacity = String(1 - phase(2.23, 2.73, t))
    closedBook.style.transform = `perspective(1200px) rotateY(${(-13 - 126 * opening).toFixed(2)}deg) rotateZ(${(-3 + 3 * opening).toFixed(2)}deg)`
    openBook.style.opacity = String(phase(2.2, 2.71, t))
    openBook.style.transform = `scaleX(${mix(0.44, 1, opening).toFixed(4)})`
    const flipping = phase(2.33, 2.98, t)
    const page = openBook.querySelector(".turn-page-1")
    page.style.opacity = String(peak(2.28, 2.39, 2.83, 3.14, t) * 0.5)
    page.style.transform = `perspective(900px) rotateY(${(-160 * flipping).toFixed(2)}deg)`
    openBook.querySelector(".turn-page-2").style.opacity = "0"
  }
  function renderEmblemAndTitle(t) {
    const up = phase(2.31, 3.19, t)
    storyZ.style.opacity = String(peak(2.27, 2.54, 3.04, 3.56, t))
    storyZ.style.transform = `translate3d(-50%,-50%,0) translateY(${mix(112, -48, up).toFixed(2)}px) scale(${mix(0.64, 1.08, up).toFixed(4)})`
    // No second title, flash or decorative logo: only the final permanent headline.
    burstTitle.style.opacity = "0"
    whiteout.style.opacity = "0"
    const titleEnter = phase(3.81, 4.55, t)
    headline.style.opacity = String(titleEnter)
    headline.style.transform = `translate3d(0,${mix(20, 0, titleEnter).toFixed(2)}px,0) scale(${mix(0.975, 1, titleEnter).toFixed(4)})`
    const footerEnter = phase(4.4, 5.34, t)
    footer.style.opacity = String(footerEnter)
    footer.style.transform = `translate3d(0,${mix(24, 0, footerEnter).toFixed(2)}px,0)`
  }
  function renderPictures(t) {
    const xs = [220, 510, 800, 1090, 1380]
    for (let i = 0; i < 5; i++) {
      const start = 2.74 + i * 0.115,
        end = 4.18 + i * 0.13
      const u = phase(start, end, t)
      // One fanning arc, rather than five separate 'jump and stop' movements.
      const x = cubic(
        800 + (i - 2) * 24,
        800 + (i - 2) * 164,
        xs[i] + (800 - xs[i]) * 0.12,
        xs[i],
        u,
      )
      const y = cubic(478, 294, 330 + Math.abs(i - 2) * 25, 394, u)
      const scale = mix(0.52, 1.12, u) + 0.11 * Math.sin(Math.PI * u)
      const angle = mix((i - 2) * -13, 0, u)
      const cross = phase(end - 0.27, end + 0.11, t)
      const flyAlpha = phase(start, start + 0.15, t) * (1 - cross)
      const cardAlpha = cross
      const flyer = flyers[i],
        card = galleryEls[i]
      flyer.style.opacity = String(flyAlpha)
      flyer.style.transform = `translate3d(${(x - 97).toFixed(2)}px,${(y - 97).toFixed(2)}px,0) rotate(${angle.toFixed(3)}deg) scale(${scale.toFixed(4)})`
      card.style.opacity = String(Math.max(1 - phase(0.16, 1.0, t), cardAlpha))
      card.style.transform = "translate3d(0,0,0) scale(1)"
    }
  }
  function sparkle(x, y, r, a, color) {
    if (a <= 0) return
    ctx.save()
    ctx.translate(x, y)
    ctx.globalAlpha = clamp(a)
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    ctx.rotate(Math.PI / 4)
    ctx.fillRect(-r / 2, -r * 2, r, r * 4)
    ctx.fillRect(-r * 2, -r / 2, r * 4, r)
    ctx.restore()
  }
  function renderEffects(t) {
    ctx.clearRect(0, 0, 1600, 900)
    const glow = peak(2.27, 2.64, 3.16, 3.76, t)
    if (glow > 0) {
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      for (let i = 0; i < 12; i++) {
        const x = 690 + rand(i * 11 + 7) * 225
        const y = 402 + rand(i * 17 + 3) * 105 - (t - 2.4) * 48
        sparkle(x, y, 1.2, glow * 0.26, "#ffe8a3")
      }
      ctx.restore()
    }
  }
  function renderTimer() {
    const value = Math.max(0, Math.ceil(remaining)),
      m = Math.floor(value / 60),
      s = String(value % 60).padStart(2, "0")
    digits.textContent = `${m}:${s}`
    digits.classList.toggle("last-seconds", value > 0 && value <= 15)
    digits.classList.toggle("finished", value === 0)
    const amount = clamp(remaining / timerTotal)
    progress.style.transform = `scaleX(${amount})`
    dot.style.left = `${(100 * amount).toFixed(3)}%`
  }
  return (elapsed: number, reduced = false) => {
    const t = reduced ? 5.6 : Math.min(5.6, elapsed)
    remaining = Math.max(0, 120 - Math.max(0, elapsed - 5.6))
    renderCurtains(t)
    renderBook(t)
    renderEmblemAndTitle(t)
    renderPictures(t)
    renderEffects(t)
    renderTimer()
  }
}
