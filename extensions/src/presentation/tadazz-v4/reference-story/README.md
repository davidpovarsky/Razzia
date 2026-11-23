# Native seating and story stages

Faithful React/CSS ports of the three HTML references supplied by the user on
8 November 2026. The HTML files are reference inputs, not runtime documents.
There is no iframe, HTML injection, sample-card fallback, preview toolbar,
global keyboard handler, or second game-state owner.

- `SeatingPlan.tsx` / `seating-layout.ts`: the exact 31-table geometry and brand
  colours. Names, connections, dial number, PIN and QR come from the live game.
  Connected tables are read-only; clicking cannot simulate presence.
- `mixer-markup.tsx`, `mixer-renderer.ts`: React card composition and the supplied
  60-second escape / mischief / vortex / return / final-count choreography.
- `reveal-markup.tsx`, `reveal-renderer.ts`: the supplied overlapping 5.6-second
  curtains / book / emblem / picture-fan reveal, then a 120-second story clock.
- `story-clock.ts`: the authoritative server origin and frozen pause snapshot.
  Timers resume at the current position on refresh; they never advance gameplay
  from the browser. The story holds at zero until the host advances.
- Existing presenter audio ownership handles the two supplied embedded audio
  tracks, volume, mute, pause, autoplay and phase cleanup. Story speech time is
  silent. No duplicate WebAudio ping generator is copied from the demo.

The mathematical renderer functions retain their source equations and use
scoped refs created by React. Reduced motion retains clock timing while showing
settled cards/book. Painting pauses with the show and is capped at 60 fps.

Two integration corrections preserve live data: the round badge replaces the
bitmap's fixed `ROUND 02`, and opaque versions of the supplied matte layers
cover sample pictures/text baked into that bitmap. Only the game's actual five
winning choices appear. Missing votes retain empty, localized placeholders.

Source SHA-256:

| Supplied file                          | SHA-256                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| TADAZZ_Story_Mixer_Clean.html          | d2f3f7f9ccf5063a25c53e95a07bfcae8b262b419b4f909e778c259594a001e3 |
| TADAZZ_Story_Reveal_FAST.html          | f0665c32c87982ab88bac34d0b3b5240f624382d3b5b685ccbc18e76e7527e6b |
| TADAZZ_Seating_Plan_Brand_Colours.html | e25b39172e0a548303bf97744105b1fddaf96949cf896c9f651f55135cb27c85 |

Six artwork/audio files are extracted under `packages/web/public/tadazz-show/story/`.
These are user-supplied assets; no additional third-party licence is asserted.
The demo's five sample choice images are not shipped.
