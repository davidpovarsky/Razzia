# Focused validation — Paddle policy preparation

Base: `142c178de33737b6fdfff87fefa466fe6652363d`.
Branch: `codex/tadazz-paddle-policy-prep-20261124`.
Validation date: 24 November 2026 (UTC).

## Recorded results and remaining gate

| Check                                               | Result                                            | Scope                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy publication and existing metadata unit tests | Historical 28/28 passed; final-head check pending | Complete/draft/partial bundles, approval and dates, unfinished text, contact URL injection, duplicate anchors, routes and clean canonical URLs |
| Typed lint                                          | 0 errors, 0 warnings                              | Six changed TypeScript/TSX source and test files, 233 project rules                                                                            |
| Browser                                             | 22 assertion groups passed, zero page errors      | Actual policy components, SiteLink, TanStack router and ReferenceCanvas with synthetic approved content; Chromium, 1440 and 390 pixels         |
| Browser harness lint                                | 0 errors, 0 warnings                              | Standalone reproducible check script                                                                                                           |
| Repository formatter                                | Passed                                            | All ten supported changed files; two documentation JSON files excluded by the repository ignore rules                                          |
| Visual review                                       | Passed                                            | Desktop and phone Terms screenshots inspected; readable wrapping, hierarchy, spacing and links                                                 |

The browser checks covered direct policy URLs, plain-text rendering, English
language/direction, horizontal overflow, client-side footer navigation, title and
canonical URL, Back, refresh, Refund rendering inside an RTL shell, and no policy
links/pages for the actual unpublished configuration.

This was isolated component/integration acceptance with an explicitly synthetic
approved fixture. It was not a production test, full MarketingSite acceptance,
Paddle checkout, real commercial approval or LIVE activation. No messages were sent.

## Evidence on the development host

Directory:
`/mnt/development/projects/diagnostics/tadazz-paddle-policy-prep-20261124`.

| File                         | SHA256                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| `unit-results.json`          | `25478d681e7b71d2b2b21b5a7a7750e916875143b7dfafb2e5090602196638da` |
| `lint-final.log`             | `f3bfb0a4b8f670cb069e63894653b8c38eb1330cad384f7f7853d50677f56f40` |
| `browser-result.json`        | `225402a19604eab915c7fbbbdf02ef2efa5f1ca5901acc1239621e9256c28c28` |
| `terms-1440.png`             | `cf8e4e3705ccd5112b74c264b20c7400efe89aa87f93acff3faedf160f362833` |
| `terms-390.png`              | `079fb0e5c1d214559cec0da30b5a528aadda9194d20ec4fa44c81227b866811b` |
| `refunds-rtl-shell-1440.png` | `57672a44eb8b0ac3e6fe925275d7336479661542ab56090ca7dcd0292fe7000b` |
| `refunds-rtl-shell-390.png`  | `fd2244659d3ff5290ee49d6263ac90b1de332dcc65c13871a70473211fc84b06` |

`source-map.json` in the same directory records the final source file hashes.
Raw initial failures remain in `lint-initial.log` and
`browser-harness-lint.log`. The first source lint reported four style findings
and unresolved imports caused by the deliberately sparse checkout. Those style
findings were fixed; exact base-commit source dependencies were hydrated (about
12.7 MB) and the focused typed check passed. No gameplay source was changed.
The harness style findings were fixed without dropping assertions.

The 28-case unit run started at 00:34:00.478 UTC on 24 November 2026, using base
142c178 plus the uncommitted policy patch. It preceded four lint fixes within the
unit dependency closure: one property-read-to-destructuring change and two blank
lines before continue in `legal-policies.ts`, and a nested-ternary-to-if rewrite in
`site-metadata-policy.ts`. No complete source snapshot or input-hash manifest from
that run was retained. The 00:51 `source-map.json` records the later precommit
source, so it does not establish exact final-source unit acceptance. The existing
28/28 receipt is preserved as historical evidence. B owns one required focused
28-case run on the final combined head, with a new source-pinned receipt, before
this unit gate is closed.

The browser ran after those product source fixes. After the browser pass, only the reusable harness's formatting,
sequential viewport function extraction and temporary-directory placement changed;
its assertion set/order and the tested product source remained unchanged.

## Final formatter gate and evidence equivalence

The final repository Prettier check used the existing dependency checkout,
the committed `.prettierrc.json` and `.prettierignore`, and the twelve files
changed by `afa20359b7a117820b22d93fc8c23ccdd274829f`. The two documentation
JSON files are excluded by the repository's existing
`docs/extensions/**/*.json` ignore rule.

The initial check reported only this validation document's Markdown table
alignment. All product TypeScript/TSX/CSS, test code, the browser harness and
the README already passed. This follow-up adds the missing result here and
applies Prettier only to this document; the same bounded final check then passed.

Receipts in the existing evidence directory:

- `format-final-initial.json` and `format-final-initial.log`: original command,
  base commit, file hashes and the single reported formatting failure.
- `format-final.json` and `format-final.log`: successful final check using the
  same repository configuration and file list.
- `format-equivalence.json`: original and final SHA256 hashes for all twelve
  files. Every file other than this validation document is byte-identical to
  `afa20359`.

The original `source-map.json`, unit, lint, browser and screenshot receipts remain
unchanged. The formatter follow-up changes no product, test or harness bytes
relative to `afa20359`. That later byte equivalence does not establish the earlier
unit-run inputs; the historical 28/28 result still requires the final-head check
described above. This documentation-only correction does not change browser inputs.

## Reproduction

Use the project's existing Node and dependencies; no install is needed on the
current development host. The unit receipt was produced by a focused Vitest config
containing only `legal-policies.test.ts` and `metadata-policy.test.ts`.

For the browser check:

```sh
node docs/extensions/plans/paddle-live-20261124/verify-policy-browser.mjs \
  /absolute/path/to/checkout \
  /absolute/path/to/existing/dependency-checkout \
  /mnt/development/path/to/owned/evidence
```

The script uses the existing Playwright browser cache under
`/mnt/development/tooling/tadazz/ms-playwright`. Profiles and temporary files
are directed to the owned evidence directory. It opens one page at a time,
listens only on loopback, and closes both browser and server when it finishes.
The generated fixture and screenshots are not business policies.

The full application release/build/production checks remain with the release owner.
Actual owner-approved policy content and Paddle LIVE setup remain outstanding.
