# TADAZZ Agent Handoff

1. Read TADAZZ_UNIFIED_SITE_AGENT_PROMPT.md FIRST.
2. Both full, original and unmodified HTML design references are in reference/.
3. reference/design_assets/ and reference/screenshots/ contain supporting imagery/CSS and baseline screenshots.
4. existing-implementation/ is an informational snapshot of previous feature work, NOT source to overwrite the upstream Razzia packages/ tree with.
5. documentation/ includes project-specific architecture and source provenance; current repository instructions take precedence over historical files.
6. Implement TADAZZ UI in downstream extensions/ layers. Do not edit Razzia upstream without an explicitly approved minimal hook.
7. Keep the existing game editor unchanged visually; connect Create/Edit, management, persistence and account ownership, not a competing editor.
8. Do not merge, push or deploy to production without explicit owner approval.

Previously observed local feature branch: feat/tadazz-site-library-parity-20261110 at 08ddc42 (2026-11-10).
The branch may be LOCAL ONLY. Use the code snapshot/local worktree and reconcile with the current repository HEAD.
The HTMLs include demo state, sample pricing and mock events. Do not confuse them with real persisted data.
