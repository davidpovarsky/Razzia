"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const {
  createSession,
  event,
  newQuestion,
  introRead,
  AUDIO_READ,
  syncServerState,
} = require("./tada-audio-logic.cjs")
test("intro has music and join click with no speech", () => {
  const s = createSession()
  const r = event(s, null, new URLSearchParams())
  assert.equal(r.cue, "000")
  assert.ok(r.body.includes("f-/9/000.f-/9/001.f-/9/005"))
  assert.ok(!r.body.includes("t-"))
})
test("silence without a key", () => {
  const s = createSession()
  event(s, null, new URLSearchParams())
  const r = event(s, null, new URLSearchParams())
  assert.equal(r.event, "await_input")
  assert.ok(r.body.includes("f-/9/005"))
})
test("invalid keys produce neutral sound", () => {
  for (const digit of ["0", "5", "8", "9", "*", "#"]) {
    const s = createSession()
    event(s, null, new URLSearchParams())
    const r = event(
      s,
      null,
      new URLSearchParams("td1=" + encodeURIComponent(digit)),
    )
    assert.equal(r.cue, "004")
  }
})
test("no question never guesses correctness", () => {
  const s = createSession()
  event(s, null, new URLSearchParams())
  const r = event(
    s,
    () => ({ accepted: true, correct: true }),
    new URLSearchParams("td1=1"),
  )
  assert.equal(r.cue, "004")
})
test("authoritative correct and then duplicate neutral", () => {
  const s = createSession()
  event(s, null, new URLSearchParams())
  newQuestion(s, 1)
  const j = (v, e) => ({ accepted: true, correct: v === "2" && e === 1 })
  const a = event(s, j, new URLSearchParams("td1=2"))
  assert.equal(a.event, "correct")
  assert.equal(a.cue, "002")
  const b = event(s, j, new URLSearchParams("td2=1"))
  assert.equal(b.cue, "004")
  assert.equal(s.answered, true)
})
test("incorrect and next question resets safely", () => {
  const s = createSession()
  event(s, null, new URLSearchParams())
  newQuestion(s, 1)
  let x = event(
    s,
    () => ({ accepted: true, correct: false }),
    new URLSearchParams("td1=1"),
  )
  assert.equal(x.cue, "003")
  assert.equal(newQuestion(s, 1), false)
  assert.equal(newQuestion(s, 2), true)
  x = event(
    s,
    () => ({ accepted: true, correct: true }),
    new URLSearchParams("td2=3"),
  )
  assert.equal(x.cue, "002")
})
test("no judge produces neutral not fabricated results", () => {
  const s = createSession()
  event(s, null, new URLSearchParams())
  newQuestion(s, 1)
  const x = event(s, null, new URLSearchParams("td1=3"))
  assert.equal(x.cue, "004")
  assert.equal(s.answered, false)
})
test("API read disables confirmation and verbal echo", () => {
  const read = AUDIO_READ("004", "td88")
  assert.ok(read.startsWith("read=f-/9/004="))
  assert.ok(read.endsWith(",no"))
  assert.equal(read.split(",").length, 15)
})
test("join click 001 is withheld until server confirms join", () => {
  const s = createSession()
  const r1 = event(s, null, new URLSearchParams(), { joinedConfirmed: false })
  assert.ok(r1.body.includes("f-/9/000.f-/9/005=td1"))
  assert.ok(!r1.body.includes("f-/9/001"))
  const r2 = event(s, null, new URLSearchParams(), { joinedConfirmed: true })
  assert.equal(r2.cue, "001")
  assert.equal(r2.event, "join_confirmed_audio")
  assert.ok(r2.body.includes("f-/9/001=td1"))
})
test("pending verdict plays neutral 004 then delivers delayed 002/003 once verdict is known", () => {
  const s = createSession()
  event(s, null, new URLSearchParams(), { joinedConfirmed: true })
  syncServerState(s, {
    state: { epoch: 1, acceptingAnswers: true, answeredCurrentQuestion: false },
  })
  const rAns = event(
    s,
    () => ({ accepted: true, verdictPending: true }),
    new URLSearchParams("td1=2"),
  )
  assert.equal(rAns.cue, "004")
  assert.equal(rAns.event, "accepted_pending_verdict")
  assert.equal(s.answered, true)
  // Next poll after question closes and verdict is known
  const rPoll = event(s, null, new URLSearchParams("td2=None"), {
    joinedConfirmed: true,
    serverState: {
      state: {
        epoch: 1,
        acceptingAnswers: false,
        answeredCurrentQuestion: true,
        lastVerdict: { epoch: 1, correct: true },
      },
    },
  })
  assert.equal(rPoll.cue, "002")
  assert.equal(rPoll.event, "delayed_verdict_correct")
})
test("100 concurrent simulated phone sessions across 2 questions with no cross-talk", () => {
  const sessions = Array.from({ length: 100 }, (_, i) =>
    createSession({ rosterPlayerId: "r-" + (i + 1) }),
  )
  for (const s of sessions) {
    const intro = event(s, null, new URLSearchParams(), {
      joinedConfirmed: true,
    })
    assert.equal(intro.cue, "000")
    newQuestion(s, 1)
  }
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]
    const digit = String((i % 4) + 1)
    const ans = event(
      s,
      (v) => ({ accepted: true, correct: v === "2" }),
      new URLSearchParams("td1=" + digit),
    )
    assert.equal(ans.cue, digit === "2" ? "002" : "003")
    // Advancing to Q2 even if some callers time out on Q1
    assert.equal(newQuestion(s, 2), true)
    const ans2 = event(
      s,
      (v) => ({ accepted: true, correct: v === "4" }),
      new URLSearchParams("td2=" + digit),
    )
    assert.equal(ans2.cue, digit === "4" ? "002" : "003")
  }
})

