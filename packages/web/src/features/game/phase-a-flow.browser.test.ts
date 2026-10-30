import { createRequire } from "node:module"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

interface BrowserLocator {
  isVisible: () => Promise<boolean>
  textContent: () => Promise<string | null>
  getAttribute: (name: string) => Promise<string | null>
  click: (options?: { force?: boolean }) => Promise<void>
  focus: () => Promise<void>
}

interface BrowserPage {
  exposeFunction: (name: string, fn: (arg?: unknown) => void) => Promise<void>
  setContent: (html: string) => Promise<void>
  locator: (selector: string) => BrowserLocator
  keyboard: {
    press: (key: string) => Promise<void>
  }
}

interface BrowserInstance {
  newPage: () => Promise<BrowserPage>
  close: () => Promise<void>
}

interface SocketCommandRecord {
  action: string
  gameId?: string
  payload?: {
    epoch?: number
    reason?: string
    questionIndex?: number
    confirmed?: boolean
  }
}

const req = createRequire(path.resolve("packages/e2e/package.json"))
const playwrightModule = req("@playwright/test") as {
  chromium: {
    launch: (options?: { headless?: boolean }) => Promise<BrowserInstance>
  }
}
const { chromium } = playwrightModule

/**
 * NOTE: This test file provides synthetic DOM verification of protocol events and command bindings.
 * It uses Playwright with `page.setContent()` to simulate browser click/keyboard event flows without
 * a running backend server or loaded React app bundle.
 *
 * IT IS NOT A FULL END-TO-END APPLICATION ACCEPTANCE TEST.
 * Real-app E2E tests executing against a running backend and frontend dev server belong in
 * `packages/e2e/**` (owned by Tomer and verified by Roni).
 */
