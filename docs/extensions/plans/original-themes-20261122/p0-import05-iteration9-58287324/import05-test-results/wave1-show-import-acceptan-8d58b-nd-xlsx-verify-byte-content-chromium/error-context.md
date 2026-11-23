# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: wave1-show-import-acceptance.spec.ts >> TADA Studio Show Import/Export Acceptance (JSON + Excel) >> IMPORT05: Import valid show with Hebrew note and per-question interlude, save in editor, reload, export .tada.json and .xlsx, verify byte content
- Location: tests/wave1-show-import-acceptance.spec.ts:337:3

# Error details

```
Error: ENOENT: no such file or directory, open '/evidence/runtime/packages/e2e/test-results/show-import-acceptance/temp_import05.tada.json'
```

# Test source

```ts
  366 |         await page.getByTestId("editor-panel-toggle-timeline").click()
  367 |       }
  368 | 
  369 |       await expect(timeline).toBeVisible()
  370 |       const card = timeline.getByTestId("editor-scene-card").filter({
  371 |         has: page.getByRole("button", { name: title, exact: true }),
  372 |       })
  373 |       await expect(card).toHaveCount(1)
  374 |       await card.getByTestId("editor-scene-select").click()
  375 |       await closeEditorDrawer()
  376 |       const edit = page.getByTestId("editor-panel-edit")
  377 | 
  378 |       if (!(await edit.isVisible())) {
  379 |         await page.getByTestId("editor-panel-toggle-edit").click()
  380 |       }
  381 | 
  382 |       await expect(edit).toBeVisible()
  383 |       await expect(edit.getByTestId("answer-recap-settings")).toBeVisible()
  384 | 
  385 |       return edit
  386 |     }
  387 | 
  388 |     const quizInterlude = {
  389 |       kind: "title" as const,
  390 |       title: "מעברון שאלת בונוס",
  391 |       durationMs: 4000,
  392 |       advance: "auto" as const,
  393 |     }
  394 |     const surveyInterlude = {
  395 |       kind: "video" as const,
  396 |       title: "קליפ סקר קהל",
  397 |       url: "https://example.com/media/survey-clip.mp4",
  398 |       durationMs: 7000,
  399 |       advance: "manual" as const,
  400 |     }
  401 | 
  402 |     const syntheticShow: TadaShowV1 = {
  403 |       format: "tada-show",
  404 |       version: 1,
  405 |       title: "מופע טריוויה וסקר חי בעברית",
  406 |       note: hebrewNote,
  407 |       baseGameMode: "quiz",
  408 |       defaults: {
  409 |         newQuestionMode: "quiz",
  410 |         leaderboardPolicy: "cardOnly",
  411 |         advanceMode: "auto",
  412 |       },
  413 |       cards: [
  414 |         {
  415 |           key: "Q01",
  416 |           kind: "quiz",
  417 |           questionType: "single",
  418 |           question: "מהו ההר הגבוה ביותר בעולם?",
  419 |           category: "גאוגרפיה",
  420 |           timeSeconds: 20,
  421 |           cooldownSeconds: 3,
  422 |           maxPoints: 1000,
  423 |           penalty: 0,
  424 |           answers: [
  425 |             { text: "אוורסט", display: "text" },
  426 |             { text: "קילימנג'רו", display: "text" },
  427 |           ],
  428 |           correctAnswers: [1],
  429 |           interlude: quizInterlude,
  430 |         },
  431 |         {
  432 |           key: "POLL01",
  433 |           kind: "survey",
  434 |           questionType: "single",
  435 |           question: "איזה סגנון מוזיקה מועדף עליכם?",
  436 |           category: "מוזיקה",
  437 |           timeSeconds: 15,
  438 |           cooldownSeconds: 3,
  439 |           maxPoints: 0,
  440 |           penalty: 0,
  441 |           answers: [{ text: "פופ" }, { text: "רוק" }],
  442 |           interlude: surveyInterlude,
  443 |         },
  444 |         {
  445 |           key: "RECAP01",
  446 |           kind: "answerRecap",
  447 |           title: recapTitle,
  448 |           subtitle: recapSubtitle,
  449 |           startQuestionKey: "Q01",
  450 |           mode: "correctAnswer",
  451 |           durationMs: 6000,
  452 |           advance: "manual",
  453 |         },
  454 |       ],
  455 |       settings: [
  456 |         {
  457 |           scope: "leaderboard",
  458 |           targetKey: "show",
  459 |           property: "mode",
  460 |           valueJson: "selected",
  461 |         },
  462 |       ],
  463 |     }
  464 | 
  465 |     const tmpJsonFile = join(SCREENSHOT_DIR, "temp_import05.tada.json")
> 466 |     fs.writeFileSync(
      |        ^ Error: ENOENT: no such file or directory, open '/evidence/runtime/packages/e2e/test-results/show-import-acceptance/temp_import05.tada.json'
  467 |       tmpJsonFile,
  468 |       JSON.stringify(syntheticShow, null, 2),
  469 |       "utf-8",
  470 |     )
  471 | 
  472 |     // 1. Upload valid .tada.json
  473 |     const fileInput = page.getByTestId("import-file-input")
  474 |     await fileInput.setInputFiles(tmpJsonFile)
  475 | 
  476 |     const dialog = page.getByTestId("show-import-dialog")
  477 |     await expect(dialog).toBeVisible()
  478 |     await expect(dialog).toContainText("מופע טריוויה וסקר חי בעברית")
  479 | 
  480 |     // 2. Commit Import
  481 |     await page.getByTestId("show-import-commit").click()
  482 | 
  483 |     // 3. Navigate to editor
  484 |     await expect(page).toHaveURL(/\/manager\/quizz\/[a-zA-Z0-9_-]+$/u)
  485 |     await expect(page.getByTestId("editor-save-btn")).toBeVisible()
  486 |     const importedQuizId = new URL(page.url()).pathname.split("/").at(-1)
  487 |     expect(importedQuizId).toBeTruthy()
  488 |     await saveScreenshot(page, "08_import05_show_editor_1280.png")
  489 | 
  490 |     // 4. Edit real recap text, save, and reopen the same stored show.
  491 |     const recapEdit = await openRecapEditor(recapTitle)
  492 |     const subtitlePlaceholder = t(
  493 |       "extensions:studio.scene.subtitlePlaceholder",
  494 |       {
  495 |         defaultValue: "Card description or subtitle...",
  496 |       },
  497 |     )
  498 |     await expect(recapEdit.getByTestId("scene-title-input")).toHaveValue(
  499 |       recapTitle,
  500 |     )
  501 |     await expect(
  502 |       recapEdit.getByPlaceholder(subtitlePlaceholder, { exact: true }),
  503 |     ).toHaveValue(recapSubtitle)
  504 |     await recapEdit.getByTestId("scene-title-input").fill(savedRecapTitle)
  505 |     await recapEdit
  506 |       .getByPlaceholder(subtitlePlaceholder, { exact: true })
  507 |       .fill(savedRecapSubtitle)
  508 |     await closeEditorDrawer()
  509 |     await page.getByTestId("editor-save-btn").click()
  510 |     await expect(page).toHaveURL(/\/manager\/config$/u)
  511 |     await page.goto(`/manager/quizz/${importedQuizId}`)
  512 |     const reopenedRecap = await openRecapEditor(savedRecapTitle)
  513 |     await expect(reopenedRecap.getByTestId("scene-title-input")).toHaveValue(
  514 |       savedRecapTitle,
  515 |     )
  516 |     await expect(
  517 |       reopenedRecap.getByPlaceholder(subtitlePlaceholder, { exact: true }),
  518 |     ).toHaveValue(savedRecapSubtitle)
  519 |     await closeEditorDrawer()
  520 |     await page.goto("/manager/config")
  521 |     await page
  522 |       .getByRole("button", { name: t("manager:tabs.quizz"), exact: true })
  523 |       .click()
  524 | 
  525 |     // 5. Export as .tada.json and verify byte content
  526 |     const exportTadaJsonBtn = page.getByTestId(
  527 |       `export-tada-json-${importedQuizId}`,
  528 |     )
  529 |     await expect(exportTadaJsonBtn).toHaveCount(1)
  530 |     await expect(exportTadaJsonBtn).toBeVisible()
  531 | 
  532 |     const jsonDownloadPromise = page.waitForEvent("download")
  533 |     await exportTadaJsonBtn.click()
  534 |     const jsonDownload = await jsonDownloadPromise
  535 | 
  536 |     const jsonStream = await jsonDownload.createReadStream()
  537 |     const jsonChunks: Buffer[] = []
  538 | 
  539 |     if (jsonStream) {
  540 |       for await (const chunk of jsonStream) {
  541 |         jsonChunks.push(Buffer.from(chunk as Uint8Array))
  542 |       }
  543 |     }
  544 | 
  545 |     const downloadedJson = JSON.parse(
  546 |       Buffer.concat(jsonChunks).toString("utf-8"),
  547 |     ) as Omit<TadaShowV1, "cards"> & {
  548 |       cards: [AuthoredQuizCard, AuthoredSurveyCard, AuthoredAnswerRecapCard]
  549 |     }
  550 |     expect(downloadedJson.format).toBe("tada-show")
  551 |     expect(downloadedJson.title).toBe("מופע טריוויה וסקר חי בעברית")
  552 |     expect(downloadedJson.note).toBe(hebrewNote)
  553 |     expect(downloadedJson.cards).toHaveLength(3)
  554 | 
  555 |     const { 0: downloadedQ1 } = downloadedJson.cards
  556 |     expect(downloadedQ1.interlude).toEqual(quizInterlude)
  557 | 
  558 |     const { 1: downloadedSurvey } = downloadedJson.cards
  559 |     expect(downloadedSurvey.interlude).toEqual(surveyInterlude)
  560 |     expect(downloadedJson.cards[2]).toMatchObject({
  561 |       kind: "answerRecap",
  562 |       title: savedRecapTitle,
  563 |       subtitle: savedRecapSubtitle,
  564 |     })
  565 | 
  566 |     // 6. Export as .xlsx and verify byte content
```