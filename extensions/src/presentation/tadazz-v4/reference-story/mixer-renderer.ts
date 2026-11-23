// @ts-nocheck -- supplied deterministic canvas choreography; no demo runtime.
// Scoped DOM refs are created by React. This module only paints those refs.
export function createMixerRenderer(root: HTMLElement) {
  const $ = (id) => root.querySelector("#" + id)
  const theater = $("theater"),
    canvas = $("magicLayer"),
    ctx = canvas.getContext("2d")
  const clock = $("timerDigits"),
    fill = $("timerTrackFill"),
    knob = $("timerKnob")
  const title = $("heroTitle"),
    number = $("countdownBig"),
    finish = $("finishMessage"),
    whiteout = $("whiteout")
  const cardEls = [...root.querySelectorAll(".card-col")].map((col) => ({
    col,
    shell: col.querySelector(".card-shell"),
    flash: col.querySelector(".photo-flash"),
  }))
  const flyerEls = [...root.querySelectorAll(".flyer")]
  const center = (i) => ({ x: 217.2 + i * 291.4, y: 370 })
  const total = 60
  let visibleTime = 0
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
  const mix = (a, b, u) => a + (b - a) * u
  const smooth = (u) => {
    u = clamp(u)
    return u * u * (3 - 2 * u)
  }
  const easeBack = (u) => {
    u = clamp(u)
    const k = 1.7
    return 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2
  }
  const wave = (u, ph = 0) => Math.sin(u * Math.PI * 2 + ph)
  const mathEase = (a, b, t) => smooth((t - a) / (b - a))
  const fract = (n) => n - Math.floor(n)
  const rand = (n) => fract(Math.sin(n * 127.1 + 78.233) * 43758.5453123)
  function escapePosition(i, sec) {
    const launch = 8 + i * 2.38,
      u = (sec - launch) / 3.08
    if (u < 0 || u > 1) return null
    const p = center(i),
      q = Math.sin(Math.PI * clamp(u)),
      dir = i % 2 ? 1 : -1
    return {
      x: p.x + dir * q * (210 + i * 14) + 75 * Math.sin(u * Math.PI * 2),
      y: p.y - q * (202 + 24 * (i % 3)) - 26 * Math.sin(u * Math.PI * 3),
      size: 0.22 + 1.0 * q,
      rot: dir * (45 * q + 250 * u),
      tilt: dir * 25 * q,
      alpha: clamp(u * 9) * clamp((1 - u) * 8),
      glow: q,
    }
  }
  function mischiefPosition(i, sec) {
    if (sec < 20 || sec >= 35) return null
    const u = sec - 20,
      phase = (i * Math.PI * 2) / 5
    const grow = Math.min(1, Math.max(0, (u - i * 0.14) / 1.2))
    const vanish = Math.min(1, Math.max(0, (35 - sec) / 1.3))
    const x =
      800 + 480 * Math.sin(u * 0.68 + phase) + 70 * Math.sin(u * 1.45 + phase)
    const y =
      396 + 153 * Math.sin(u * 1.08 + phase * 1.4) + 19 * Math.cos(u * 2.1 + i)
    return {
      x: mix(center(i).x, x, smooth(grow)),
      y: mix(center(i).y, y, smooth(grow)),
      size:
        (0.68 +
          0.22 * Math.sin(u * 1.1 + phase) +
          0.18 * Math.cos(u * 2.4 + phase)) *
        grow,
      rot: 25 * Math.sin(u * 0.97 + phase) + 14 * Math.cos(u * 2.7 + phase),
      tilt: 40 * Math.sin(u * 1.5 + phase),
      alpha: grow * vanish,
      glow: 1,
    }
  }
  function orbitPosition(i, sec) {
    const phi = ((sec - 35) * Math.PI * 2) / 5.6 + (i * Math.PI * 2) / 5
    const depth = (Math.sin(phi) + 1) / 2
    return {
      x: 800 + 505 * Math.cos(phi),
      y: 411 + 148 * Math.sin(phi),
      size: 0.7 + 0.4 * depth,
      rot: 13 * Math.sin(phi * 2) + 26 * Math.cos(phi * 0.7),
      tilt: 24 * Math.cos(phi),
      alpha: 1,
      glow: 0.6 + depth * 0.4,
      depth,
    }
  }
  function tornadoPosition(i, sec) {
    if (sec < 35 || sec >= 48) return null
    const ready = mathEase(35, 36.3, sec)
    const v = orbitPosition(i, sec)
    if (ready < 1) {
      const m = mischiefPosition(i, 34.999) || { ...v }
      v.x = mix(m.x, v.x, ready)
      v.y = mix(m.y, v.y, ready)
      v.size = mix(m.size, v.size, ready)
    }
    return v
  }
  function returnPosition(i, sec) {
    if (sec < 48 || sec > 55) return null
    const launch = 48 + i * 0.49
    const u = (sec - launch) / 4.45
    if (u < 0) return orbitPosition(i, 48)
    if (u > 1) return null
    const from = orbitPosition(i, 48),
      to = center(i),
      v = easeBack(u)
    return {
      x: mix(from.x, to.x, clamp(v)),
      y: mix(from.y, to.y, clamp(v)) - Math.sin(Math.PI * u) * 115,
      size: mix(from.size, 0.2, clamp(u)),
      rot: from.rot + 720 * u * (i % 2 ? -1 : 1),
      tilt: from.tilt * (1 - u),
      alpha: clamp((1 - u) * 6),
      glow: 1,
    }
  }
  function performer(i, sec) {
    if (sec < 8) return null
    if (sec < 20) return escapePosition(i, sec)
    if (sec < 35) return mischiefPosition(i, sec)
    if (sec < 48) return tornadoPosition(i, sec)
    if (sec < 55) return returnPosition(i, sec)
    return null
  }
  function cardAnimation(i, sec) {
    let y = 0,
      scale = 1,
      angle = 0,
      glow = 0,
      flash = 0,
      opacity = 1
    // Every card gets a different, physical bounce in the opening sequence.
    const intro = (sec - 0.32 - i * 0.55) / 1.15
    if (intro < 1) {
      opacity = clamp(intro * 4)
      y = (easeBack(intro) - 1) * -115
      scale = 0.78 + 0.22 * easeBack(intro)
      angle = (1 - clamp(intro)) * (i % 2 ? -9 : 9)
      glow = clamp(intro * 0.8)
    }
    if (sec >= 8 && sec < 20) {
      const d = Math.abs(sec - (8 + i * 2.38 + 1.35))
      glow = Math.max(glow, clamp(1 - d / 1.4))
      scale += 0.07 * Math.exp(-d * d * 2)
    }
    if (sec >= 20 && sec < 35) {
      angle += 2.8 * Math.sin((sec - 20) * 1.3 + i * 1.2)
      y -= 6 * Math.sin((sec - 20) * 1.7 + i)
      glow = 0.2 + 0.22 * Math.sin(sec * 2 + i) ** 2
    }
    if (sec >= 35 && sec < 48) {
      angle += 2.3 * Math.sin(sec * 1.8 + i)
      scale += 0.015 * Math.sin(sec * 3 + i)
      glow = 0.45 + (0.35 * (Math.sin(sec * 2.1 + i) + 1)) / 2
    }
    if (sec >= 48 && sec < 55) {
      const landing = 48 + i * 0.49 + 4.45
      const d = sec - landing
      if (d >= 0 && d < 1.2) {
        const impact = Math.exp(-d * 4)
        scale += 0.15 * impact * Math.abs(Math.cos(d * 17))
        y -= 22 * impact * Math.abs(Math.sin(d * 15))
        glow = impact
        flash = impact
      }
    }
    if (sec >= 55 && sec < 60) {
      const active = Math.floor(sec - 55) % 5
      const u = fract(sec)
      glow = i === active ? 1 : 0.12
      scale +=
        i === active
          ? 0.08 * Math.sin(Math.PI * clamp(u))
          : 0.006 * Math.sin(sec * 7 + i)
      angle += i === active ? 4 * Math.sin(u * 12) * Math.exp(-u * 3) : 0
      flash = i === active ? Math.exp(-u * 7) : 0
    }
    if (sec >= 60) {
      glow = 0.4 + 0.2 * Math.sin(sec * 2 + i)
      scale = 1
      angle = 0
      y = 0
      opacity = 1
    }
    return { y, scale, angle, glow, flash, opacity }
  }
  function paintCards(sec) {
    for (let i = 0; i < 5; i++) {
      const { col, shell, flash } = cardEls[i]
      const a = cardAnimation(i, sec)
      col.style.opacity = String(a.opacity)
      col.style.transform = `translate3d(0,${a.y.toFixed(2)}px,0) rotate(${a.angle.toFixed(2)}deg) scale(${a.scale.toFixed(3)})`
      col.style.setProperty("--shadow", (1 / a.scale).toFixed(2))
      shell.style.setProperty("--glow", String(a.glow))
      flash.style.setProperty("--flash", String(a.flash))
      const v = performer(i, sec)
      const clone = flyerEls[i]
      if (!v || v.alpha < 0.01) {
        clone.style.opacity = "0"
        continue
      }
      clone.style.opacity = String(v.alpha)
      clone.style.zIndex = String(10 + Math.floor((v.depth ?? v.y / 900) * 10))
      clone.style.transform = `translate3d(${(v.x - 108).toFixed(2)}px,${(v.y - 108).toFixed(2)}px,0) rotateZ(${v.rot.toFixed(2)}deg) rotateY(${v.tilt.toFixed(2)}deg) scale(${Math.max(0.01, v.size).toFixed(3)})`
    }
  }
  const sparkleSources = Array.from({ length: 84 }, (_, i) => ({
    x: 60 + rand(i + 11) * 1480,
    y: 215 + rand(i + 87) * 433,
    r: 1 + rand(i + 151) * 2.2,
    p: rand(i + 230) * 6.28,
    speed: 0.5 + rand(i + 370) * 1.6,
  }))
  function star(x, y, r, a, col = "#ffe77f") {
    if (a <= 0) return
    ctx.save()
    ctx.globalAlpha = clamp(a)
    ctx.translate(x, y)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = col
    ctx.shadowColor = col
    ctx.shadowBlur = r * 4
    ctx.fillRect(-r / 2, -r * 3.2, r, r * 6.4)
    ctx.fillRect(-r * 3.2, -r / 2, r * 6.4, r)
    ctx.restore()
  }
  function emitSparkBurst(x, y, sec, eventTime, seed, energy = 1) {
    const age = sec - eventTime
    if (age < 0 || age > 1.2) return
    const q = age / 1.2
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rand(seed + i) * 0.6
      const d = (22 + rand(seed + 30 + i) * 175) * q * energy
      const xx = x + Math.cos(a) * d,
        yy = y + Math.sin(a) * d + q * q * 40
      const r = (1 + rand(seed + 70 + i) * 3) * (1 - q)
      star(
        xx,
        yy,
        r,
        (1 - q) ** 0.7,
        i % 3 === 0 ? "#21b7ff" : i % 2 === 0 ? "#f8ff57" : "#f557ff",
      )
    }
  }
  function stageRays(sec) {
    if (sec < 8) return
    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    const peaks = [280, 480, 790, 1090, 1320]
    for (let i = 0; i < 5; i++) {
      const drift = 95 * Math.sin(sec * 0.53 + i * 1.3),
        ex = peaks[i] + drift
      const ray = ctx.createLinearGradient(ex, 40, ex + drift * 1.7, 680)
      ray.addColorStop(0, i % 2 ? "#8b32ef16" : "#18afff18")
      ray.addColorStop(0.45, i % 2 ? "#d338f80b" : "#3bd7ff08")
      ray.addColorStop(1, "#ffffff00")
      ctx.fillStyle = ray
      ctx.beginPath()
      ctx.moveTo(peaks[i], 58)
      ctx.lineTo(ex - 100, 690)
      ctx.lineTo(ex + 140, 690)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }
  function lineArc(a, b, sec, offset = 0) {
    ctx.save()
    const v = 0.5 + 0.5 * Math.sin(sec * 4 + offset)
    const mid = (a.x + b.x) / 2
    const cp = { x: mid, y: Math.min(a.y, b.y) - 80 - 40 * v }
    ctx.globalCompositeOperation = "lighter"
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.quadraticCurveTo(cp.x, cp.y, b.x, b.y)
    ctx.strokeStyle = `rgba(222,68,251,${0.2 + 0.25 * v})`
    ctx.lineWidth = 6
    ctx.shadowBlur = 20
    ctx.shadowColor = "#dd38ff"
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.quadraticCurveTo(cp.x, cp.y, b.x, b.y)
    ctx.strokeStyle = `rgba(238,255,67,${0.3 + 0.3 * v})`
    ctx.lineWidth = 2
    ctx.shadowBlur = 12
    ctx.shadowColor = "#eaff36"
    ctx.stroke()
    const u = fract(sec * 0.4 + offset * 0.19),
      x = (1 - u) ** 2 * a.x + 2 * (1 - u) * u * cp.x + u * u * b.x,
      y = (1 - u) ** 2 * a.y + 2 * (1 - u) * u * cp.y + u * u * b.y
    star(x, y, 5, 1, "#f4ff49")
    ctx.restore()
  }
  function drawTrail(i, sec) {
    if (sec < 8 || sec > 55) return
    const current = performer(i, sec)
    if (!current || current.alpha <= 0.02) return
    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    const palette = ["#dc34ff", "#1de1ff", "#f5f342", "#ffab35", "#ff54ce"]
    for (let band = 0; band < 2; band++) {
      ctx.beginPath()
      let path = false
      for (let j = 0; j < 29; j++) {
        const past = performer(i, sec - j * 0.035)
        if (!past) break
        if (!path) {
          ctx.moveTo(past.x, past.y)
          path = true
        } else ctx.lineTo(past.x, past.y)
      }
      if (path) {
        ctx.strokeStyle = palette[i]
        ctx.lineWidth = band === 0 ? 21 : 5
        ctx.globalAlpha = (band === 0 ? 0.13 : 0.52) * current.alpha
        ctx.shadowColor = palette[i]
        ctx.shadowBlur = band === 0 ? 24 : 16
        ctx.lineCap = "round"
        ctx.stroke()
      }
    }
    ctx.restore()
    star(
      current.x,
      current.y,
      4 + 5 * current.glow,
      current.alpha * 0.76,
      ["#f24fff", "#3bd7ff", "#eaff35", "#ffc75c", "#f24fff"][i],
    )
  }
  function drawVortex(sec) {
    if (sec < 35 || sec >= 48) return
    const intro = mathEase(35, 36.5, sec),
      outro = 1 - mathEase(46.5, 48, sec),
      opacity = intro * outro
    ctx.save()
    ctx.translate(800, 411)
    ctx.rotate((sec - 35) * 0.23)
    ctx.globalCompositeOperation = "lighter"
    for (let k = 0; k < 3; k++) {
      ctx.beginPath()
      ctx.ellipse(0, 0, 490 + k * 18, 155 + k * 18, 0, 0, Math.PI * 2)
      ctx.strokeStyle = ["#f53cff", "#f1ff3b", "#16afff"][k]
      ctx.lineWidth = k === 0 ? 5 : 2
      ctx.globalAlpha = (0.3 - k * 0.04) * opacity
      ctx.shadowColor = ["#f24eff", "#ebff35", "#17dfff"][k]
      ctx.shadowBlur = 20
      ctx.stroke()
    }
    for (let j = 0; j < 64; j++) {
      const p = (j * Math.PI * 2) / 64 + (sec - 35) * 1.16
      const r = 482 + 10 * Math.sin(j * 3.7 + sec)
      const x = r * Math.cos(p),
        y = r * 0.31 * Math.sin(p)
      star(
        x,
        y,
        j % 9 === 0 ? 4 : 1.7,
        (0.3 + 0.5 * Math.sin(j + sec) ** 2) * opacity,
        j % 3 === 0 ? "#efff42" : "#bb45ff",
      )
    }
    ctx.restore()
  }
  function shockwave(sec) {
    const beat = Math.floor(sec * 2),
      u = fract(sec * 2)
    if (sec < 5 || sec >= 60 || beat % 2 === 1) return
    const big = sec >= 55
    const centerY = big ? 432 : 525
    ctx.save()
    ctx.globalAlpha = (1 - u) * (0.55 + (big ? 0.4 : 0))
    ctx.beginPath()
    ctx.ellipse(
      800,
      centerY,
      50 + u * (big ? 750 : 450),
      15 + u * (big ? 230 : 120),
      0,
      0,
      Math.PI * 2,
    )
    ctx.strokeStyle = big ? "#eeff3c" : "#c64bff"
    ctx.lineWidth = (big ? 9 : 5) * (1 - u) + 1
    ctx.shadowColor = big ? "#effe26" : "#cf3bff"
    ctx.shadowBlur = 22
    ctx.stroke()
    ctx.restore()
  }
  function drawMagic(sec) {
    ctx.clearRect(0, 0, 1600, 900)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, 1600, 900)
    ctx.clip()
    stageRays(sec)
    sparkleSources.forEach((s, i) => {
      let gl = 0.23 + 0.55 * Math.sin(sec * s.speed + s.p) ** 2
      const yy = s.y + 9 * Math.sin(sec * 0.55 + i)
      star(
        s.x,
        yy,
        s.r,
        gl,
        i % 3 === 0 ? "#a0edff" : i % 3 === 1 ? "#e976ff" : "#ffde64",
      )
    })
    if (sec >= 8 && sec < 20)
      for (let i = 0; i < 5; i++) {
        const launch = 8 + i * 2.38
        if (sec >= launch && sec < launch + 1.2)
          emitSparkBurst(
            center(i).x,
            center(i).y,
            sec,
            launch,
            1400 + i * 15,
            0.8,
          )
      }
    if (sec >= 20 && sec < 35) {
      for (let i = 0; i < 4; i++) lineArc(center(i), center(i + 1), sec, i)
      ;[21, 24, 27, 30, 33].forEach((q, i) =>
        emitSparkBurst(
          800 + 220 * Math.sin(i * 2),
          410 + 65 * Math.cos(i),
          sec,
          q,
          200 + i * 37,
          1.1,
        ),
      )
    }
    if (sec >= 35 && sec < 48) drawVortex(sec)
    if (sec >= 48 && sec < 55) {
      for (let i = 0; i < 5; i++)
        emitSparkBurst(
          center(i).x,
          center(i).y,
          sec,
          48 + i * 0.49 + 4.45,
          400 + i * 23,
          1.25,
        )
      for (let i = 0; i < 4; i++) lineArc(center(i), center(i + 1), sec, i)
    }
    for (let i = 0; i < 5; i++) drawTrail(i, sec)
    if (sec >= 55 && sec < 60) {
      for (let k = 55; k < 60; k++) {
        const i = k - 55
        emitSparkBurst(center(i).x, center(i).y, sec, k, 600 + i * 43, 1.35)
      }
    }
    if (sec >= 60) {
      for (let i = 0; i < 5; i++)
        emitSparkBurst(center(i).x, center(i).y, sec, 60, 130 + i * 13, 1.2)
    }
    shockwave(sec)
    ctx.restore()
  }
  function timerText(seconds) {
    const n = Math.max(0, Math.ceil(seconds))
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`
  }
  function render(tt: number, reduced = false) {
    const remaining = total - tt
    let scene = tt
    // Extensions loop the spectacular middle rather than stopping the animation before the host is ready.
    if (total > 60 && remaining > 5 && tt >= 55) scene = 35 + ((tt - 55) % 13)
    if (remaining <= 5 && tt >= 55) scene = 55 + (5 - Math.max(0, remaining))
    scene = Math.min(scene, 60)
    visibleTime = scene
    paintCards(reduced ? 60 : scene)
    drawMagic(reduced ? 0 : scene)
    clock.textContent = timerText(remaining)
    const pc = clamp(remaining / total)
    fill.style.transform = `scaleX(${pc})`
    knob.style.left = `${pc * 100}%`
    title.style.transform = `scale(${(1 + 0.016 * Math.sin(scene * 2.2) + (scene < 2 ? 0.06 * (1 - mathEase(0, 2, scene)) : 0)).toFixed(3)})`
    clock.style.transform = `scale(${(1 + 0.035 * Math.sin(scene * 2 * Math.PI) + (remaining <= 5 ? 0.07 * Math.abs(Math.sin(scene * 2 * Math.PI)) : 0)).toFixed(3)})`
    clock.style.color =
      remaining <= 10 && Math.floor(scene * 2) % 2 ? "#fffdea" : "#eaff28"
    if (reduced) {
      title.style.transform = "none"
      clock.style.transform = "none"
    }
    theater.style.setProperty(
      "--vortex-opacity",
      String(scene >= 35 && scene < 48 ? 0.65 : 0),
    )
    if (remaining > 0 && remaining <= 5) {
      number.style.opacity = String(0.95)
      number.textContent = String(Math.ceil(remaining))
      const fraction = fract(5 - remaining)
      number.style.transform = `scale(${(1.5 - 0.5 * smooth(fraction)).toFixed(3)}) rotate(${(6 * Math.sin(fraction * 8) * (1 - fraction)).toFixed(3)}deg)`
    } else {
      number.style.opacity = "0"
      number.textContent = ""
    }
    const done = remaining <= 0
    finish.style.opacity = done ? "1" : "0"
    finish.style.transform = done ? "scale(1)" : "scale(.4)"
    const firstFrame = tt >= total && tt < total + 0.34
    whiteout.style.opacity = firstFrame
      ? String((1 - (tt - total) / 0.34) * 0.55)
      : "0"
  }
  return render
}
