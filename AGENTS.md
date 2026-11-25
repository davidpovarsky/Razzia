# Tadazz Gameshow — current working instructions

## Standing owner authorization — 19 November 2026

The owner explicitly authorizes development, source and documentation edits,
reads, commands, builds, tests, fixes, commits, pushes, branch integration and
production deployments throughout this project, including the editor and
`packages/**` when needed. Do the authorized work without asking for repeated
confirmation. This current instruction supersedes historical task freezes,
role assignments, single-agent limits and per-command or per-patch approval
requirements in older project documents.

## Working method

- Start from the latest verified unified Tadazz branch. Fetch and compare recent
  branch tips; preserve all existing work and resolve overlaps deliberately.
- Use isolated worktrees where practical, or explicit nonoverlapping file
  ownership when storage constraints make a shared worktree necessary.
- Preserve Razzia editor typography, native controls and behavior. Reuse the
  governed Tadazz platform UI for site, Studio and host chrome. Keep theme
  artwork and game content separate from platform-owned controls and intro.
- Reuse existing React components, backend contracts, persistence and test
  harnesses. Preserve account boundaries, authentication, secrets, user data,
  original game IDs, supported languages and legacy compatibility.
- Validate meaningful behavior on the actual candidate, including browser
  interactions for layout/navigation changes. Report failures honestly.
- Deploy a verified candidate with a backup and usable rollback path. Never
  expose credentials or destroy unrelated work. Technical service permissions
  and security controls still apply; this document does not bypass them.
- Update the relevant existing and new Asana tasks after each verified
  completion. Keep work open when required acceptance is still missing.

## Design references

Use `docs/extensions/DESIGN_LANGUAGE.md` for Razzia editor conventions and
`docs/extensions/plans/TDS_CATALOG.md` for shared platform components. Older
execution restrictions in those references are historical, while their
applicable design and product contracts remain useful.
