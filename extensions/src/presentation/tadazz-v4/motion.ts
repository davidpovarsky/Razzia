import { percentagesFor, topIndicesFor, type TadazzV4Cue, type TadazzV4Data, type TadazzV4Scene } from "./types"

/** Native WAAPI choreography. Frame coordinates, keyframes, easings, and timings are
 * transcribed from animation library set.html, TadazzStageKit v4, not approximated.
 * No demo imagery/data, no iframe, and no HTML interpreter. */
export const V4_EASE = "cubic-bezier(.16,.9,.23,1)"
export const V4_EASE_DRAMATIC = "cubic-bezier(.15,.82,.22,1.02)"
export const V4_FX_COLORS = ["#eaff59", "#26c9ff", "#ef79f8", "#ffd071", "#508dff"] as const
export const V4_FRAME_SIZE = { width: 1920, height: 1080 } as const

export interface MotionConfig {
  motionScale?: number
  reducedMotion?: boolean
  onCue?: (cue: TadazzV4Cue) => void
  onWipeCovered?: () => void
}
interface AnimOptions { duration?: number; delay?: number; easing?: string; iterations?: number }
const raf = (cb: FrameRequestCallback) => requestAnimationFrame(cb)
const ease = (p: number) => Math.max(0, Math.min(1, p))
const seededRandom = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}
function query<T extends Element = HTMLElement>(root: Element, selector: string): T | null { return root.querySelector<T>(selector) }
function all<T extends Element = HTMLElement>(root: Element, selector: string): T[] { return Array.from(root.querySelectorAll<T>(selector)) }

export class TadazzV4Motion {
  private active: Animation[] = []
  private tickerFrames: number[] = []
  private finalizers: Array<() => void> = []
  private token = 0
  private scene: TadazzV4Scene = "question"
  constructor(private stage: HTMLElement, private config: MotionConfig = {}) {}

