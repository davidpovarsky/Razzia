for (const theme of ["tadazz-classic", "razzia-original"]) {
  const response = await fetch(
    `${process.env.TADAZZ_QA_BASE}/qa/input-v2?theme=${theme}`,
  )

  if (!response.ok) {
    throw new Error(`V2 producer ${theme}: ${response.status}`)
  }

  const input = await response.json()

  if (
    input.inputVersion !== 2 ||
    input.themeBinding.theme.id !== theme ||
    Object.keys(input.themeBinding.slots).length !== 15
  ) {
    throw new Error("Wrong V2 producer shape")
  }

  process.stdout.write(`${theme}: genuine host-bound V2 input\n`)
}
