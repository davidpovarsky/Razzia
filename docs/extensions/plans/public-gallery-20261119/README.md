# Public games and shared themes — 19 November 2026

## Owner request

Populate the entire Tadazz example gallery with real, attractive games for
adults, children, families, organisations and schools. Connect preview, play,
selection, copying and editing. Themes must belong to the platform and be
available to every account. Update Asana after each completed stage. All
application tests and browser checks must run on Linux against the server,
never on the Windows workstation.

## Scope and implementation

The feature branch is `codex/tadazz-public-gallery-20261119`, based on unified
commit `34a9e0a59482fa035ab98338f7c977589e46287d`. The initial live server was
application revision `34568c5c937a51d236a440513adeb9bf93637525` on
`https://tadazz.com`.

- One source-controlled catalogue supplies marketing, Studio Explore, public
  preview and authenticated installation: `public-demo-catalogue.ts`.
- Ten examples contain 77 question/poll rounds, plus authored opening,
  transition, recap/leaderboard and closing cards.
- Nine new declarative themes are bundled in the existing shared registry;
  Classic and Razzia remain available, for eleven total built-in themes.
- Native preview and the native stage remain the rendering authority. No
  alternative rendering engine or fake gameplay screenshot was introduced.
- All nine new solo samples use the production stage adapter and actual
  selections. Polls show only the visitor's own choice; no audience vote is
  invented. Great Guess-off retains its existing player, with its five rounds
  and eight image answers mirrored in the public authored source.
- Theme artwork is original source-controlled geometry. Twenty-two PNGs and
  their SVG sources were generated on Linux. Their sizes and SHA-256 digests
  are recorded in `gallery-assets.json`.
- `GET /api/extensions/catalogue` lists public metadata. Existing
  `/api/extensions/preview/public/:id` now resolves every catalogue entry.
- `POST /api/extensions/catalogue/:id/install` requires manager authentication
  and uses the account-scoped native composite importer. Each account receives
  independent native IDs. A per-account receipt reopens the existing copy
  without replacing customer edits; deleting that copy permits a new import.
- Use this game opens preparation for the installed ID; Customise opens its
  native editor. Login preserves the exact selected public product without
  performing any automatic account write.

## Availability correction

Initial live checks found the general inline preview flag enabled, but the
separate public preview flag absent. Consequently even the old public `quiz`
endpoint returned 404. The curated source-controlled gallery is now enabled
with inline preview unless the public flag is explicitly `false`; explicit
`true` remains supported. This does not expose any account-owned game or
media. No production credential or runtime environment change is required.

## Catalogue

| ID | Game | Rounds | Bundled theme |
|---|---|---:|---|
| great-guessoff | The Great Guess-off | 5 | Tadazz Classic |
| crowd | The Crowd Decides | 8 | Electric Social |
| quiz | The Big Quiz | 8 | Midnight Club |
| story | Story Sparks | 8 | Storybook Grove |
| picture | Picture Perfect | 8 | Colour Pop |
| truth | Fact or Fiction | 8 | Curiosity Lab |
| finale | The Grand Finale | 8 | Golden Hour |
| family | Family Fiesta | 8 | Family Fiesta |
| classroom | Classroom Quest | 8 | Discovery Lab |
| team | Team Together | 8 | Team Together |

The sample questions are authored in English and can be edited after copying.
Platform controls and theme names/descriptions support the existing nine
locales, including Hebrew.

## Acceptance and evidence

The initial isolated Linux checks passed 78 focused tests in seven files,
two socket catalogue tests, extension and web application type checks, and
the real-account HTTP lifecycle. The latter imported all ten examples,
resolved their account previews, denied cross-account reads, preserved title
and theme edits on repeat installation, and kept public masters unchanged.

The live host/spectator/player path was also reviewed: saved V2 defaults flow
through room creation into each role's shared registry. Bundled themes require
no account installation record. Native responsive player controls and the
platform opening remain governed by the existing application.

Immutable release qualification, real-browser acceptance and deployed-site
verification are still pending in this entry. The final revision and release
receipts must be recorded before treating this as a deployment-success claim.

Required focused coverage includes exact public theme resolution for every
sample, valid authored/imported content, image/hash validation, all eleven
themes selectable in the editor, authentication and per-account isolation,
idempotent repeated clicks, preserved customer edits, recreated deleted copies,
login return selection, all gallery actions, native solo play, responsive/RTL
layout and saved/reopened theme selections.

## Asana tracking

- Parent: `1220715020934323`
- Mapping: `1220715022022615`
- Content/themes: `1220715020510940`
- Wiring: `1220715135562763`
- Deployment/server QA: `1220715161506165`
- Evidence/handoff: `1220714837706281`

Parent URL: https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1220715020934323
