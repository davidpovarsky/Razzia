# Participants localization scope — 2026-11-18

Browser audit 02-participants-desktop showed English roster UI under Hebrew despite existing Hebrew translations. StudioParticipantsPage forwards unqualified roster.* keys into the default common namespace. Correct that wiring; reuse existing extension roster strings in all nine languages.

Within RosterSection, localize remaining validation/import diagnostics and Actions, associate visible field labels with inputs, label the invite-only checkbox, and use logical search/table alignment. Isolate phone values and user-entered mixed-script names without changing roster storage, import/export format, caller matching, or admission behavior. Add missing error keys to all nine extension locale dictionaries with actual translations. Known import parser diagnostics may be translated at the presentation boundary while preserving the core result contract and existing tests. Keep filename and phone data untouched.

Validation: existing roster parser/editor tests, locale key parity, unchanged web typecheck, and the sibling browser rerun. Root owns integrated build and visual approval evidence. Changes remain uncommitted for root integration.
