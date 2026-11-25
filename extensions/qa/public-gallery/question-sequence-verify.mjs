/** Browser-only observation of the real stage clock, paint and retained question nodes. */
import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"
const require = createRequire("/cleanup/extensions/package.json")
const { expect } = require("@playwright/test")

export async function watchQuestionSequence(root, options = {}) {
  await root.evaluate((element, receivedOptions) => {
    element.__questionSequence?.stop()
    const phaseAttribute = receivedOptions.phaseAttribute ?? "data-game-phase"
    const votingPhase = receivedOptions.votingPhase ?? "voting"
    const records = []
    let current = null
    // Keep RAF evidence for paint assertions and observe phase transitions separately.
    const installedAt = performance.now()
    const recentPhases = []
    const recentFrames = []
    let previousFrameAt = null
    const phaseObserver = new MutationObserver((changes) => {
      const at = performance.now()
      const phases = changes.filter(
        (change) => change.attributeName === phaseAttribute,
      )
      for (let index = 0; index < phases.length; index += 1) {
        const event = {
          at,
          oldPhase: phases[index].oldValue,
          phase:
            phases[index + 1]?.oldValue ?? element.getAttribute(phaseAttribute),
          batchIndex: index,
          batchSize: phases.length,
        }
        recentPhases.push(event)

        if (recentPhases.length > 8) {
          recentPhases.shift()
        }

        // The question mutation precedes the next RAF's new round record.
        if (current && event.phase !== "question") {
          if (event.oldPhase === "question" && event.phase === votingPhase) {
            current.votingPhaseAt ??= event.at
          }

          if (current.diagnostic.phaseTransitions.length < 16) {
            current.diagnostic.phaseTransitions.push(event)
          } else {
            current.diagnostic.phaseOverflow = true
          }
        }
      }
    })
    phaseObserver.observe(element, {
      attributes: true,
      attributeFilter: [phaseAttribute],
      attributeOldValue: true,
    })
    let previousPhase = ""
    let frame = undefined

    let stopped = false
    let armed = !receivedOptions.startAction
    let pendingExplicitReplay = false
    let roots = [element]
    const discover = () => {
      roots = [element]
      for (let index = 0; index < roots.length; index += 1) {
        for (const child of roots[index].querySelectorAll("*")) {
          if (child.shadowRoot) {
            roots.push(child.shadowRoot)
          }
        }
      }
    }
    const all = (selector) =>
      roots.flatMap((scope) => [...scope.querySelectorAll(selector)])
    const visible = (node) => {
      if (!node?.isConnected) {
        return false
      }

      const box = node.getBoundingClientRect()

      if (box.width <= 0 || box.height <= 0) {
        return false
      }

      let parent = node

      while (parent instanceof Element) {
        const style = getComputedStyle(parent)

        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) <= 0.01
        ) {
          return false
        }

        parent = parent.parentElement ?? parent.getRootNode().host
      }

      return true
    }
    const geometry = (node) => {
      const box = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      const matrix = new DOMMatrix(
        style.transform === "none" ? undefined : style.transform,
      )
      const transform = matrix.isIdentity ? "identity" : matrix.toString()

      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        transform,
        opacity: style.opacity,
      }
    }
    const layout = (panel) => {
      const stage = panel.closest(".tzv4-stage")
      const [dialog] = all(".game-viewer-dialog")

      return {
        stage: stage ? geometry(stage) : null,
        root: geometry(element),
        scroll: {
          x: window.scrollX,
          y: window.scrollY,
          dialogLeft: dialog?.scrollLeft ?? null,
          dialogTop: dialog?.scrollTop ?? null,
        },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }
    }
    const snapshot = (record) => ({
      number: record.number,
      question: record.question,
      questionAt: record.questionAt,
      votingAt: record.votingAt,
      questionPhaseAt: record.questionPhaseAt,
      votingPhaseAt: record.votingPhaseAt,
      rafLeadMs:
        record.votingAt === null ? null : record.votingAt - record.questionAt,
      phaseLeadMs:
        record.questionPhaseAt === null || record.votingPhaseAt === null
          ? null
          : record.votingPhaseAt - record.questionPhaseAt,
      answersAt: record.answersAt,
      timerAt: record.timerAt,
      resultsAt: record.resultsAt,
      resultsFrames: record.resultsFrames,
      earlyAnswers: record.earlyAnswers,
      earlyTimer: record.earlyTimer,
      retainedPanel: record.retainedPanel,
      retainedHeading: record.retainedHeading,
      duplicateHeadings: record.duplicateHeadings,
      headingChanged: record.headingChanged,
      newQuestionAnimations: record.newQuestionAnimations,
      stableTypography: record.stableTypography,
      stableGeometry: record.stableGeometry,
      geometryEvidence: record.geometryEvidence,
      photo: record.photo,
      samples: record.samples,
      explicitReplay: record.explicitReplay,
      identityLockedAt: record.identityLockedAt,
      initialReplayRemounts: record.initialReplayRemounts,
      diagnostic: {
        clock: "performance.now",
        installedAt,
        phaseTransitions: record.diagnostic.phaseTransitions,
        phaseOverflow: record.diagnostic.phaseOverflow,
        leadingFrames: record.diagnostic.leadingFrames,
        frames: [
          ...record.diagnostic.firstFrames,
          ...record.diagnostic.lastFrames,
        ],
        firstFrameByPhase: record.diagnostic.firstFrameByPhase,
        observedFrameCount: record.diagnostic.observedFrameCount,
        omittedFrameCount: Math.max(
          0,
          record.diagnostic.observedFrameCount - 240,
        ),
        largestRafGapMs: record.diagnostic.largestRafGapMs,
        limits: {
          phaseTransitions: 16,
          leadingFrames: 8,
          firstFrames: 192,
          lastFrames: 48,
          resultsFrames: 4,
        },
      },
    })
    const startAction = (event) => {
      if (
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof Element &&
              node.matches(receivedOptions.startAction),
          )
      ) {
        armed = true
        pendingExplicitReplay =
          receivedOptions.allowInitialReplayRemount === true
        current = null
        previousPhase = ""
      }
    }

    if (receivedOptions.startAction) {
      element.addEventListener("click", startAction, true)
    }

    const tick = (frameTimestamp) => {
      if (stopped || !element.isConnected) {
        return
      }

      const phase = element.getAttribute(phaseAttribute)
      const now = performance.now()
      const diagnosticFrame = {
        at: now,
        frameTimestamp,
        phase,
        gap: previousFrameAt === null ? null : now - previousFrameAt,
        headingVisible: null,
        answers: null,
        timer: null,
        endAt: null,
      }
      previousFrameAt = now

      if (
        armed &&
        phase === "question" &&
        (previousPhase !== "question" || !current)
      ) {
        discover()
        const questionTransition = recentPhases.findLast(
          (event) =>
            event.phase === "question" &&
            event.oldPhase !== "question" &&
            (!current || event.at > current.questionAt),
        )
        current = {
          number: records.length,
          questionAt: now,
          questionPhaseAt: pendingExplicitReplay
            ? null
            : (questionTransition?.at ?? null),
          votingPhaseAt: null,
          question: "",
          votingAt: null,
          answersAt: null,
          timerAt: null,
          resultsAt: null,
          resultsFrames: 0,
          earlyAnswers: false,
          earlyTimer: false,
          retainedPanel: true,
          retainedHeading: true,
          duplicateHeadings: false,
          headingChanged: false,
          newQuestionAnimations: 0,
          stableTypography: true,
          stableGeometry: true,
          photo: false,
          panel: null,
          heading: null,
          baseline: null,
          baselineAt: null,
          panelBaseline: null,
          layoutBaseline: null,
          geometryEvidence: null,
          animations: new WeakSet(),
          samples: [],
          explicitReplay: pendingExplicitReplay,
          identityLockedAt: null,
          initialReplayRemounts: [],
          diagnostic: {
            phaseTransitions: recentPhases.slice(-2),
            phaseOverflow: false,
            leadingFrames: [...recentFrames],
            firstFrames: [],
            lastFrames: [],
            firstFrameByPhase: {},
            observedFrameCount: 0,
            largestRafGapMs: 0,
          },
        }
        pendingExplicitReplay = false
        records.push(current)
      }

      if (current && ["question", votingPhase, "results"].includes(phase)) {
        // The presented phase starts before a possibly delayed observer RAF.
        // Explicit same-phase Replay retains its existing RAF/remount contract.
        const questionClockAt = current.questionPhaseAt ?? current.questionAt

        if (!current.heading && now - questionClockAt < 1500) {
          discover()
        }

        const panels = all('[data-testid="tadazz-question-panel"]').filter(
          visible,
        )
        const [panel] = panels
        const heading = panel?.querySelector(".q-text, .photo-question-head")

        if (panels.length > 1) {
          current.duplicateHeadings = true
        }

        if (heading && visible(heading)) {
          diagnosticFrame.headingVisible = true

          if (!current.heading) {
            current.panel = panel
            current.heading = heading
            current.question = heading.textContent.trim()
            current.photo = heading.matches(".photo-question-head")
          } else {
            const initialReplayCommit =
              current.explicitReplay &&
              phase === "question" &&
              current.identityLockedAt === null

            if (initialReplayCommit) {
              if (panel !== current.panel || heading !== current.heading) {
                current.initialReplayRemounts.push({
                  at: now,
                  panelChanged: panel !== current.panel,
                  headingChanged: heading !== current.heading,
                })
              }

              current.panel = panel
              current.heading = heading
            } else {
              current.retainedPanel &&= panel === current.panel
              current.retainedHeading &&= heading === current.heading
            }

            current.headingChanged ||=
              heading.textContent.trim() !== current.question
          }

          if (
            current.explicitReplay &&
            phase === "question" &&
            current.identityLockedAt === null &&
            now - questionClockAt >= 1600
          ) {
            current.identityLockedAt = now
          }

          for (const animation of panel.getAnimations({ subtree: true })) {
            const target = animation.effect?.target

            if (target !== panel && target !== heading) {
              continue
            }

            if (
              phase !== "question" &&
              !current.animations.has(animation) &&
              animation.playState === "running"
            ) {
              current.newQuestionAnimations += 1
            }

            current.animations.add(animation)
          }

          if (phase === "question" && now - questionClockAt >= 1600) {
            current.baseline = geometry(heading)
            current.baselineAt = now
            current.panelBaseline = geometry(panel)
            current.layoutBaseline = layout(panel)
          }

          if (phase !== "question" && current.baseline) {
            const actual = geometry(heading)
            for (const key of [
              "fontSize",
              "lineHeight",
              "fontWeight",
              "transform",
              "opacity",
            ]) {
              if (actual[key] !== current.baseline[key]) {
                current.stableTypography = false
              }
            }
            const changedGeometry = []
            for (const key of ["x", "y", "width", "height"]) {
              if (Math.abs(actual[key] - current.baseline[key]) > 2) {
                current.stableGeometry = false
                changedGeometry.push(key)
              }
            }

            if (changedGeometry.length > 0 && !current.geometryEvidence) {
              current.geometryEvidence = {
                phase,
                at: now,
                questionAt: current.questionAt,
                changed: changedGeometry,
                baseline: {
                  phase: "question",
                  at: current.baselineAt,
                  heading: current.baseline,
                  panel: current.panelBaseline,
                  ...current.layoutBaseline,
                },
                actual: {
                  heading: actual,
                  panel: geometry(panel),
                  ...layout(panel),
                },
              }
            }

            const actualPanel = geometry(panel)

            if (
              actualPanel.transform !== current.panelBaseline.transform ||
              actualPanel.opacity !== current.panelBaseline.opacity
            ) {
              current.stableTypography = false
            }
          }
        } else if (current.heading && phase !== "question") {
          current.retainedHeading = false
        }

        if (diagnosticFrame.headingVisible === null) {
          diagnosticFrame.headingVisible = false
        }

        const answers = all("[data-v4-choice]").some(visible)
        const timer = all(".countdown-floater").some(visible)
        diagnosticFrame.answers = answers
        diagnosticFrame.timer = timer

        if (phase === "question") {
          current.earlyAnswers ||= answers
          current.earlyTimer ||= timer
        }

        if (phase === votingPhase && current.votingAt === null) {
          current.votingAt = now
        }

        if (answers && current.answersAt === null) {
          current.answersAt = now
        }

        if (timer && current.timerAt === null) {
          current.timerAt = now
        }

        if (phase === "results") {
          if (current.resultsAt === null) {
            current.resultsAt = now
          }

          current.resultsFrames += 1
        }

        if (
          current.samples.length < 8 &&
          (current.samples.length === 0 ||
            phase !== current.samples.at(-1).phase)
        ) {
          current.samples.push({
            phase,
            at: now,
            answers,
            timer,
            headings: panels.length,
          })
        }
      }

      diagnosticFrame.endAt = performance.now()

      if (
        current &&
        ["question", votingPhase, "results"].includes(phase) &&
        (phase !== "results" || current.resultsFrames <= 4)
      ) {
        const evidence = current.diagnostic
        evidence.observedFrameCount += 1
        evidence.largestRafGapMs = Math.max(
          evidence.largestRafGapMs,
          diagnosticFrame.gap ?? 0,
        )
        evidence.firstFrameByPhase[phase] ??= diagnosticFrame

        if (evidence.firstFrames.length < 192) {
          evidence.firstFrames.push(diagnosticFrame)
        } else {
          evidence.lastFrames.push(diagnosticFrame)

          if (evidence.lastFrames.length > 48) {
            evidence.lastFrames.shift()
          }
        }
      }

      recentFrames.push(diagnosticFrame)

      if (recentFrames.length > 8) {
        recentFrames.shift()
      }

      previousPhase = phase
      frame = requestAnimationFrame(tick)
    }
    element.__questionSequence = {
      read: () => records.map(snapshot),
      stop: () => {
        stopped = true
        cancelAnimationFrame(frame)
        phaseObserver.disconnect()
        element.removeEventListener("click", startAction, true)
      },
    }
    discover()
    frame = requestAnimationFrame(tick)
  }, options)
}

