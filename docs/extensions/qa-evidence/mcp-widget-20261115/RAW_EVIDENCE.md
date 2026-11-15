# Raw evidence byte preservation

The source-only `git diff --check` passes for G's widget and QA code. The broad
check including raw Windows tool output does not pass: retained CRLF and
formatter/terminal trailing spaces are reported as whitespace errors. These
logs are raw evidence and are not normalized to manufacture a clean result.
The existing root lint configuration explicitly excludes qa-evidence artifacts.
Formatting/lint PASS claims in this packet apply to maintained G source only.

The failed source/fixture/type/lint attempts remain in the evidence commit;
only the named final-current logs and matching input receipts support current
PASS claims. The original evidence commit is
`0cc7f5974fe8c3224a23596f1bb54a921d5df6b5`.
