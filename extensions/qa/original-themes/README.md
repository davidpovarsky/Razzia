# Original theme acceptance

This is the additional acceptance gate for Royal Quiz, Neon Arcade, Retro TV,
Magic Storybook, Crystal Future, Carnival Pop, Sports Arena and Mystery Noir at
version `1.0.0`. It uses the real compiled `tadazz-original-stage`, native account
API, native editor, native room/player clients and the shared public viewer.
The existing engine, full-show, transport and legacy gallery gates remain
required; this suite does not replace them.

## Invocation

Run the focused unit file inside the existing isolated Linux source/dependency
environment, with the generated artwork/audio and immutable manifests present:

```sh
cd extensions
XDG_DATA_HOME=/tmp/tadazz-originals-vitest-data node /cleanup/node_modules/vitest/vitest.mjs run --config vitest.config.ts --configLoader runner --no-cache --maxWorkers 1 --no-file-parallelism src/core/show-themes/original-themes.test.ts
```

The working directory matches the extension config's `src/**/*.test.ts` include.
The runner config loader and disabled cache avoid writes to the read-only
dependency mount, including Vite's temporary bundled-config directory.
`XDG_DATA_HOME` supplies a writable isolated path for the API-token data initialized
by the imported native modules.

After a successful committed candidate native build, invoke the controller from
that exact repository revision:

```sh
python extensions/qa/original-themes/linux-browser-verify.py SOURCE_RUN
```

`SOURCE_RUN` is the existing `tadazz-codex-<12-character-SHA>-<8-character-run>`
receipt under `docs/extensions/plans/phase3-takeover-20261117`. The controller
requires both native site and native application preview builds to have passed.
It reuses the pinned Linux dependency/browser caches, mounts the exact candidate
read-only, creates a disposable native host with no external network, and checks
every source/cache hash before and after. It does not launch an application or
browser on the calling workstation.

The inner entry point is `account-verify.mjs`; it uses the existing
`phase3-native-consent` TLS, registration, mail-trap and native host helpers.
Registration email never leaves the isolated fixture. Its writes affect only
newly created accounts, copies and rooms in its temporary configuration root.

## Coverage

| Gate                          | Evidence                                                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eight immutable manifests     | Exact IDs/version/renderer, all 15 visual slots, all 16 audio events, nine complete localization maps, finite compiled renderer admission and actual byte/hash checks for every asset                                                          |
| Theme semantics               | Manager/player/spectator audio isolation, declared silent variants and mute, preserved custom recording and role mute, unknown-version fallback without overwriting stored selection, an eight-theme scope-history round trip                  |
| Catalogue/account integration | Exact 18-game inventory, unchanged legacy 77 questions, new total 125; all eight native installs and saved selections; anonymous install and cross-account read denial; unchanged public masters                                               |
| Real editor                   | All eight choices exposed; a full theme-switch/save/reload round trip; identical native content, question identities, timeline, scenes, card settings and saved audio; archived theme overrides restored                                       |
| Public shows                  | All six rounds of every original in normal motion, three authored checkpoints and two interludes, truthful one-player scoreboards, selected answer state, finale and replay                                                                    |
| Question continuity           | Existing `question-sequence-verify.mjs`, unchanged timing thresholds, panel/heading identity, geometry, typography and entrance checks across question, voting and results; no early answers/timer                                             |
| Native gameplay               | Every family in reduced motion with 2, 3, 4 and 5 choices, all containing actual decoded answer images and text; five-choice question image; two real phone clients, wrong/selected and correct answers, 50/50 survey tie and zero-vote survey |
| Shared controls               | Same platform viewer control classes/typography across families; shared landscape viewer geometry; authoritative pause/resume, replay, confirmed previous and skip; replay clears prior votes                                                  |
| Locales/mobile                | All nine gallery locales and direction/overflow checks; a real reduced-motion Hebrew mobile vote for each family, accessible answer target and selected feedback                                                                               |
| Audio                         | Passive observation of real HTMLAudioElement playback; exactly one shared soundtrack owner, no simultaneous duplicate recording, no media errors, and fulfilled family recording playback in Chromium                                          |

The native matrices combine 14 answer images and one question image per family.
The public shows separately exercise the authored text-only rounds and Carnival's
picture round. Playback methods, clocks, votes, percentages and storage replies
are not replaced or fast-forwarded by this harness.

## Receipts and limits

The controller writes source-bound evidence under
`docs/extensions/plans/original-themes-20261122/tadazz-originals-...` and the
equivalent owned Linux evidence directory. Each family has question-sequence,
native audio and screenshot evidence. Failed assertions leave a failed receipt;
a running process, generated file or successful syntax parse is not acceptance.

`manualListeningPerformed` remains `false`. Automated decoding/playback and
ownership evidence does not establish subjective musical quality or a human
listening review. This harness uses Chromium; the existing full-show gate owns
the separate WebKit qualification. Production deployment is a separate action
after all applicable candidate gates pass.