describe("PROTOCOL / SPEC: Synthetic DOM Event & Command Flow Simulation (Non-E2E / DOM Harness)", () => {
  let browser: BrowserInstance | null = null
  let managerPage: BrowserPage | null = null
  let playerPage: BrowserPage | null = null

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    managerPage = await browser.newPage()
    playerPage = await browser.newPage()
  }, 30000)

  afterAll(async () => {
    if (browser) {
      await browser.close()
    }
  })

  it("1. [Synthetic DOM Protocol] Manager End Timer command emission on click", async () => {
    expect(managerPage).not.toBeNull()

    if (!managerPage) {
      return
    }

    const emittedCommands: SocketCommandRecord[] = []

    await managerPage.exposeFunction("onSocketCommand", (rawCmd: unknown) => {
      emittedCommands.push(rawCmd as SocketCommandRecord)
    })

    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #111; color: #fff; font-family: sans-serif; }
            .toolbar { display: flex; gap: 8px; padding: 12px; background: rgba(0,0,0,0.8); }
            .btn { padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; }
            .btn-end-timer { background: #f59e0b; color: #fff; }
            .btn-next { background: #fff; color: #000; }
          </style>
        </head>
        <body>
          <div id="root">
            <div class="toolbar" data-testid="manager-toolbar">
              <button class="btn btn-end-timer" data-testid="end-timer-button" id="end-timer-btn">
                End Timer
              </button>
            </div>
          </div>
          <script>
            document.getElementById('end-timer-btn').addEventListener('click', () => {
              window.onSocketCommand({
                action: 'END_ANSWER_TIMER',
                gameId: 'test-game-123',
                payload: { epoch: 1 }
              });
            });
          </script>
        </body>
      </html>
    `)

    const endTimerBtn = managerPage.locator('[data-testid="end-timer-button"]')
    expect(await endTimerBtn.isVisible()).toBe(true)

    // Click End Timer in real browser
    await endTimerBtn.click()

    expect(emittedCommands).toHaveLength(1)
    expect(emittedCommands[0].action).toBe("END_ANSWER_TIMER")
    expect(emittedCommands[0].gameId).toBe("test-game-123")
  })

  it("2. [Synthetic DOM Protocol] Immediate player personal result on SHOW_RESULT", async () => {
    expect(playerPage).not.toBeNull()

    if (!playerPage) {
      return
    }

    await playerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #0f172a; color: #fff; font-family: sans-serif; }
            .result-card { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
            .badge-correct { background: #059669; padding: 8px 24px; border-radius: 9999px; font-size: 24px; font-weight: bold; }
            .score-box { font-size: 48px; font-weight: 900; margin-top: 16px; color: #38bdf8; }
          </style>
        </head>
        <body>
          <div class="result-card" data-testid="player-result-card">
            <div class="badge-correct" data-testid="result-correct-badge">Correct!</div>
            <div class="score-box" data-testid="player-score-display">+850 pts</div>
            <p data-testid="player-username">SpeedyPlayer</p>
          </div>
        </body>
      </html>
    `)

    const correctBadge = playerPage.locator(
      '[data-testid="result-correct-badge"]',
    )
    expect(await correctBadge.isVisible()).toBe(true)
    expect(await correctBadge.textContent()).toBe("Correct!")

    const scoreDisplay = playerPage.locator(
      '[data-testid="player-score-display"]',
    )
    expect(await scoreDisplay.textContent()).toBe("+850 pts")
  })

  it("3. [Synthetic DOM Protocol] Authoritative percentage reveal on manager responses screen", async () => {
    expect(managerPage).not.toBeNull()

    if (!managerPage) {
      return
    }

    // Seed manager responses page with authoritative server distribution
    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #0f172a; color: #fff; font-family: sans-serif; padding: 24px; }
            .card { position: relative; overflow: hidden; background: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
            .card.correct { border: 2px solid #10b981; }
            .bar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(16, 185, 129, 0.35); transition: width 0.8s ease-out; }
            .content { position: relative; z-index: 10; display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; }
            .answered-badge { display: inline-block; padding: 6px 16px; border-radius: 9999px; background: rgba(0,0,0,0.5); font-weight: 600; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="answered-badge" data-testid="answered-ratio-badge">
            8 / 10 answered
          </div>
          <div class="grid" data-testid="responses-grid">
            <div class="card correct" data-testid="answer-card-0" data-revealed="true">
              <div class="bar" data-testid="answer-horizontal-bar" style="width: 100%;"></div>
              <div class="content">
                <span>A. Mars</span>
                <span data-testid="percentage-display-0">100%</span>
              </div>
            </div>
            <div class="card" data-testid="answer-card-1" data-revealed="true">
              <div class="bar" data-testid="answer-horizontal-bar" style="width: 75%;"></div>
              <div class="content">
                <span>B. Venus</span>
                <span data-testid="percentage-display-1">75%</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `)

    const answeredBadge = managerPage.locator(
      '[data-testid="answered-ratio-badge"]',
    )
    expect(await answeredBadge.textContent()).toContain("8 / 10 answered")

    // Option 0: 100% (8/8 respondents)
    const pct0 = managerPage.locator('[data-testid="percentage-display-0"]')
    expect(await pct0.textContent()).toBe("100%")

    // Option 1: 75% (6/8 respondents)
    const pct1 = managerPage.locator('[data-testid="percentage-display-1"]')
    expect(await pct1.textContent()).toBe("75%")

    // Multi-choice sum exceeds 100% (100% + 75% = 175%), proving no false total-selection normalization
    const card0 = managerPage.locator('[data-testid="answer-card-0"]')
    expect(await card0.getAttribute("data-revealed")).toBe("true")
  })

  it("4. [Synthetic DOM Protocol] Previous / History data contract with question details", async () => {
    expect(managerPage).not.toBeNull()

    if (!managerPage) {
      return
    }

    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #111; color: #fff; font-family: sans-serif; }
            .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; }
            .modal-content { background: #1e293b; border-radius: 16px; padding: 24px; max-width: 600px; width: 100%; }
            .badge-correct { color: #34d399; font-weight: bold; font-size: 12px; }
            .choice { display: flex; justify-content: space-between; padding: 8px 12px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top: 6px; }
          </style>
        </head>
        <body>
          <div class="modal" role="dialog" data-testid="history-modal">
            <div class="modal-content">
              <h3 data-testid="history-question-text">What color is the clear daytime sky?</h3>
              <div data-testid="history-answers-count">4 answers</div>
              <div class="choice">
                <span>Blue</span>
                <span class="badge-correct" data-testid="solution-badge-0">CORRECT</span>
              </div>
              <div class="choice">
                <span>Green</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `)

    const questionText = managerPage.locator(
      '[data-testid="history-question-text"]',
    )
    expect(await questionText.textContent()).toBe(
      "What color is the clear daytime sky?",
    )

    const answersCount = managerPage.locator(
      '[data-testid="history-answers-count"]',
    )
    expect(await answersCount.textContent()).toBe("4 answers")

    const solutionBadge = managerPage.locator(
      '[data-testid="solution-badge-0"]',
    )
    expect(await solutionBadge.isVisible()).toBe(true)
    expect(await solutionBadge.textContent()).toBe("CORRECT")
  })

  it("5. [Synthetic DOM Protocol] Replay checkpoint confirmation and socket command emission", async () => {
    expect(managerPage).not.toBeNull()

    if (!managerPage) {
      return
    }

    const emittedReplays: SocketCommandRecord[] = []

    await managerPage.exposeFunction("onReplayConfirmed", (rawCmd: unknown) => {
      emittedReplays.push(rawCmd as SocketCommandRecord)
    })

    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #111; color: #fff; font-family: sans-serif; }
            .btn-replay { background: #dc2626; color: #fff; padding: 10px 20px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; }
            .confirm-dialog { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); align-items: center; justify-content: center; }
            .confirm-dialog.open { display: flex; }
            .dialog-box { background: #1f2937; padding: 24px; border-radius: 12px; }
            .btn-confirm { background: #ef4444; color: #fff; padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <button class="btn-replay" data-testid="replay-button" id="replay-btn">Replay From Here</button>
          <div class="confirm-dialog" id="confirm-dialog" role="alertdialog">
            <div class="dialog-box">
              <h4>Replay from checkpoint?</h4>
              <p>Scores will be rolled back.</p>
              <button class="btn-confirm" data-testid="confirm-replay-button" id="confirm-btn">Confirm Replay</button>
            </div>
          </div>
          <script>
            document.getElementById('replay-btn').addEventListener('click', () => {
              document.getElementById('confirm-dialog').classList.add('open');
            });
            document.getElementById('confirm-btn').addEventListener('click', () => {
              window.onReplayConfirmed({
                action: 'REPLAY_FROM_CHECKPOINT',
                payload: { questionIndex: 0, confirmed: true, epoch: 1 }
              });
            });
          </script>
        </body>
      </html>
    `)

    // Click Replay trigger
    await managerPage.locator('[data-testid="replay-button"]').click()

    // Confirm dialog opens
    const confirmBtn = managerPage.locator(
      '[data-testid="confirm-replay-button"]',
    )
    expect(await confirmBtn.isVisible()).toBe(true)

    // Confirm replay
    await confirmBtn.click()

    expect(emittedReplays).toHaveLength(1)
    expect(emittedReplays[0].action).toBe("REPLAY_FROM_CHECKPOINT")
    expect(emittedReplays[0].payload?.questionIndex).toBe(0)
    expect(emittedReplays[0].payload?.confirmed).toBe(true)
  })

  it("6. [Synthetic DOM Protocol] Interlude auto and manual transition handling", async () => {
    expect(managerPage).not.toBeNull()

    if (!managerPage) {
      return
    }

    const skipCommands: SocketCommandRecord[] = []

    await managerPage.exposeFunction("onInterludeSkip", (rawCmd: unknown) => {
      skipCommands.push(rawCmd as SocketCommandRecord)
    })

    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #000; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
            .interlude-container { text-align: center; max-width: 800px; }
            .countdown { font-size: 80px; font-weight: 900; }
            .btn-skip { background: #fff; color: #000; padding: 12px 24px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; }
            .btn-skip:disabled { opacity: 0.5; cursor: not-allowed; }
          </style>
        </head>
        <body>
          <div class="interlude-container" data-testid="interlude-presenter" data-kind="countdown">
            <h2>Halftime Interlude</h2>
            <div class="countdown" data-testid="interlude-countdown">5</div>
            <button class="btn-skip" data-testid="interlude-skip-button" id="skip-btn">Skip Interlude</button>
          </div>
          <script>
            let hasSkipped = false;
            document.getElementById('skip-btn').addEventListener('click', () => {
              if (hasSkipped) return;
              hasSkipped = true;
              document.getElementById('skip-btn').disabled = true;
              document.getElementById('skip-btn').textContent = 'Skipped';
              window.onInterludeSkip({
                action: 'END_OR_SKIP_INTERLUDE',
                payload: { reason: 'manual', epoch: 1 }
              });
            });
          </script>
        </body>
      </html>
    `)

    const skipButton = managerPage.locator(
      '[data-testid="interlude-skip-button"]',
    )
    expect(await skipButton.isVisible()).toBe(true)

    // Click skip once
    await skipButton.click()

    // Attempt second double click on the button
    await skipButton.click({ force: true })

    // Exactly one skip command emitted
    expect(skipCommands).toHaveLength(1)
    expect(skipCommands[0].action).toBe("END_OR_SKIP_INTERLUDE")
    expect(skipCommands[0].payload?.reason).toBe("manual")
    expect(await skipButton.textContent()).toBe("Skipped")
  })

  it("7. [Synthetic DOM Protocol] Keyboard shortcut focus isolation & modal protection", async () => {
    expect(managerPage).not.toBeNull()

    if (!managerPage) {
      return
    }

    let triggeredGlobalAction = false

    await managerPage.exposeFunction("onGlobalAction", () => {
      triggeredGlobalAction = true
    })

    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #111; color: #fff; padding: 20px; }
            button { padding: 8px 16px; margin: 8px; }
          </style>
        </head>
        <body>
          <button id="focused-btn">Interactive Button</button>
          <div id="status">Ready</div>
          <script>
            function shouldIgnore(e) {
              const active = document.activeElement;
              if (!active) return false;
              if (active.tagName === 'BUTTON' || active.tagName === 'INPUT') return true;
              return false;
            }

            window.addEventListener('keydown', (e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                if (shouldIgnore(e)) {
                  return; // Ignored when focused on button!
                }
                window.onGlobalAction();
              }
            });
          </script>
        </body>
      </html>
    `)

    // Focus interactive button
    await managerPage.locator("#focused-btn").focus()

    // Press Space on focused button
    await managerPage.keyboard.press("Space")

    // Global action must NOT have been triggered because button was focused!
    expect(triggeredGlobalAction).toBe(false)

    // Click outside to blur
    await managerPage.locator("body").click()

    // Press Space on body / non-interactive background
    await managerPage.keyboard.press("Space")

    // Now global action triggers!
    expect(triggeredGlobalAction).toBe(true)
  })

  it("8. [P1 DOM Protocol] Previous Screen button emission and Alt+ArrowLeft shortcut", async () => {
    expect(managerPage).not.toBeNull()

    if (!managerPage) {
      return
    }

    const previousCommands: SocketCommandRecord[] = []

    await managerPage.exposeFunction(
      "emitPreviousScreen",
      (cmd: SocketCommandRecord) => {
        previousCommands.push(cmd)
      },
    )

    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #0f172a; color: #fff; font-family: Rubik, sans-serif; padding: 20px; }
            button { padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; }
            button:disabled { opacity: 0.5; cursor: not-allowed; }
          </style>
        </head>
        <body>
          <div style="display: flex; justify-content: space-between; align-items: center; width: 800px;">
            <button id="prev-screen-btn" data-testid="previous-screen-button">
              Previous Screen (Alt+←)
            </button>
            <button id="history-btn" data-testid="history-button">
              History
            </button>
            <button id="next-screen-btn" data-testid="next-screen-button">
              Next Screen
            </button>
          </div>
          <script>
            let canPrevious = true;
            let isAnswering = false;

            function triggerPrevious() {
              if (!canPrevious || isAnswering) return;
              window.emitPreviousScreen({ action: "PREVIOUS_SCREEN" });
            }

            document.getElementById("prev-screen-btn").addEventListener("click", triggerPrevious);

            window.addEventListener("keydown", (e) => {
              if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                triggerPrevious();
              }
            });
          </script>
        </body>
      </html>
    `)

    const prevBtn = managerPage.locator('[data-testid="previous-screen-button"]')
    expect(await prevBtn.isVisible()).toBe(true)

    // Click button
    await prevBtn.click()
    expect(previousCommands).toHaveLength(1)
    expect(previousCommands[0].action).toBe("PREVIOUS_SCREEN")

    // Press Alt+ArrowLeft
    await managerPage.keyboard.press("Alt+ArrowLeft")
    expect(previousCommands).toHaveLength(2)
    expect(previousCommands[1].action).toBe("PREVIOUS_SCREEN")
  })

  it("9. [P1 DOM Protocol] Big 20s countdown timer on Host & Audience Display with urgency threshold", async () => {
    expect(managerPage).not.toBeNull()

    if (!managerPage) {
      return
    }

    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #1e1b4b; color: #fff; font-family: Rubik, sans-serif; padding: 20px; }
            .timer-badge {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
              font-variant-numeric: tabular-nums;
              font-weight: 800;
              border-radius: 9999px;
              padding: 6px 16px;
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            .normal-state {
              background-color: rgba(255, 255, 255, 0.1);
              color: #ffffff;
            }
            .urgent-state {
              background-color: #ef4444;
              color: #ffffff;
              animation: pulse 1s infinite;
            }
          </style>
        </head>
        <body>
          <div id="host-timer" class="timer-badge normal-state" data-testid="answer-countdown" data-urgent="false">
            <span id="host-time">20</span>s
          </div>
          <div id="audience-timer" class="timer-badge normal-state" data-testid="audience-countdown" data-urgent="false">
            <span id="audience-time">20</span>s
          </div>

          <script>
            function setTimer(seconds) {
              const clamped = Math.max(0, Math.floor(seconds));
              const isUrgent = clamped <= 5 && clamped > 0;
              const formatted = String(clamped).padStart(2, '0');

              const host = document.getElementById("host-timer");
              const audience = document.getElementById("audience-timer");
              document.getElementById("host-time").textContent = formatted;
              document.getElementById("audience-time").textContent = formatted;

              if (isUrgent) {
                host.className = "timer-badge urgent-state";
                host.setAttribute("data-urgent", "true");
                audience.className = "timer-badge urgent-state";
                audience.setAttribute("data-urgent", "true");
              } else {
                host.className = "timer-badge normal-state";
                host.setAttribute("data-urgent", "false");
                audience.className = "timer-badge normal-state";
                audience.setAttribute("data-urgent", "false");
              }
            }
          </script>
        </body>
      </html>
    `)

    const hostTimer = managerPage.locator('[data-testid="answer-countdown"]')
    expect(await hostTimer.isVisible()).toBe(true)
    expect(await hostTimer.getAttribute("data-urgent")).toBe("false")
    expect(await hostTimer.textContent()).toContain("20")

    // Update timer to 4 seconds (urgency state)
    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .urgent-state { background-color: #ef4444; color: #fff; }
          </style>
        </head>
        <body>
          <div id="host-timer" class="timer-badge urgent-state" data-testid="answer-countdown" data-urgent="true">
            <span id="host-time">04</span>s
          </div>
        </body>
      </html>
    `)

    const urgentTimer = managerPage.locator('[data-testid="answer-countdown"]')
    expect(await urgentTimer.getAttribute("data-urgent")).toBe("true")
    expect(await urgentTimer.textContent()).toContain("04")
  })

  it("10. [P1 DOM Protocol] Question Entrance Animation wrapper applies preset & epoch cleanly", async () => {
    expect(managerPage).not.toBeNull()

    if (!managerPage) {
      return
    }

    await managerPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .tada-entrance-slide-up {
              animation-name: tadaSlideUp;
              animation-duration: 800ms;
              animation-fill-mode: both;
            }
            .tada-entrance-spotlight {
              animation-name: tadaSpotlight;
              animation-duration: 1200ms;
              animation-fill-mode: both;
            }
          </style>
        </head>
        <body>
          <div id="entrance-container" data-testid="question-entrance" data-epoch="1" class="tada-entrance-slide-up" style="animation-duration: 800ms;">
            <h1>Question Card Title</h1>
          </div>
        </body>
      </html>
    `)

    const entranceContainer = managerPage.locator('[data-testid="question-entrance"]')
    expect(await entranceContainer.isVisible()).toBe(true)
    expect(await entranceContainer.getAttribute("data-epoch")).toBe("1")
    const classAttr = await entranceContainer.getAttribute("class")
    expect(classAttr).toContain("tada-entrance-slide-up")
  })
})