export async function readQuestionSequence(
  root,
  index,
  {
    photo = false,
    throughResults = true,
    timerExpected = true,
    evidencePath,
  } = {},
) {
  await expect
    .poll(
      () =>
        root.evaluate(
          (
            element,
            {
              index: sequenceIndex,
              throughResults: includeResults,
              timerExpected: includeTimer,
            },
          ) => {
            const record = element.__questionSequence?.read()[sequenceIndex]

            if (!record) {
              return false
            }

            return includeResults
              ? record.resultsFrames >= 2
              : record.votingAt !== null &&
                  record.answersAt !== null &&
                  (!includeTimer || record.timerAt !== null)
          },
          { index, throughResults, timerExpected },
        ),
      { timeout: 10_000 },
    )
    .toBe(true)
  const result = await root.evaluate(
    (element, receivedIndex) =>
      element.__questionSequence.read()[receivedIndex],
    index,
  )

  if (evidencePath) {
    writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`)
  }

  assert(result.question, "Observed the actual question heading")
  const questionClockAt = result.explicitReplay
    ? result.questionAt
    : result.questionPhaseAt
  const votingClockAt = result.explicitReplay
    ? result.votingAt
    : result.votingPhaseAt
  assert(
    Number.isFinite(questionClockAt) &&
      Number.isFinite(votingClockAt) &&
      questionClockAt < votingClockAt &&
      questionClockAt <= result.questionAt &&
      votingClockAt <= result.votingAt,
    "Observed the matching presented question and voting transitions",
  )
  const lead = votingClockAt - questionClockAt
  assert(
    lead >= 1800 && lead <= 2500,

    `Question-only phase lasts 2s within frame/scheduling tolerance: ${lead}`,
  )
  for (const kind of timerExpected ? ["answers", "timer"] : ["answers"]) {
    assert(result[`${kind}At`] !== null, `${kind} actually became visible`)
    const delay = result[`${kind}At`] - questionClockAt
    assert(
      delay >= 1800 && delay <= 2600,
      `${kind} first paint follows the 2s lead-in: ${delay}`,
    )
  }

  if (timerExpected) {
    assert(
      Math.abs(result.answersAt - result.timerAt) <= 34,
      "Answers and timer first paint in the same or adjacent 60Hz frame",
    )
  } else {
    assert.equal(
      result.timerAt,
      null,
      "An authored untimed question never paints a timer",
    )
  }

  assert.equal(
    result.earlyAnswers,
    false,
    "No answers during question-only lead-in",
  )
  assert.equal(
    result.earlyTimer,
    false,
    "No timer during question-only lead-in",
  )

  if (result.explicitReplay) {
    assert(
      result.identityLockedAt !== null &&
        result.identityLockedAt >= result.questionAt + 1600 &&
        result.identityLockedAt < result.votingAt,
      "Explicit Replay locks its settled question node before voting",
    )
  }

  assert.equal(
    result.retainedPanel,
    true,
    throughResults
      ? "Same question panel through voting/results"
      : "Same question panel through first voting paint",
  )
  assert.equal(
    result.retainedHeading,
    true,
    throughResults
      ? "Same question text node through voting/results"
      : "Same question text node through first voting paint",
  )
  assert.equal(result.duplicateHeadings, false, "One question heading")
  assert.equal(result.headingChanged, false, "Question content unchanged")
  assert.equal(
    result.newQuestionAnimations,
    0,
    throughResults
      ? "Question entrance never replays during voting/results"
      : "Question entrance never replays at first voting paint",
  )
  assert.equal(
    result.stableTypography,
    true,
    "Question typography, transform and opacity remain stable",
  )
  assert.equal(
    result.stableGeometry,
    true,

    `Question geometry remains stable: ${JSON.stringify(
      result.geometryEvidence,
    )}`,
  )

  if (photo) {
    assert.equal(result.photo, true, "Actual question-image layout exercised")
  }

  return {
    ...result,
    observedThrough: throughResults ? "results" : "first-voting-paint",
    leadMs: lead,
    timingBasis: result.explicitReplay
      ? "explicit-replay-raf"
      : "observed-presented-phase",
    timerExpected,
    answersTimerDeltaMs: timerExpected
      ? Math.abs(result.answersAt - result.timerAt)
      : null,
  }
}

export async function stopQuestionSequence(root) {
  await root.evaluate((element) => element.__questionSequence?.stop())
}
