const base = new URL(process.env.TADAZZ_QA_BASE ?? "")
if (base.hostname !== "127.0.0.1" || base.protocol !== "http:")
  throw new Error("qa:loopback-required")
for (const playMode of ["quiz", "survey"])
  for (const questionType of ["single", "multi"])
    for (const answerCount of [2, 5]) {
      const query = new URLSearchParams({
        role: "spectator",
        locale: "en",
        phase: "results",
        question: "0",
        paused: "true",
        elapsed: "20000",
        playMode,
        questionType,
        answerCount: String(answerCount),
      })
      const response = await fetch(new URL(`/qa/frame?${query}`, base))
      if (response.status !== 200)
        throw new Error(
          `qa:frame-smoke-${playMode}-${questionType}-${answerCount}:${response.status}`,
        )
      const frame = await response.json()
      if (
        frame.question.mode !== playMode ||
        frame.question.type !== questionType ||
        frame.choices.length !== answerCount ||
        frame.seconds !== 20
      )
        throw new Error("qa:frame-smoke-mismatch")
    }
process.stdout.write("8/8 actual producer frame smoke cases passed\n")
