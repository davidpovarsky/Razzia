# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-appearance-stage-acceptance.spec.ts >> Tada Studio Complete: Media Library Reuse, Card Backgrounds, Audio, Staged Motion & Zero-Scroll Stage >> 2. Live Runtime & Zero-Scroll Stage Matrix (STAGE-P0) across 8 Viewports + Card Background + Single Audio + Staged Motion
- Location: tests/media-appearance-stage-acceptance.spec.ts:700:3

# Error details

```
Error: Reveal Hero Section @ 800x600_4_3: Element clipped by ancestor <div class="flex min-h-0 w-full flex-col items-center justify-center overflow-hidden my-0.5">: el[top=288.3, bottom=387.3] outside ancestor[top=307.8, bottom=451.5]

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e9]:
    - generic [ref=e10]:
      - generic:
        - generic:
          - generic:
            - img "TADAZZ!"
          - generic: ROUND 01 · QUESTION 01 / 2
          - generic:
            - generic: Round 1 Breakdown
            - generic: Question 1 with Custom Background & 5 Visual Options
          - generic:
            - button "01" [disabled]:
              - generic:
                - article:
                  - figure "Alpha Choice":
                    - generic:
                      - img "Alpha Landscape Visual"
                  - generic: 100%
                  - generic: AUDIENCE FAVOURITE
                - generic: "01"
            - button "02" [disabled]:
              - generic:
                - article:
                  - figure "Beta Choice":
                    - generic:
                      - img "Beta Portrait Visual"
                  - generic: 0%
                  - generic: AUDIENCE FAVOURITE
                - generic: "02"
            - button "03" [disabled]:
              - generic:
                - article:
                  - figure "Gamma Choice":
                    - generic:
                      - img "Gamma Square Visual"
                  - generic: 0%
                  - generic: AUDIENCE FAVOURITE
                - generic: "03"
            - button "04" [disabled]:
              - generic:
                - article:
                  - figure "Delta Choice":
                    - generic:
                      - img "Delta Landscape Visual"
                  - generic: 0%
                  - generic: AUDIENCE FAVOURITE
                - generic: "04"
            - button "05" [disabled]:
              - generic:
                - article:
                  - figure "Epsilon Choice":
                    - generic:
                      - img "Epsilon Square Visual"
                  - generic: 0%
                  - generic: AUDIENCE FAVOURITE
                - generic: "05"
          - generic: AUDIENCE RESULTS
    - status:
      - generic: "CONNECTED: 1"
```

# Test source

