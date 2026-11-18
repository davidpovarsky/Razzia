# Evidence preservation

Application verification results are recorded in AUDIT_REPORT.md and linked machine receipts. Failed attempts remain separately labeled and do not count as passing verification.

Newly committed evidence text has line-ending and trailing-whitespace normalization only. Where bytes changed, the exact original output is preserved in an adjacent .log.raw.gz or .json.raw.gz file for machine output; foundation-evidence-plan.json records each original machine-output SHA-256. No assertions or result lines were removed.

Transient live-server logs, installation logs, unused diagnostics, private font renderer build outputs and Playwright trace ZIPs remain in the worktree but are excluded from this evidence commit. Active Asana reconciliation and subsequent agent work are committed separately.