test("gateway causal ordering: answerOutcome with answeredCurrentQuestion=true delivers correct 002, not duplicate 004", () => {
  const s = createSession()
  event(s, null, new URLSearchParams(), { joinedConfirmed: true })
  // Initial poll: question active, epoch 1, caller not yet answered
  syncServerState(s, {
    state: { epoch: 1, acceptingAnswers: true, answeredCurrentQuestion: false },
  })

  // Caller presses '2'. Gateway calls Razzia backend, which accepts and returns updated state with answeredCurrentQuestion: true
  const ansOutcome = {
    accepted: true,
    correct: true,
    state: { epoch: 1, acceptingAnswers: true, answeredCurrentQuestion: true },
  }
  const judge = () => ({
    accepted: Boolean(ansOutcome.accepted),
    correct: ansOutcome.correct,
    verdictPending: false,
    isSurvey: false,
  })

  const res = event(s, judge, new URLSearchParams("td1=2"), {
    joinedConfirmed: true,
    serverState: ansOutcome,
  })

  assert.equal(res.event, "correct")
  assert.equal(res.cue, "002")
  assert.equal(s.answered, true)

  // Subsequent click in same question must deliver duplicate neutral 004
  const resDup = event(s, judge, new URLSearchParams("td2=3"), {
    joinedConfirmed: true,
    serverState: ansOutcome,
  })
  assert.equal(resDup.event, "inactive_or_duplicate")
  assert.equal(resDup.cue, "004")
})

test("gateway causal ordering: answerOutcome delivers wrong 003, not duplicate 004", () => {
  const s = createSession()
  event(s, null, new URLSearchParams(), { joinedConfirmed: true })
  syncServerState(s, {
    state: { epoch: 1, acceptingAnswers: true, answeredCurrentQuestion: false },
  })

  const ansOutcome = {
    accepted: true,
    correct: false,
    state: { epoch: 1, acceptingAnswers: true, answeredCurrentQuestion: true },
  }
  const judge = () => ({
    accepted: Boolean(ansOutcome.accepted),
    correct: ansOutcome.correct,
    verdictPending: false,
    isSurvey: false,
  })

  const res = event(s, judge, new URLSearchParams("td1=1"), {
    joinedConfirmed: true,
    serverState: ansOutcome,
  })

  assert.equal(res.event, "wrong")
  assert.equal(res.cue, "003")
  assert.equal(s.answered, true)
})

