# GGO integration regression — final handoff

**PASS:** the unchanged canonical `extensions/qa/phase2/great-guessoff-cta-balanced-results.smoke.mjs` passed against the production-composed `extensions/qa/billing-public.vite.config.ts` fixture on ports 4412/4413, using existing Node 24.22.1 and installed Edge. No product files were edited for this integration run.

## Final receipt

`20261119T172039Z-d4b213df/run.json`

Supporting evidence: `smoke.stdout.log`, empty `smoke.stderr.log`, `warmup.json`, `fixture.json`, `product-before.json`, `product-after.json`, `cleanup.json`, and `executed-runner.py` inside that directory.

The canonical smoke passed:

- The complete five-question GGO flow, including selection, correct survey/quiz results headings, the intervening leaderboard, and finale.
- Header, hero and catalogue entry points all opening the actual GGO demo route and opening screen.
- Desktop result geometry for all five questions: visible/in-panel headings and text, no heading/question overlap, cards below the question panel, four cards, no duplicate result labels on the cards. Measured result heading font was 31px and question font was 54px in every question.
- Mobile menu entry and mobile result heading/duplicate-label assertions at 390×844. Desktop used 1366×900.
- No browser page errors (`errors: []`).

The single bounded warmup loaded the actual homepage and fonts in 6.697 seconds. It recorded zero request failures, HTTP errors, page errors, console errors, and active requests at readiness. It did not replace or relax any canonical smoke assertion.

## Preserved first failure

`20261119T171325Z-1a8574ec/run.json` remains a separate **FAIL** receipt. The initial cold-Vite run timed out at the first `page.goto(..., networkidle)` after 30 seconds, before smoke assertions. Its Vite log records cold dependency scanning/bundling following a 26-second startup. The failed stdout/stderr, web/API logs, source hashes and exact-PID cleanup remain intact. The later pass does not erase or relabel this failure.

## Integrity and cleanup

Pre/post SHA-256 maps matched for **1,287 tracked product/config/QA files** in the successful run. Combined hash:

`a52432b74702ec89dad31e2feb173dc6830d55f1c0536db1144db5379a8c0093`

All recorded owned browser-runner, warmup, Vite and API process PIDs stopped. The unique synthetic configuration directory and temporary fixture/warmup files were removed. Provider network was disabled by the existing synthetic fixture. The fixture-only source adaptation was exactly `server.listen(4393, "127.0.0.1")` → `server.listen(4413, "127.0.0.1")`; canonical fixture, Vite config and smoke files stayed unchanged.

Screenshots are under `20261119T172039Z-d4b213df/qa/phase2/`: `ggo-balanced-result-0.png`, `ggo-balanced-result-1.png`, `ggo-balanced-result-mobile.png`, and `ggo-warmup-homepage.png`.

No further tests, source changes, deployment, commit or push were performed by this integration worker after acceptance. Browser capacity was released immediately to the MCP worker for its required WebKit run.