  /** Stop only effects owned by this kit. Never mutate the Razzia/host timeline. */
  stop() {
    ++this.token
    for (const animation of this.active) { try { animation.cancel() } catch { /* a stale WAAPI timeline */ } }
    this.active = []
    this.finalizers = []
    for (const id of this.tickerFrames) cancelAnimationFrame(id)
    this.tickerFrames = []
    const fx = this.fx()
    if (fx) fx.replaceChildren()
    const flash = this.flash()
    if (flash) flash.style.opacity = "0"
  }
  pause() { this.active.forEach(a => { try { a.pause() } catch { /* stale */ } }) }
  resume() { this.active.forEach(a => { try { a.play() } catch { /* stale */ } }) }
  setReducedMotion(on: boolean) { this.config.reducedMotion = on }
  finishAll() {
    for (const id of this.tickerFrames) cancelAnimationFrame(id)
    this.tickerFrames = []
    for (const a of this.active) { try { a.finish() } catch { /* infinite or disposed */ } }
    const fin = [...this.finalizers]
    this.finalizers = []
    for (const fn of fin) { try { fn() } catch { /* ignore */ } }
  }
  private motionMs(ms: number) { return this.config.reducedMotion ? 1 : Math.max(1, Math.round(ms / Math.max(.2, this.config.motionScale ?? 1))) }
  private animate(node: Element | null, frames: Keyframe[], options: AnimOptions = {}): Animation | null {
    if (!node || !('animate' in node)) return null
    const a = node.animate(frames, {
      duration: this.motionMs(options.duration || 650),
      delay: this.config.reducedMotion ? 0 : Math.round((options.delay || 0) / Math.max(.2, this.config.motionScale ?? 1)),
      easing: options.easing || V4_EASE,
      fill: "both",
      iterations: options.iterations || 1,
    })
    this.active.push(a)
    void a.finished.catch(() => undefined)
    return a
  }
  private fx(): HTMLElement | null { return query(this.stage, '.tzv4-fx-root') }
  private flash(): HTMLElement | null { return query(this.stage, '.tzv4-screen-flash') }
  private root(): HTMLElement { return query<HTMLElement>(this.stage, '.tzv4-scene-root') ?? this.stage }
  private cue(name: string, delay = 0, callback?: () => void) {
    const token = this.token
    const fire = () => {
      if (token !== this.token) return
      callback?.()
      this.config.onCue?.({ name, scene: this.scene })
    }
    if (delay <= 0 || this.config.reducedMotion) { fire(); return }
    const owner = this.fx()
    if (!owner) return
    const clock = document.createElement('span')
    clock.setAttribute('aria-hidden', 'true')
    clock.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;'
    owner.appendChild(clock)
    const a = this.animate(clock, [{ opacity: 0 }, { opacity: 0 }], { duration: 1, delay })
    void a?.finished.then(fire).catch(() => undefined)
  }
  private tick(callback: FrameRequestCallback) {
    const id = raf(callback)
    this.tickerFrames.push(id)
    return id
  }
  private questionMotion(delay = 80) {
    const root = this.root()
    const q = query(root, '.q-frame')
    this.animate(q, [
      { opacity: 0, transform: 'translate3d(0,95px,0) scale(.96)' },
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
    ], { duration: 970, delay })
    this.animate(query(root, '.q-frame .eyebrow'), [
      { opacity: 0, transform: 'translate3d(0,18px,0)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 730, delay: delay + 360 })
    this.animate(query(root, '.q-text'), [
      { opacity: 0, transform: 'translate3d(0,22px,0)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 760, delay: delay + 500 })
  }
  private cardsMotion(baseDelay = 460) {
    all(this.root(), '.choice-slot').forEach((slot, i) => {
      const side = i % 2 ? 1 : -1
      this.animate(slot, [
        { opacity: 0, transform: `translate3d(${side * 48}px,168px,0) rotate(${side * 5}deg) scale(.78)` },
        { opacity: 1, transform: `translate3d(0,-9px,0) rotate(${side * -1.2}deg) scale(1.02)`, offset: .78 },
        { opacity: 1, transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' },
      ], { duration: 1180, delay: baseDelay + i * 105, easing: V4_EASE_DRAMATIC })
    })
  }
  private impact(delay = 0, style: 'big' | 'small' = 'big') {
    const fx = this.fx()
    if (!fx) return
    this.cue('impact', delay + 65)
    const full = style === 'big'
    const add = (cls: string) => { const el = document.createElement('div'); el.className = cls; fx.appendChild(el); return el }
    const ring = add('blast')
    this.animate(ring, [
      { opacity: 0, transform: 'scale(.2)' },
      { opacity: .85, transform: 'scale(.57)', offset: .14 },
      { opacity: .12, transform: 'scale(2.8)', offset: .72 },
      { opacity: 0, transform: 'scale(3.6)' },
    ], { duration: full ? 1060 : 800, delay, easing: 'cubic-bezier(.14,.5,.45,1)' })
    const blade = add('light-saber')
    this.animate(blade, [
      { opacity: 0, transform: 'rotate(-24deg) scaleX(.1)' },
      { opacity: .95, transform: 'rotate(-20deg) scaleX(1.4)', offset: .26 },
      { opacity: 0, transform: 'rotate(-13deg) scaleX(1.95)' },
    ], { duration: 920, delay: delay + 35 })
    this.animate(this.flash(), [
      { opacity: 0 }, { opacity: .98, offset: .10 }, { opacity: .26, offset: .28 }, { opacity: 0 },
    ], { duration: 680, delay: delay + 55, easing: 'ease-out' })
    const random = seededRandom(7319)
    for (let i = 0; i < (full ? 55 : 22); i++) {
      const a = random() * Math.PI * 2
      const length = 300 + random() * 650
      const sx = Math.cos(a) * length
      const sy = Math.sin(a) * length * .72
      const spark = add('spark')
      const color = V4_FX_COLORS[i % V4_FX_COLORS.length]
      spark.style.background = color
      spark.style.color = color
      spark.style.width = `${(12 + random() * 57).toFixed(0)}px`
      this.animate(spark, [
        { opacity: 0, transform: `translate3d(-50%,-50%,0) rotate(${a}rad) scaleX(.15)` },
        { opacity: .92, transform: `translate3d(${sx * .30}px,${sy * .30}px,0) rotate(${a}rad) scaleX(1)`, offset: .13 },
        { opacity: 0, transform: `translate3d(${sx}px,${sy}px,0) rotate(${a}rad) scaleX(.4)` },
      ], { duration: 700 + random() * 630, delay: delay + random() * 150, easing: 'cubic-bezier(.2,.48,.48,1)' })
    }
  }
  private voting(locked: boolean, data: TadazzV4Data = {}) {
    const keepCards = Boolean(data.cardsAlreadyOnStage)
    if (!keepCards) {
      this.questionMotion(40)
      this.cardsMotion(230)
    }
    const status = query(this.root(), '.vote-status')
    this.animate(status, [
      { opacity: 0, transform: 'translate(-50%,65px) scale(.72)' },
      { opacity: 1, transform: 'translate(-50%,0) scale(1)' },
    ], { duration: 980, delay: keepCards ? (locked ? 80 : 120) : (locked ? 950 : 1300) })
    if (locked) {
      all(this.root(), '.choice-slot').forEach((slot, i) => {
        this.animate(slot, [
          { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
          { opacity: .75, transform: 'translate3d(0,0,0) scale(.974)' },
          { opacity: .84, transform: 'translate3d(0,0,0) scale(.98)' },
        ], { duration: 730, delay: (keepCards ? 90 : 960) + i * 42 })
      })
      this.impact(keepCards ? 160 : 1030, 'small')
    }
  }
  private countdown(data: TadazzV4Data) {
    const keepCards = Boolean(data.cardsAlreadyOnStage)
    if (!keepCards) {
      this.questionMotion(0)
      this.cardsMotion(75)
    }
    const wrap = query(this.root(), '.countdown-floater')
    const label = query(this.root(), '.countdown-label')
    const ring = query<SVGCircleElement>(this.root(), '.countdown-ring .timer-progress')
    const value = query(this.root(), '.countdown-value')
    const circumference = 2 * Math.PI * 73
    if (ring) {
      ring.style.strokeDasharray = String(circumference)
      ring.style.strokeDashoffset = '0'
    }
    this.animate(wrap, [
      { opacity: 0, transform: 'translate3d(-790px,305px,0) scale(2.55)', offset: 0 },
      { opacity: 1, transform: 'translate3d(-790px,305px,0) scale(2.55)', offset: .14 },
      { opacity: 1, transform: 'translate3d(-300px,125px,0) scale(1.48)', offset: .61 },
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', offset: 1 },
    ], { duration: 1120, easing: 'cubic-bezier(.15,.78,.24,1)' })
    this.animate(label, [{ opacity: 0 }, { opacity: 1 }], { duration: 550, delay: 720 })
    const rawSeconds = data.remainingSeconds ?? data.seconds ?? 0
    const totalSeconds = Math.max(0, Number(rawSeconds) || 0)
    const duration = Math.max(1, totalSeconds * 1000)
    const sweep = this.animate(ring, [{ strokeDashoffset: 0 }, { strokeDashoffset: circumference }], { duration, easing: 'linear' })
    if (value) {
      this.finalizers.push(() => {
        value.textContent = '00'
        value.classList.add('timer-low')
      })
    }
    const token = this.token
    const tick = () => {
      if (token !== this.token || !value || !sweep) return
      // Use WAAPI as one pause-safe time source; no divergent setInterval stopwatch.
      const progress = Number(sweep.effect?.getComputedTiming().progress ?? 0)
      const left = Math.max(0, Math.ceil(totalSeconds * (1 - progress)))
      value.textContent = String(left).padStart(2, '0')
      value.classList.toggle('timer-low', left <= 3)
      if (sweep.playState !== 'finished') this.tick(tick)
    }
    tick()
    this.cue('countdown-ended', duration)
  }
  private chosen(data: TadazzV4Data) {
    const keepCards = Boolean(data.cardsAlreadyOnStage)
    if (!keepCards) {
      this.questionMotion(40)
      this.cardsMotion(230)
    }
    const status = query(this.root(), '.vote-status')
    this.animate(status, [
      { opacity: 0, transform: 'translate(-50%,70px) scale(.84)' },
      { opacity: 1, transform: 'translate(-50%,0) scale(1)' },
    ], { duration: 760, delay: keepCards ? 180 : 1480 })
    const chosenSet = new Set<number>(
      Array.isArray(data.selectedIndices) && data.selectedIndices.length > 0
        ? data.selectedIndices
        : typeof data.selectedIndex === 'number' && data.selectedIndex >= 0
          ? [data.selectedIndex]
          : [],
    )
    all(this.root(), '.choice-slot').forEach((slot, i) => {
      if (chosenSet.has(i)) {
        slot.classList.add('is-selected')
        this.animate(slot, [
          { transform: 'translate3d(0,0,0) scale(1)' },
          { transform: 'translate3d(0,-42px,0) scale(1.115)', offset: .65 },
          { transform: 'translate3d(0,-32px,0) scale(1.09)' },
        ], { duration: 890, delay: keepCards ? 80 : 1380 })
      } else {
        this.animate(slot, [
          { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
          { opacity: .38, transform: 'translate3d(0,13px,0) scale(.94)' },
        ], { duration: 850, delay: keepCards ? 50 : 1350 })
      }
    })
    if (chosenSet.size > 0) this.impact(keepCards ? 270 : 1570, 'small')
  }
  private results(data: TadazzV4Data) {
    const keepCards = Boolean(data.cardsAlreadyOnStage)
    if (!keepCards) {
      this.questionMotion(40)
      this.cardsMotion(185)
    }
    const cards = all(this.root(), '.choice-slot')
    const percentages = percentagesFor(data, cards.length)
    const winners = topIndicesFor(data, cards.length)
    const showPercentages = data.showPercentages !== false
    const animated: Array<{ node: HTMLElement; target: number; animation: Animation }> = []
    const baseDelay = keepCards ? 150 : 1400
    const winnerTagDelay = keepCards ? 1400 : 2650
    const winnerLiftDelay = keepCards ? 1310 : 2560
    cards.forEach((slot, i) => {
      if (keepCards) {
        this.animate(slot, [
          { opacity: .84, transform: 'translate3d(0,0,0) scale(.98)' },
          { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
        ], { duration: 320, delay: 0 })
      }
      const number = query<HTMLElement>(slot, '.result-percentage')
      const track = query(slot, '.result-track')
      const fill = query(slot, '.result-track-fill')
      if (number) { number.textContent = '0%'; number.style.visibility = showPercentages ? 'visible' : 'hidden' }
      const delay = baseDelay + i * 80
      this.animate(number, [
        { opacity: 0, transform: 'translate3d(0,24px,0) scale(.8)' },
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
      ], { duration: 560, delay })
      this.animate(track, [{ opacity: 0 }, { opacity: 1 }], { duration: 480, delay: Math.max(0, delay - 100) })
      const fillAnimation = this.animate(fill, [
        { transform: 'scaleX(0)' },
        { transform: `scaleX(${Math.max(.003, percentages[i] / 100)})` },
      ], { duration: 1070, delay: delay + 80, easing: 'cubic-bezier(.2,.85,.18,1)' })
      if (showPercentages && number && fillAnimation) {
        const target = Math.round(percentages[i])
        animated.push({ node: number, target, animation: fillAnimation })
        this.finalizers.push(() => { number.textContent = `${target}%` })
      }
      if (winners.includes(i)) {
        slot.classList.add('is-favourite')
        this.animate(query(slot, '.winner-tag'), [
          { opacity: 0, transform: 'translateY(-14px) scale(.9)' },
          { opacity: 1, transform: 'none' },
        ], { duration: 680, delay: winnerTagDelay })
        this.animate(slot, [
          { transform: 'translate3d(0,0,0) scale(1)' },
          { transform: 'translate3d(0,-17px,0) scale(1.027)', offset: .68 },
          { transform: 'translate3d(0,-9px,0) scale(1.016)' },
        ], { duration: 730, delay: winnerLiftDelay, easing: V4_EASE_DRAMATIC })
      }
    })
    const token = this.token
    const tick = () => {
      if (token !== this.token) return
      let running = false
      for (const item of animated) {
        const progress = ease(Number(item.animation.effect?.getComputedTiming().progress ?? 0))
        item.node.textContent = `${Math.round(item.target * progress)}%`
        if (item.animation.playState !== 'finished') running = true
      }
      if (running) this.tick(tick)
    }
    if (animated.length) tick()
    this.cue('survey-reveal', keepCards ? 200 : 1450)
  }
  private topPick(data: TadazzV4Data) {
    const root = this.root()
    this.animate(query(root, '.spotlight-top'), [
      { opacity: 0, transform: 'translateY(-30px)' }, { opacity: 1, transform: 'none' },
    ], { duration: 840, delay: 400 })
    this.animate(query(root, '.spotlight-plate'), [
      { opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1.05)' },
    ], { duration: 1400 })
    this.animate(query(root, '.spotlight-portrait'), [
      { opacity: 0, transform: 'translateY(160px) rotate(-8deg) scale(.58)' },
      { opacity: 1, transform: 'translateY(-24px) rotate(2deg) scale(1.06)', offset: .83 },
      { opacity: 1, transform: 'translateY(0) rotate(0deg) scale(1)' },
    ], { duration: 1490, easing: V4_EASE_DRAMATIC })
    this.animate(query(root, '.spotlight-name'), [
      { opacity: 0, transform: 'translateY(80px) scale(.87)' }, { opacity: 1, transform: 'none' },
    ], { duration: 1040, delay: 540 })
    const hasWinner = (data.topIndex != null || topIndicesFor(data, data.answers?.length ?? 0).length === 1)
    if (hasWinner) this.impact(690, 'big')
  }
  private questionImage() {
    const root = this.root()
    all(root, '.photo-option').forEach((option, i) => this.animate(option, [
      { opacity: 0, transform: 'translate3d(75px,35px,0)' }, { opacity: 1, transform: 'none' },
    ], { duration: 850, delay: 740 + i * 90 }))
    this.animate(query(root, '.photo-question-img'), [
      { opacity: 0, transform: 'translate3d(-130px,85px,0) scale(.78) rotate(-5deg)' }, { opacity: 1, transform: 'none' },
    ], { duration: 1370 })
    this.animate(query(root, '.photo-question-panel'), [
      { opacity: 0, transform: 'translate3d(120px,0,0) scale(.94)' }, { opacity: 1, transform: 'none' },
    ], { duration: 1200, delay: 270 })
  }
  private leaderboard() {
    const root = this.root()
    this.animate(query(root, '.leader-head'), [
      { opacity: 0, transform: 'translateY(60px)' }, { opacity: 1, transform: 'none' },
    ], { duration: 880 })
    all(root, '.team-row').forEach((row, i) => this.animate(row, [
      { opacity: 0, transform: 'translate3d(-190px,45px,0) scale(.96)' }, { opacity: 1, transform: 'none' },
    ], { duration: 1100, delay: 270 + i * 180 }))
  }
  private recap() {
    const root = this.root()
    this.animate(query(root, '.story-connection'), [
      { opacity: 0, transform: 'scaleX(.06)' }, { opacity: .82, transform: 'scaleX(1)' },
    ], { duration: 1650, delay: 970 })
    all(root, '.choice-slot').forEach((slot, i) => this.animate(slot, [
      { opacity: 0, transform: `translate3d(${(i - 2) * -45}px,145px,0) rotate(${(i - 2) * -4}deg) scale(.72)` },
      { opacity: 1, transform: 'translate3d(0,-10px,0) rotate(0deg) scale(1.02)', offset: .85 },
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
    ], { duration: 1230, delay: 180 + i * 140, easing: V4_EASE_DRAMATIC }))
    this.animate(query(root, '.story-finale'), [
      { opacity: 0, transform: 'translate3d(0,70px,0) scale(.88)' },
      { opacity: 1, transform: 'translate3d(0,-8px,0) scale(1.03)', offset: .76 },
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
    ], { duration: 1240, delay: 1450, easing: V4_EASE_DRAMATIC })
    this.cue('story-begin', 1800)
  }
  private interlude() {
    const root = this.root()
    this.animate(query(root, '.interlude-ray'), [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.25)' },
    ], { duration: 1500 })
    this.animate(query(root, '.interlude-mini'), [
      { opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' },
    ], { duration: 950, delay: 380 })
    this.animate(query(root, '.interlude-title'), [
      { opacity: 0, transform: 'translateY(110px) scale(.7)' },
      { opacity: 1, transform: 'translateY(-15px) scale(1.035)', offset: .8 },
      { opacity: 1, transform: 'none' },
    ], { duration: 1310, delay: 220, easing: V4_EASE_DRAMATIC })
    this.animate(query(root, '.interlude-rule'), [
      { opacity: 0, transform: 'scaleX(.03)' }, { opacity: 1, transform: 'scaleX(1)' },
    ], { duration: 980, delay: 660 })
    this.impact(400, 'small')
  }
  private zWipe() {
    const root = this.root()
    this.animate(query(root, '.wipe:not(.second)'), [
      { opacity: 0, transform: 'translateX(-2000px) skewX(-22deg)' },
      { opacity: 1, transform: 'translateX(700px) skewX(-22deg)', offset: .38 },
      { opacity: .85, transform: 'translateX(2450px) skewX(-22deg)' },
    ], { duration: 1490, easing: 'cubic-bezier(.55,0,.22,1)' })
    this.animate(query(root, '.wipe.second'), [
      { opacity: 0, transform: 'translateX(2500px) skewX(21deg)' },
      { opacity: 1, transform: 'translateX(600px) skewX(21deg)', offset: .55 },
      { opacity: 0, transform: 'translateX(-2000px) skewX(21deg)' },
    ], { duration: 1570, delay: 160, easing: 'cubic-bezier(.55,0,.22,1)' })
    this.impact(680, 'small')
    this.cue('wipe-covered', 720, () => this.config.onWipeCovered?.())
  }
  play(scene: TadazzV4Scene, data: TadazzV4Data): Promise<boolean> {
    this.stop()
    this.scene = scene
    this.cue(`scene:${scene}`)
    const token = this.token
    const root = this.root()
    switch (scene) {
      case 'question':
        this.questionMotion(100)
        this.animate(query(root, '.rail.top'), [{opacity:0,transform:'scaleX(.1)'},{opacity:.8,transform:'scaleX(1)'}], {duration:1300,delay:250})
        this.animate(query(root, '.hud-focus'), [{opacity:0,transform:'translateY(30px)'},{opacity:1,transform:'none'}], {duration:850,delay:820})
        break
      case 'picture-answers': this.questionMotion(70); this.cardsMotion(370); break
      case 'voting-open': this.voting(false, data); break
      case 'countdown': this.countdown(data); break
      case 'vote-locked': this.voting(true, data); break
      case 'chosen': this.chosen(data); break
      case 'survey-results': this.results(data); break
      case 'top-pick': this.topPick(data); break
      case 'question-image': this.questionImage(); break
      case 'leaderboard': this.leaderboard(); break
      case 'round-recap': this.recap(); break
      case 'interlude': this.interlude(); break
      case 'z-wipe': this.zWipe(); break
      case 'company-opening': case 'grand-opening': case 'representative-directory':
      case 'phone-instructions': case 'connection-readiness': case 'round-one':
      case 'story-progress': case 'tie-break': case 'story-assembly':
      case 'story-live': case 'round-two': case 'grand-finale': break
    }
    return Promise.allSettled(this.active.map(a => a.finished)).then(() => token === this.token)
  }
  dispose() { this.stop() }
}
