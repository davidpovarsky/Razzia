# Native game language direction — 21 November 2026

The game already selected a scoped translation language, but its DOM inherited the editor document's direction. An English show opened from a Hebrew editor therefore reversed the card row and displayed final punctuation at the beginning of an English question.

The existing locale-selection and I18next cloning logic now lives in PresentationLocale. It supplies DOM lang and dir through a display:contents wrapper, so the show follows its language without changing the editor document or adding a layout box. The shared native question and result note use dir=auto for their authored text, matching the existing answer-caption behavior. Answer arrays, indices, numbers, votes and solution IDs are not transformed.

## Browser proof

- Actual native adapter, director, React/WAAPI stage and styles from immutable combined source a9bbb7703f329487a3b9ef6623a415d49bf94aa1, source run tadazz-codex-a9bbb7703f32-fa381e57.
- The baseline extracts the existing provider-only locale scope from that source's TadazzShowView, adapting only its props/content binding to host the actual native stage. The candidate uses the actual new PresentationLocale and shared native components.tsx.
- Exact run: /home/ubuntu/tadazz-native-language-36d31499. The owned container was stopped. No production room, customer-data mount, external request or altered animation clock was used.
- Baseline: 16 of 21 checks passed, with five English card-order/punctuation failures.
- Candidate: 21 of 21 checks passed.
- Covers three and five English answers, Hebrew questions/card order, English text within a Hebrew game, actual glyph positions, answer selection/correct-index binding and persistent question DOM identity through answers and results.
- The document stays Hebrew RTL while the English show becomes LTR.
- Qualification raw SHA-256: 6f0a906bebe35523b76a83d48dcbbd6823dcab4c95bf754c68698f6c67100b8d.
- Fixture SHA-256: 93deb5dcf797bafac01591271cf67e6c5e2e3ee462927ec7b3ac868661b8b7a1.
- Shared native question component SHA-256: b3c13ce4ec82010589679b4dc814abe665e46a0ada98d550deeb80adcacee757.
- Locale boundary SHA-256: 995e062bd0241a37c182941f0111b947b38041418455d063c1a5c299fe8f997c.

The English and Hebrew images are actual screenshots from the passing browser fixture. The unchanged a9bbb source includes global default artwork removal. This scoped proof does not replace integrated release gates or exercise production phone calls.
