# Opt-in proxy scoped qualification

Exact SHA `b20a199ee4806e5f1ff38984e400b5f50bcf526d` passed:

- Native HTTP16/16 on isolated Linux,12.259s; focused types/lint/format PASS.
- Real TLS Nginx1/1,5.386s, in a fresh bounded no-network container using the
  existing production image417cc204da57. The exact new route include ran with
  the actual protected service and real generated loopback TLS credentials.
- All1675 source hashes unchanged; both scoped proxy files match the same
  immutable source packet. The second receipt's exactSourceSha equals b20a199.

Receipts: `tadazz-codex-b20a199ee480-7900303b/receipt.json` and
`tadazz-codex-proxy-b20a199ee480-1436fd9c/receipt.json`.
The new include proxies machine/discovery and consent routes before SPA
fallback, preserving JSON errors, JWKS,401 challenges and HTML/HEAD policy.
The test's native API fallback is only a fixture; this does not replace the
separate real browser/save/reopen acceptance at3741f5f.

This is an opt-in, unmounted production artifact. No live domain, DNS, running
production container, customer mount or credential changed. A production entry
point/configuration, full-show Widget, final combined security/QA SHA, verified
backup/rollback and real private-host installation/E2E still remain.
