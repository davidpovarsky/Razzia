import { describe, expect, it, beforeEach } from "vitest"
import { QUESTION_TYPES, QUIZZ_MODES } from "@razzia/common/constants"
import {
  isQuestionSupportedOnPstn,
  isValidPin,
  mapDtmfToAnswerIndex,
  redactPhoneNumber,
  type TelephonyDirective,
} from "./types"
import { MockProvider } from "./mock-provider"
import { YemotApiTranslator } from "./yemot-translator"
import { MockRazziaTransport } from "./transport"
import { TelephonyBridge } from "./bridge"
import { KeypadSimulatorCore } from "./simulator"

const SECRET = "test-secret-razzia-key"
let transport = new MockRazziaTransport()
let mockProvider = new MockProvider({ secret: SECRET })
let bridge = new TelephonyBridge({
  transport,
  provider: mockProvider,
})

function resetHarness(): void {
  transport = new MockRazziaTransport()
  mockProvider = new MockProvider({ secret: SECRET })
  bridge = new TelephonyBridge({
    transport,
    provider: mockProvider,
  })
}

// =========================================================================
// SEC02: Cryptographic HMAC, Timing Skew & Replay Attacks
// =========================================================================
describe("SEC02: Mock HMAC Verification, Timing Skew & Replay Protection", () => {
  beforeEach(resetHarness)

  it("accepts validly signed webhook requests", async () => {
    const reqVerify = mockProvider.createSignedRequest({
      callId: "call_sec_01_verify",
      type: "CALL_START",
    })
    const verification = mockProvider.verifyRequest(reqVerify)
    expect(verification.valid).toBe(true)

    const req = mockProvider.createSignedRequest({
      callId: "call_sec_01",
      type: "CALL_START",
    })
    const response = await bridge.handleWebhookRequest("mock", req)
    expect(response.statusCode).toBe(200)
    const data = JSON.parse(response.body) as {
      directive: { type: string; message: string }
    }
    expect(data.directive.type).toBe("read")
    expect(data.directive.message).toContain("6-digit game PIN")
  })

  it("rejects requests with tampered HMAC signature (401)", async () => {
    const req = mockProvider.createSignedRequest(
      { callId: "call_sec_02", type: "CALL_START" },
      { mutateSignature: (sig) => (sig.startsWith("0") ? `1${sig.slice(1)}` : `0${sig.slice(1)}`) },
    )

    const verification = mockProvider.verifyRequest(req)
    expect(verification.valid).toBe(false)
    expect(verification.reason).toContain("HMAC signature mismatch")

    const response = await bridge.handleWebhookRequest("mock", req)
    expect(response.statusCode).toBe(401)
  })

  it("rejects requests with clock skew > 120s (401)", () => {
    const now = Date.now()
    // 121 seconds in the past
    const reqPast = mockProvider.createSignedRequest(
      { callId: "call_sec_03", type: "CALL_START" },
      { timestampMs: now - 121_000 },
    )
    expect(mockProvider.verifyRequest(reqPast).valid).toBe(false)
    expect(mockProvider.verifyRequest(reqPast).reason).toContain(
      "Clock skew exceeds",
    )

    // 121 seconds in the future
    const reqFuture = mockProvider.createSignedRequest(
      { callId: "call_sec_04", type: "CALL_START" },
      { timestampMs: now + 121_000 },
    )
    expect(mockProvider.verifyRequest(reqFuture).valid).toBe(false)
    expect(mockProvider.verifyRequest(reqFuture).reason).toContain(
      "Clock skew exceeds",
    )
  })

  it("accepts requests within allowed 120s clock skew", () => {
    const now = Date.now()
    const reqSkewOk = mockProvider.createSignedRequest(
      { callId: "call_sec_05", type: "CALL_START" },
      { timestampMs: now - 60_000 },
    )
    expect(mockProvider.verifyRequest(reqSkewOk).valid).toBe(true)
  })

  it("rejects replay attacks using the same nonce within 10-minute TTL (409)", async () => {
    const fixedNonce = "unique-nonce-fixed-12345"
    const req = mockProvider.createSignedRequest(
      { callId: "call_sec_06", type: "CALL_START" },
      { nonce: fixedNonce },
    )

    // First presentation: valid
    const res1 = await bridge.handleWebhookRequest("mock", req)
    expect(res1.statusCode).toBe(200)

    // Replay attempt: rejected with 409 Conflict
    const res2 = await bridge.handleWebhookRequest("mock", req)
    expect(res2.statusCode).toBe(409)
    const err = JSON.parse(res2.body) as { error: string }
    expect(err.error).toContain("Replay detected")
  })

  it("ensures real phone numbers are masked and never logged", () => {
    expect(redactPhoneNumber("+447911123456")).toBe("***-***-3456")
    expect(redactPhoneNumber("0501234567")).toBe("***-***-4567")
    expect(redactPhoneNumber("123")).toBe("[REDACTED_PHONE]")
    expect(redactPhoneNumber(null)).toBe("[ANONYMOUS]")
  })
})