```ts
  350 |         const vw = window.innerWidth
  351 |         const vh = window.innerHeight
  352 | 
  353 |         // 1. Assert bounded inside viewport with 1.5px subpixel tolerance
  354 |         if (
  355 |           rect.top < -1.5 ||
  356 |           rect.left < -1.5 ||
  357 |           rect.bottom > vh + 1.5 ||
  358 |           rect.right > vw + 1.5
  359 |         ) {
  360 |           return {
  361 |             ok: false,
  362 |             error: `Element extends outside viewport bounds (${vw}x${vh}): top=${rect.top.toFixed(1)}, bottom=${rect.bottom.toFixed(1)}, left=${rect.left.toFixed(1)}, right=${rect.right.toFixed(1)}`,
  363 |           }
  364 |         }
  365 | 
  366 |         // 2. Walk clipping ancestors and assert element is not clipped by any overflow-hidden/clip container
  367 |         let ancestor = el.parentElement
  368 | 
  369 |         while (
  370 |           ancestor &&
  371 |           ancestor !== document.body &&
  372 |           ancestor !== document.documentElement
  373 |         ) {
  374 |           const aStyle = window.getComputedStyle(ancestor)
  375 |           const isClipping =
  376 |             aStyle.overflow !== "visible" ||
  377 |             aStyle.overflowX !== "visible" ||
  378 |             aStyle.overflowY !== "visible"
  379 | 
  380 |           if (isClipping) {
  381 |             const aRect = ancestor.getBoundingClientRect()
  382 |             const clippedTop = rect.top < aRect.top - 1.5
  383 |             const clippedBottom = rect.bottom > aRect.bottom + 1.5
  384 |             const clippedLeft = rect.left < aRect.left - 1.5
  385 |             const clippedRight = rect.right > aRect.right + 1.5
  386 | 
  387 |             if (clippedTop || clippedBottom || clippedLeft || clippedRight) {
  388 |               return {
  389 |                 ok: false,
  390 |                 error: `Element clipped by ancestor <${ancestor.tagName.toLowerCase()} class="${ancestor.className}">: el[top=${rect.top.toFixed(1)}, bottom=${rect.bottom.toFixed(1)}] outside ancestor[top=${aRect.top.toFixed(1)}, bottom=${aRect.bottom.toFixed(1)}]`,
  391 |               }
  392 |             }
  393 |           }
  394 | 
  395 |           ancestor = ancestor.parentElement
  396 |         }
  397 | 
  398 |         // 3. Optional image load assertion
  399 |         if (checkImg && el instanceof HTMLImageElement) {
  400 |           if (!el.complete || el.naturalWidth <= 0 || el.naturalHeight <= 0) {
  401 |             return {
  402 |               ok: false,
  403 |               error: `Image element failed to load or has 0 natural dimensions: src=${el.src}, complete=${el.complete}, naturalWidth=${el.naturalWidth}`,
  404 |             }
  405 |           }
  406 |         }
  407 | 
  408 |         // 4. Text completeness check: detect CSS line-clamp or overflow ellipsis cuts
  409 |         if (checkText) {
  410 |           const text = (el.textContent || "").trim()
  411 | 
  412 |           if (text.length > 0) {
  413 |             const clamp = style.webkitLineClamp
  414 | 
  415 |             if (clamp && clamp !== "none") {
  416 |               return {
  417 |                 ok: false,
  418 |                 error: `Element has -webkit-line-clamp: ${clamp} applied to text: "${text.slice(0, 30)}..."`,
  419 |               }
  420 |             }
  421 | 
  422 |             if (el.scrollHeight > el.clientHeight + 1.5) {
  423 |               return {
  424 |                 ok: false,
  425 |                 error: `Element text overflows vertically: scrollHeight (${el.scrollHeight}) > clientHeight (${el.clientHeight}) for text: "${text.slice(0, 40)}..."`,
  426 |               }
  427 |             }
  428 |           }
  429 |         }
  430 | 
  431 |         return {
  432 |           ok: true,
  433 |           bounds: {
  434 |             top: rect.top,
  435 |             left: rect.left,
  436 |             bottom: rect.bottom,
  437 |             right: rect.right,
  438 |             width: rect.width,
  439 |             height: rect.height,
  440 |           },
  441 |         }
  442 |       },
  443 |       {
  444 |         sel: selector,
  445 |         checkImg: options?.checkImageLoaded,
  446 |         checkText: options?.checkTextCompleteness ?? true,
  447 |       },
  448 |     )
  449 |     expect(result.ok, `${label}: ${result.error}`).toBe(true)
> 450 |   }).toPass({
      |      ^ Error: Reveal Hero Section @ 800x600_4_3: Element clipped by ancestor <div class="flex min-h-0 w-full flex-col items-center justify-center overflow-hidden my-0.5">: el[top=288.3, bottom=387.3] outside ancestor[top=307.8, bottom=451.5]
  451 |     timeout: 5000,
  452 |     intervals: [100, 250, 500],
  453 |   })
  454 | }
  455 | 
  456 | /**
  457 |  * P0-4: Asserts that an upper stage element does not vertically overlap a lower element.
  458 |  * Fail-closed: missing required selectors FAIL the test unless explicitly marked optional.
  459 |  */
  460 | /* oxlint-enable max-params */
  461 | /* oxlint-disable max-params -- Preserve the existing positional protocol/animation API; changing callers is outside this lint repair. */
  462 | const assertNoVerticalOverlap = async (
  463 |   page: Page,
  464 |   topSelector: string,
  465 |   bottomSelector: string,
  466 |   label: string,
  467 |   options?: {
  468 |     optional?: boolean
  469 |   },
  470 | ) => {
  471 |   const result = await page.evaluate(
  472 |     ({ topSel, bottomSel, isOptional }) => {
  473 |       const topEl = document.querySelector(topSel)
  474 |       const bottomEl = document.querySelector(bottomSel)
  475 | 
  476 |       if (!topEl || !bottomEl) {
  477 |         if (isOptional) {
  478 |           return {
  479 |             ok: true,
  480 |           }
  481 |         }
  482 | 
  483 |         return {
  484 |           ok: false,
  485 |           error: `Missing required element for overlap check: topEl(${topSel})=${Boolean(topEl)}, bottomEl(${bottomSel})=${Boolean(bottomEl)}`,
  486 |         }
  487 |       }
  488 | 
  489 |       const topRect = topEl.getBoundingClientRect()
  490 |       const bottomRect = bottomEl.getBoundingClientRect()
  491 |       const overlaps =
  492 |         topRect.bottom > bottomRect.top + 2 &&
  493 |         topRect.top < bottomRect.bottom - 2
  494 | 
  495 |       return {
  496 |         ok: !overlaps,
  497 |         topBottom: topRect.bottom,
  498 |         bottomTop: bottomRect.top,
  499 |       }
  500 |     },
  501 |     {
  502 |       topSel: topSelector,
  503 |       bottomSel: bottomSelector,
  504 |       isOptional: options?.optional ?? false,
  505 |     },
  506 |   )
  507 |   expect(
  508 |     result.ok,
  509 |     `${label}: ${result.error || `upper element bottom (${result.topBottom?.toFixed(1)}) overlaps lower element top (${result.bottomTop?.toFixed(1)})`}`,
  510 |   ).toBe(true)
  511 | }
  512 | /* oxlint-enable max-params */
  513 | test.describe("Tada Studio Complete: Media Library Reuse, Card Backgrounds, Audio, Staged Motion & Zero-Scroll Stage", () => {
  514 |   test("1. Studio Editor: Responsive Zero-Overflow (1280..320), Smart Convert Question->Scene, Per-Answer Visuals, Shared Media Library & Reference-Safe Delete", async ({
  515 |     page,
  516 |   }) => {
  517 |     await loginManager(page)
  518 |     await page.goto("/manager/quizz")
  519 |     const headerKinds = page.locator(
  520 |       '[data-testid="studio-card-type-bar"][data-embedded="false"]',
  521 |     )
  522 |     await expect(headerKinds).toBeVisible({ timeout: 15_000 })
  523 | 
  524 |     const editorWidths = [1280, 1024, 844, 768, 390, 320]
  525 |     for (const width of editorWidths) {
  526 |       await page.setViewportSize({ width, height: 800 })
  527 |       let kinds = headerKinds
  528 | 
  529 |       if (width < 1100) {
  530 |         await expect(headerKinds).toBeHidden()
  531 |         const editPanel = await openStudioPanel(page, "edit")
  532 |         kinds = editPanel.locator(
  533 |           '[data-testid="studio-card-type-bar"][data-embedded="true"]',
  534 |         )
  535 |       }
  536 | 
  537 |       await expect(kinds).toHaveCount(1)
  538 |       await expect(kinds).toBeVisible()
  539 |       await expect(kinds.getByRole("radio")).toHaveCount(2)
  540 |       await expect(kinds.getByRole("radio", { name: /Quiz/i })).toBeVisible()
  541 |       await expect(kinds.getByRole("radio", { name: /Survey/i })).toBeVisible()
  542 |       const overflow = await page.evaluate(() => ({
  543 |         scrollWidth: document.documentElement.scrollWidth,
  544 |         clientWidth: document.documentElement.clientWidth,
  545 |       }))
  546 |       expect(
  547 |         overflow.scrollWidth,
  548 |         `Editor horizontal overflow at width ${width}px`,
  549 |       ).toBeLessThanOrEqual(overflow.clientWidth + 1)
  550 |     }
```