test("survey question answer produces 004 neutral acknowledgement, never 002 or 003", () => {
  const s = createSession()
  event(s, null, new URLSearchParams(), { joinedConfirmed: true })
  syncServerState(s, {
    state: { epoch: 2, acceptingAnswers: true, answeredCurrentQuestion: false },
  })

  const ansOutcome = {
    accepted: true,
    isSurvey: true,
    state: { epoch: 2, acceptingAnswers: true, answeredCurrentQuestion: true },
  }
  const judge = () => ({
    accepted: Boolean(ansOutcome.accepted),
    isSurvey: true,
  })

  const res = event(s, judge, new URLSearchParams("td1=3"), {
    joinedConfirmed: true,
    serverState: ansOutcome,
  })

  assert.equal(res.event, "survey_answer")
  assert.equal(res.cue, "004")
  assert.equal(s.answered, true)
})

test("answer accepted as window closes: authoritative correct outcome delivers 002 even if server state says acceptingAnswers=false", () => {
  const s = createSession()
  event(s, null, new URLSearchParams(), { joinedConfirmed: true })
  syncServerState(s, {
    state: { epoch: 1, acceptingAnswers: true, answeredCurrentQuestion: false },
  })

  const r = event(
    s,
    () => ({ accepted: true, correct: true }),
    new URLSearchParams("td1=2"),
    {
      joinedConfirmed: true,
      serverState: {
        state: {
          epoch: 1,
          acceptingAnswers: false,
          answeredCurrentQuestion: true,
        },
      },
    },
  )

  assert.equal(r.event, "correct")
  assert.equal(r.cue, "002")
  assert.equal(s.answered, true)
})

test("answer accepted as window closes: authoritative wrong outcome delivers 003 even if server state says acceptingAnswers=false", () => {
  const s = createSession()
  event(s, null, new URLSearchParams(), { joinedConfirmed: true })
  syncServerState(s, {
    state: { epoch: 1, acceptingAnswers: true, answeredCurrentQuestion: false },
  })

  const r = event(
    s,
    () => ({ accepted: true, correct: false }),
    new URLSearchParams("td1=1"),
    {
      joinedConfirmed: true,
      serverState: {
        state: {
          epoch: 1,
          acceptingAnswers: false,
          answeredCurrentQuestion: true,
        },
      },
    },
  )

  assert.equal(r.event, "wrong")
  assert.equal(r.cue, "003")
  assert.equal(s.answered, true)
})

test("5-option single-choice survey accepts key 5 and emits neutral 004 cue", () => {
  const s = createSession()
  event(s, null, new URLSearchParams(), { joinedConfirmed: true })
  syncServerState(s, {
    state: {
      epoch: 1,
      acceptingAnswers: true,
      answeredCurrentQuestion: false,
      answersCount: 5,
    },
  })

  let submittedKey = null
  const r = event(
    s,
    (key) => {
      submittedKey = key
      return { accepted: true, isSurvey: true }
    },
    new URLSearchParams("td1=5"),
    { joinedConfirmed: true },
  )

  assert.equal(submittedKey, "5")
  assert.equal(r.event, "survey_answer")
  assert.equal(r.cue, "004")
  assert.equal(s.answered, true)
})

test("4-option question rejects key 5 as invalid_key and does not call judge", () => {
  const s = createSession()
  event(s, null, new URLSearchParams(), { joinedConfirmed: true })
  syncServerState(s, {
    state: {
      epoch: 1,
      acceptingAnswers: true,
      answeredCurrentQuestion: false,
      answersCount: 4,
    },
  })

  let called = false
  const r = event(
    s,
    () => {
      called = true
      return { accepted: true }
    },
    new URLSearchParams("td1=5"),
    { joinedConfirmed: true },
  )

  assert.equal(called, false)
  assert.equal(r.event, "invalid_key")
  assert.equal(r.cue, "004")
  assert.equal(s.answered, false)
})