// =========================================================================
// Yemot API Translator & Carrier Safety Guards
// =========================================================================
describe("Yemot type=api Translator & Security Policy", () => {
  beforeEach(resetHarness)

  it("fails closed when real Yemot carrier is disabled (default)", () => {
    const translator = new YemotApiTranslator({
      allowUnverifiedCarrier: false,
    })
    expect(translator.isEnabled).toBe(false)

    const result = translator.verifyRequest({
      method: "GET",
      url: "/api/telephony/yemot",
      headers: {},
      query: { ApiCallId: "yemot_01" },
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("DISABLED")
  })

  it("correctly parses Yemot GET callback parameters and redacts phone number", () => {
    const translator = new YemotApiTranslator()
    const callback = translator.parseCallback({
      method: "GET",
      url: "/api/telephony/yemot",
      headers: { "user-agent": "yemot-core-api/1.0" },
      query: {
        ApiCallId: "call_999",
        ApiPhone: "0521234567",
        ApiDID: "0770000000",
        pin: "123456",
      },
    })

    expect(callback.apiCallId).toBe("call_999")
    expect(callback.apiPhoneMasked).toBe("***-***-4567")
    expect(callback.digits).toBe("123456")
    expect(callback.isHangup).toBe(false)
  })

  it("correctly parses Yemot POST hangup callback", () => {
    const translator = new YemotApiTranslator()
    const callback = translator.parseCallback({
      method: "POST",
      url: "/api/telephony/yemot",
      headers: {},
      query: {},
      body: {
        ApiCallId: "call_888",
        hangup: "yes",
        ApiHangupExtension: "1",
      },
    })

    expect(callback.apiCallId).toBe("call_888")
    expect(callback.isHangup).toBe(true)
  })

  it("formats Yemot read prompt directives according to specification", () => {
    const prompt = YemotApiTranslator.formatReadPrompt(
      "Please enter PIN",
      "pin",
      6,
      6,
      15,
    )
    expect(prompt).toBe("read=t-Please enter PIN=pin,,6,6,Digits,yes,15")

    const hangup = YemotApiTranslator.formatHangup()
    expect(hangup).toBe("hangup")
  })
})

// =========================================================================
// PHONE01: Simulator Joins Via Real Authenticated Razzia Flow
// =========================================================================
describe("PHONE01: Valid Participant Join Flow", () => {
  beforeEach(resetHarness)

  it("authenticates via /auth/session -> /games/join -> socket login -> SUCCESS_JOIN", async () => {
    const gamePin = "482910"
    transport.registerGame({
      gameId: "game_phone01",
      inviteCode: gamePin,
      gameMode: QUIZZ_MODES.QUIZ,
    })

    const simulator = new KeypadSimulatorCore(bridge)

    // 1. Call starts: prompts for PIN
    const startDir = await simulator.startCall()
    expect(startDir.type).toBe("read")
    expect(startDir.message).toContain("6-digit game PIN")

    // 2. Caller enters 6-digit PIN
    const joinDir = await simulator.enterDigits(gamePin)
    expect(joinDir.type).toBe("play")
    expect(joinDir.message).toContain("Connected as Phone 001")

    // 3. Verify session state in bridge
    const session = bridge.getSession(simulator.getState().callId)
    expect(session).toBeDefined()
    expect(session?.state).toBe("in_game")
    expect(session?.gameId).toBe("game_phone01")
    expect(session?.inviteCode).toBe(gamePin)
    expect(session?.username).toBe("Phone 001")

    // 4. Verify socket client state
    const client = bridge.getClient(simulator.getState().callId)
    expect(client).toBeDefined()
    expect(client?.getState().joined).toBe(true)
    expect(client?.getState().gameId).toBe("game_phone01")
  })
})

// =========================================================================
// PHONE02: DTMF Digit 1..4 Mapping During SELECT_ANSWER & Server Clock
// =========================================================================
describe("PHONE02: Digit 1..4 Accepted During SELECT_ANSWER Only", () => {
  beforeEach(resetHarness)

  it("maps 1..4 to 0..3, submits answer, and server clock is authoritative", async () => {
    const gamePin = "334455"
    transport.registerGame({
      gameId: "game_phone02",
      inviteCode: gamePin,
      gameMode: QUIZZ_MODES.QUIZ,
    })

    const simulator = new KeypadSimulatorCore(bridge)
    await simulator.startCall()
    await simulator.enterDigits(gamePin)

    // Pressing answer BEFORE question is active is rejected
    const earlyPress = await simulator.pressKey("2")
    expect(earlyPress.message).toContain("not being accepted")

    // Server starts question 1 (epoch 1) with 4 answers
    transport.startQuestion("game_phone02", {
      index: 0,
      epoch: 1,
      question: "What is the capital of the United Kingdom?",
      answers: ["Paris", "London", "Berlin", "Madrid"],
      questionType: QUESTION_TYPES.SINGLE,
    })

    // Caller presses key '2' (London, index 1)
    const answerDir = await simulator.pressKey("2")
    expect(answerDir.type).toBe("play")
    expect(answerDir.message).toContain("Answer 2 submitted")

    // Verify answer was received by mock server
    const recorded = transport.getRecordedAnswers()
    expect(recorded.length).toBe(1)
    expect(recorded[0].gameId).toBe("game_phone02")
    expect(recorded[0].epoch).toBe(1)
    // 0-based index for '2'
    expect(recorded[0].answerKeys).toEqual([1])
    expect(recorded[0].serverReceivedAt).toBeGreaterThan(0)
  })

  it("maps digits 1, 2, 3, 4, 5 correctly to indices 0, 1, 2, 3, 4", () => {
    expect(mapDtmfToAnswerIndex("1")).toBe(0)
    expect(mapDtmfToAnswerIndex("2")).toBe(1)
    expect(mapDtmfToAnswerIndex("3")).toBe(2)
    expect(mapDtmfToAnswerIndex("4")).toBe(3)
    expect(mapDtmfToAnswerIndex("5")).toBe(4)
    expect(mapDtmfToAnswerIndex("6")).toBeNull()
    expect(mapDtmfToAnswerIndex("0")).toBeNull()
    expect(mapDtmfToAnswerIndex("*")).toBeNull()
    expect(mapDtmfToAnswerIndex("#")).toBeNull()
  })
})

// =========================================================================
// PHONE03: Duplicate, Replay, Stale Epoch & Out-of-Window
// =========================================================================
describe("PHONE03: Duplicate, Stale Epoch & Idempotency", () => {
  beforeEach(resetHarness)

  it("rejects duplicate answer submissions in the same epoch", async () => {
    const gamePin = "556677"
    transport.registerGame({
      gameId: "game_phone03",
      inviteCode: gamePin,
      gameMode: QUIZZ_MODES.QUIZ,
    })

    const simulator = new KeypadSimulatorCore(bridge)
    await simulator.startCall()
    await simulator.enterDigits(gamePin)

    // Start question epoch 10
    transport.startQuestion("game_phone03", {
      index: 1,
      epoch: 10,
      question: "Choose option 1-4",
      answers: ["A", "B", "C", "D"],
      questionType: QUESTION_TYPES.SINGLE,
    })

    // First answer: Accepted (Index 2)
    const dir1 = await simulator.pressKey("3")
    expect(dir1.message).toContain("Answer 3 submitted")
    expect(transport.getRecordedAnswers().length).toBe(1)

    // Second answer in same epoch: Rejected by idempotency check
    const dir2 = await simulator.pressKey("1")
    expect(dir2.message).toContain("already been recorded")
    // No extra answer recorded
    expect(transport.getRecordedAnswers().length).toBe(1)
  })

  it("rejects answers after results are revealed (out-of-window)", async () => {
    const gamePin = "556678"
    transport.registerGame({
      gameId: "game_phone03b",
      inviteCode: gamePin,
      gameMode: QUIZZ_MODES.QUIZ,
    })

    const simulator = new KeypadSimulatorCore(bridge)
    await simulator.startCall()
    await simulator.enterDigits(gamePin)

    transport.startQuestion("game_phone03b", {
      index: 0,
      epoch: 1,
      question: "Question",
      answers: ["A", "B", "C", "D"],
      questionType: QUESTION_TYPES.SINGLE,
    })

    // Results revealed: question closes
    transport.showResults("game_phone03b")

    // Submitting now is rejected
    const dir = await simulator.pressKey("1")
    expect(dir.message).toContain("not being accepted")
    expect(transport.getRecordedAnswers().length).toBe(0)
  })
})

// =========================================================================
// PHONE04: Unsupported Question Types (Survey, Multi, Estimation, >4 Options)
// =========================================================================
describe("PHONE04: Unsupported Question Types Handling", () => {
  beforeEach(resetHarness)

  it("rejects multi-choice questions with informative phone prompt", () => {
    const check = isQuestionSupportedOnPstn(
      QUIZZ_MODES.QUIZ,
      QUESTION_TYPES.MULTI,
      4,
    )
    expect(check.supported).toBe(false)
    expect(check.reason).toContain("Multiple-selection")
  })

  it("rejects estimation questions with informative phone prompt", () => {
    const check = isQuestionSupportedOnPstn(
      QUIZZ_MODES.QUIZ,
      QUESTION_TYPES.ESTIMATION,
      4,
    )
    expect(check.supported).toBe(false)
    expect(check.reason).toContain("Estimation")
  })

  it("supports single-choice survey questions with <= 5 answer options", () => {
    const check = isQuestionSupportedOnPstn(
      QUIZZ_MODES.SURVEY,
      QUESTION_TYPES.SINGLE,
      5,
    )
    expect(check.supported).toBe(true)
  })

  it("rejects multi-choice survey questions with informative phone prompt", () => {
    const check = isQuestionSupportedOnPstn(
      QUIZZ_MODES.SURVEY,
      QUESTION_TYPES.MULTI,
      4,
    )
    expect(check.supported).toBe(false)
    expect(check.reason).toContain("Only single-choice survey questions are supported")
  })

  it("rejects questions with >5 answer options", () => {
    const check = isQuestionSupportedOnPstn(
      QUIZZ_MODES.QUIZ,
      QUESTION_TYPES.SINGLE,
      6,
    )
    expect(check.supported).toBe(false)
    expect(check.reason).toContain("exceed telephone keypad limit of 5")
  })

  it("delivers informative prompt to caller without affecting web clients", async () => {
    const gamePin = "778899"
    transport.registerGame({
      gameId: "game_phone04",
      inviteCode: gamePin,
      gameMode: QUIZZ_MODES.QUIZ,
    })

    const simulator = new KeypadSimulatorCore(bridge)
    await simulator.startCall()
    await simulator.enterDigits(gamePin)

    // Start multi-choice question
    transport.startQuestion("game_phone04", {
      index: 0,
      epoch: 5,
      question: "Select all that apply",
      answers: ["A", "B", "C", "D"],
      questionType: QUESTION_TYPES.MULTI,
    })

    // Caller presses '1'
    const dir = await simulator.pressKey("1")
    expect(dir.type).toBe("play")
    expect(dir.message).toContain(
      "Multiple-selection questions are not supported",
    )
    expect(transport.getRecordedAnswers().length).toBe(0)
  })
})

// =========================================================================
// PHONE05: PIN Validation, Reconnect, Hangup & Cross-Room Isolation
// =========================================================================
describe("PHONE05: PIN Validation, Hangup & Cross-Room Isolation", () => {
  beforeEach(resetHarness)

  it("validates strict 6-digit PIN format", () => {
    expect(isValidPin("123456")).toBe(true)
    expect(isValidPin("000000")).toBe(true)
    // 5 digits
    expect(isValidPin("12345")).toBe(false)
    // 7 digits
    expect(isValidPin("1234567")).toBe(false)
    // Letter
    expect(isValidPin("12345a")).toBe(false)
    // Letters
    expect(isValidPin("abcdef")).toBe(false)
  })

  it("prompts for retry when non-existent 6-digit PIN is entered", async () => {
    const simulator = new KeypadSimulatorCore(bridge)
    await simulator.startCall()

    // Enter unknown PIN 999999
    const dir = await simulator.enterDigits("999999")
    expect(dir.type).toBe("read")
    expect(dir.message).toContain("Could not find a game")

    // Session remains in collecting_pin state
    const session = bridge.getSession(simulator.getState().callId)
    expect(session?.state).toBe("collecting_pin")
  })

  it("cleans up session and disconnects socket on hangup", async () => {
    const gamePin = "112233"
    transport.registerGame({
      gameId: "game_phone05",
      inviteCode: gamePin,
    })

    const simulator = new KeypadSimulatorCore(bridge)
    await simulator.startCall()
    await simulator.enterDigits(gamePin)

    expect(bridge.getActiveSessionsCount()).toBe(1)
    const { callId } = simulator.getState()
    const client = bridge.getClient(callId)
    expect(client?.isConnected()).toBe(true)

    // Caller hangs up
    await simulator.hangup()

    // Session removed and socket disconnected
    expect(bridge.getActiveSessionsCount()).toBe(0)
    expect(client?.isConnected()).toBe(false)
  })

  it("enforces cross-room isolation between different games", async () => {
    // Room 1
    transport.registerGame({
      gameId: "game_room_1",
      inviteCode: "111111",
    })
    // Room 2
    transport.registerGame({
      gameId: "game_room_2",
      inviteCode: "222222",
    })

    const sim1 = new KeypadSimulatorCore(bridge, { callId: "sim_room_1" })
    const sim2 = new KeypadSimulatorCore(bridge, { callId: "sim_room_2" })

    await sim1.startCall()
    await sim1.enterDigits("111111")

    await sim2.startCall()
    await sim2.enterDigits("222222")

    // Start question in Room 1 only
    transport.startQuestion("game_room_1", {
      index: 0,
      epoch: 1,
      question: "Room 1 Question",
      answers: ["A", "B", "C", "D"],
      questionType: QUESTION_TYPES.SINGLE,
    })

    // Sim 1 answers in Room 1 -> Accepted
    await sim1.pressKey("1")
    // Sim 2 attempts to answer -> Rejected (Room 2 has no active question)
    const sim2Dir = await sim2.pressKey("1")
    expect(sim2Dir.message).toContain("not being accepted")

    const answers = transport.getRecordedAnswers()
    expect(answers.length).toBe(1)
    expect(answers[0].gameId).toBe("game_room_1")
  })
})

// =========================================================================
// Rate Limiting & 1000 Session Capacity Cap
// =========================================================================
describe("Rate Limiting & 1000 Session Capacity Cap", () => {
  beforeEach(resetHarness)

  it("throttles DTMF input exceeding 10 digits per second per call", async () => {
    const simulator = new KeypadSimulatorCore(bridge)
    await simulator.startCall()

    // Send 10 digits rapidly sequentially without await-in-loop
    let chain = Promise.resolve<TelephonyDirective>({ type: "noop" })

    for (let i = 0; i < 10; i += 1) {
      chain = chain.then(() => simulator.pressKey("1"))
    }
    await chain

    // 11th digit in the same second window is throttled
    const throttled = await simulator.pressKey("1")
    expect(throttled.type).toBe("noop")
  })

  it("rejects new calls when local session cap of 1000 is reached", async () => {
    const smallCapBridge = new TelephonyBridge({
      transport,
      provider: mockProvider,
      // Set small cap to test boundary
      maxSessions: 3,
    })

    // Create 3 sessions in parallel
    const sims = Array.from(
      { length: 3 },
      (_, idx) =>
        new KeypadSimulatorCore(smallCapBridge, {
          callId: `call_cap_${idx + 1}`,
        }),
    )

    await Promise.all(sims.map((sim) => sim.startCall()))
    expect(smallCapBridge.getActiveSessionsCount()).toBe(3)

    // 4th call exceeds capacity
    const sim4 = new KeypadSimulatorCore(smallCapBridge, {
      callId: "call_cap_4",
    })
    const dir = await sim4.startCall()
    expect(dir.type).toBe("play")
    expect(dir.message).toContain("System capacity reached")
    expect(smallCapBridge.getActiveSessionsCount()).toBe(3)
  })
})

// =========================================================================
// PHONE06: 100 Synthetic Concurrent Phone Participants Load Test
// =========================================================================
describe("PHONE06: 100 Synthetic Concurrent Participants Load Test", () => {
  beforeEach(resetHarness)

  it("handles 100 concurrent participants with zero failures and measures p50/p95 latency", async () => {
    const gamePin = "987654"
    const gameId = "game_load_100"
    transport.registerGame({
      gameId,
      inviteCode: gamePin,
      gameMode: QUIZZ_MODES.QUIZ,
    })

    const PARTICIPANT_COUNT = 100
    const simulators: KeypadSimulatorCore[] = []

    // Phase 1: 100 participants join concurrently
    const joinStart = performance.now()
    const joinPromises = Array.from(
      { length: PARTICIPANT_COUNT },
      async (_, i) => {
        const sim = new KeypadSimulatorCore(bridge, {
          callId: `load_caller_${String(i + 1).padStart(3, "0")}`,
        })
        simulators.push(sim)
        await sim.startCall(`07700000${String(i).padStart(4, "0")}`)

        return sim.enterDigits(gamePin)
      },
    )

    const joinResults = await Promise.all(joinPromises)
    const joinElapsed = performance.now() - joinStart

    // Verify all 100 joined successfully
    const joinFailures = joinResults.filter(
      (r) => !r.message?.includes("Connected as Phone"),
    )
    expect(joinFailures.length).toBe(0)
    expect(bridge.getActiveSessionsCount()).toBe(PARTICIPANT_COUNT)

    // Phase 2: Host starts question
    transport.startQuestion(gameId, {
      index: 0,
      epoch: 1,
      question: "Concurrent Load Question 1",
      answers: ["Red", "Blue", "Green", "Yellow"],
      questionType: QUESTION_TYPES.SINGLE,
    })

    // Phase 3: All 100 participants submit answers concurrently
    const answerDurations: number[] = []
    const answerStart = performance.now()

    // Distribute across keys 1..4
    const answerPromises = simulators.map(async (sim, idx) => {
      const key = String((idx % 4) + 1)
      const t0 = performance.now()
      const dir = await sim.pressKey(key)
      const t1 = performance.now()
      answerDurations.push(t1 - t0)

      return dir
    })

    const answerResults = await Promise.all(answerPromises)
    const totalAnswerElapsed = performance.now() - answerStart

    // Verify all 100 answers succeeded
    const answerFailures = answerResults.filter(
      (r) => !r.message?.includes("submitted"),
    )
    expect(answerFailures.length).toBe(0)

    const recordedAnswers = transport.getRecordedAnswers()
    expect(recordedAnswers.length).toBe(PARTICIPANT_COUNT)

    // Calculate latency metrics: min, max, mean, p50, p95, p99
    answerDurations.sort((a, b) => a - b)
    const [min] = answerDurations
    const sum = answerDurations.reduce((acc, v) => acc + v, 0)
    const mean = sum / answerDurations.length
    const p50 = answerDurations[Math.floor(answerDurations.length * 0.5)]
    const p95 = answerDurations[Math.floor(answerDurations.length * 0.95)]
    const p99 = answerDurations[Math.floor(answerDurations.length * 0.99)]

    console.log("=== PHONE06 100 CONCURRENT PARTICIPANTS METRICS ===")
    console.log(`Join total time: ${joinElapsed.toFixed(2)} ms`)
    console.log(`Answer total time: ${totalAnswerElapsed.toFixed(2)} ms`)
    console.log(`Participants: ${PARTICIPANT_COUNT}`)
    console.log(`Failures: 0 (0.00%)`)
    console.log(`Latency min: ${min.toFixed(2)} ms`)
    console.log(`Latency mean: ${mean.toFixed(2)} ms`)
    console.log(`Latency p50: ${p50.toFixed(2)} ms`)
    console.log(`Latency p95: ${p95.toFixed(2)} ms`)
    console.log(`Latency p99: ${p99.toFixed(2)} ms`)
    console.log("==================================================")

    // Assertions on performance and stability
    expect(answerFailures.length).toBe(0)
    // All in-memory simulated answer submissions under 100ms
    expect(p95).toBeLessThan(100)
  })
})
