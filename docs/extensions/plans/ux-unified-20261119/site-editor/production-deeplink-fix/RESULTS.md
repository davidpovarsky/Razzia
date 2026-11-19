# Production editor deep-link cycle regression

## Failure and cause

The qualified Linux native-consent browser run `tadazz-codex-browser-6656dc33e4f1-08db5949` failed its happy path in Chromium and WebKit on the saved editor deep-link before the Save button mounted. The trace reported `Cannot read properties of undefined (reading 'single')` / `undefined is not an object (evaluating 'Ua.single')`. The source run was `tadazz-codex-6656dc33e4f1-4f6648fc`.

The compiled full-site chunk read `QUESTION_PRESENTATIONS.single` while evaluating `QUESTION_REGISTRY` before the presentation registry had initialized. The cycle was `questions/presentation -> SingleAnswers -> game/utils/constants -> states/Answers -> questions/index -> questions/presentation`. The isolated renderer had already mapped constants to the pure answer-style module and therefore did not exhibit the full-site failure.

## Repair

Five leaf components now import answer styling directly from `game/utils/answer-style`: SingleAnswers, MultiAnswers, SinglePicker, MultiPicker and PhotoCardGrid. SingleAnswers reads the theme context from its direct module; PhotoCardGrid imports pure poll-ranking and stage-fit directly instead of the broad presentation barrel. There are no JSX, state or styling changes. The presentation registry no longer has a runtime import path back to the editor registry.

## Verification

- Focused typed lint on all five changed files: PASS, 0 warnings/errors.
- Web TypeScript project: PASS.
- Complete Vite production site build: PASS into an isolated output directory.
- Existing Linux renderer cache artifacts were restored into ignored local dist only after SHA-256 and size matched the committed application-preview-build manifest. The current native site source was freshly compiled. No generated manifest was changed by this verification.
- Headless Edge ran the actual bundled HTML at preview port4371 and an isolated real native backend at4372; `built-document-entry.json` confirms the /assets entry and absence of Vite dev runtime.
- Seven browser groups PASS: actual question/answer editing; compact drawer persistence/focus; nested media dialog; timeline/new question/new scene; theme/backdrop; actual POST201 save and fresh deep-link reopen plus PUT200 update and second fresh reopen; RTL320.
- The browser reported no page errors. Only optional fixture404 endpoints /branding/theme.json and /api/themes/catalog occurred. No live customer data, live game room or email send was used.
- The native smoke helper's RTL measurement was run from an ignored copy with an explicit wait for visible question-live-preview and canvas-stage. This prevents measuring the lazy production preview before mounting. All original semantic, geometry, focus and persistence assertions remained intact.
- This focused Windows proof does not replace the final Linux OAuth/native-consent six-case Chromium/WebKit release gate.

## Saved synthetic fixture

{
  "label": "actual-composite-save-reload",
  "quizId": "ETe9VIGm1ezZfIJO_2RHJ",
  "createStatus": 201,
  "updateStatus": 200,
  "questions": 2,
  "scenes": 1,
  "theme": "razzia-original",
  "background": "url(\"http://127.0.0.1:4371/assets/background-CMjhDDHd.png\")"
}

## Evidence

Clean final browser receipt, production build receipt, built entry/source hashes and two screenshots accompany this file. The earlier readiness-race run is not included as a passing receipt.

## Cleanup

Only the owned preview/backend processes PID33328/25696 were stopped after verifying exact command lines and listening-port ownership. A separate read confirmed both processes absent and ports4371/4372 closed.
