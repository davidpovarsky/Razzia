# Site and native editor acceptance results

## Source and scope

Verified in `tadazz-ux-unified-20261119`, based on integration commit `5f28699` plus the subsequent uncommitted UI, focus, backdrop, toolbar and action-label fixes present at QA time. These records describe the tested working tree; release pinning, build and production checks are recorded separately by the release coordinator.

The assigned site changes cover Sort alignment/accessibility, TDS account/contact form controls, and Prepare show selection, request lifecycle, retry and browser-history recovery. Native editor acceptance covers the actual shared workspace/native stage, drawers, editing, theme backgrounds, RTL and persistence. No customer accounts, live rooms, player responses or real outgoing messages were used.

## Clean receipts

| Receipt                                                            | Result                                     | Coverage                                                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [site-receipt.json](site-receipt.json)                             | 7 groups passed; zero page errors          | Sort at 1440/768/390 px, contact fields, forgot/reset UI, history selection, room handoff return, cancellation/late response/duplicate protection, and loading Retry |
| [prepare-label-receipt.json](prepare-label-receipt.json)           | 1 focused group passed; zero page errors   | Empty, pending, cancelled-restored and acknowledged-restored action labels                                                                                           |
| [native-layout-receipt.json](native-layout-receipt.json)           | 12 groups passed; zero page errors         | Six viewports, both canvas ratios, four top tabs, drawers/focus, editing, media, timeline, theme and Hebrew RTL                                                      |
| [native-persistence-receipt.json](native-persistence-receipt.json) | 7 targeted groups passed; zero page errors | Interaction/focus, theme, actual create/update with fresh reload, and RTL; the six viewport groups were not repeated in this run                                     |

Native viewport coverage: 320×640, 390×844, 768×768, 1024×768, 1440×900 and 844×390. Both 16:9 and 4:3 stages fit their available canvas. Document and body dimensions stayed within the viewport. Participants, Settings and Launch also remained bounded. All five phase/aspect controls were fully visible at 320 and 390 px. Nested Media library Escape restored focus to its opener inside the drawer; the following Escape closed the drawer.

## Synthetic data and actual API boundaries

The site suite rendered the actual application and intercepted HTTP responses only. Its account, game list, forgot-password request, room responses and host destination were synthetic. It verifies the frontend behavior, not delivery of a real email or creation of a production room. Actual browser Back/Forward produced `pageshow.persisted: true`; a separate dispatched lifecycle case exercises the pending-request cancellation race. Contact sending remains explicitly unavailable; the contact control/style check does not claim delivery.

The native suite used the actual backend at local port 4372, actual manager authentication, native components and native stage renderer. Its dedicated fixture is `work/native-editor-ux-qa-20261119`. UI Save created quiz `oV8lO8T_SCpCwoMW2xAgD` with POST `/api/extensions/quizzes` returning 201. A fresh document load preserved two questions, their Blue/Green and Mercury/Venus answers, one Opening scene, `razzia-original` theme and its classroom backdrop. Editing Venus to Earth and saving with PUT `/api/extensions/quizzes/oV8lO8T_SCpCwoMW2xAgD` returned 200; another fresh document load retained Earth, the scene, theme and backdrop.

The actual theme-switch measurement changed from `tadazz-classic` and `/tadazz-show/motion/backdrop.webp` to `razzia-original` and `/src/assets/background.png`.

## Fixture exceptions and evidence

The empty native fixture returned optional 404 responses for `/branding/theme.json` and `/api/themes/catalog`. Built-in theme choices remained available. These are recorded in the receipts rather than hidden; no font/image access errors or JavaScript page errors occurred. The preserved receipts are the clean successful runs; intermediate failure screenshots were intentionally not copied.

Selected PNGs show the final 320 px workspace and drawer, desktop and landscape canvases, Hebrew RTL, the saved/reloaded editor, aligned desktop/mobile sorting, and contact/account fields. [evidence-manifest.json](evidence-manifest.json) records each source path, byte count and SHA-256 so the copied evidence can be checked.

## QA service cleanup

The two owned local QA servers were stopped after verifying exact command lines, creation timestamps and listening-port ownership: Vite PID 30188 on 4371 and backend PID 8616 on 4372. A separate read confirmed both processes and both listening sockets were absent after termination completed. No unrelated processes were signalled. See [qa-server-cleanup.json](qa-server-cleanup.json).
