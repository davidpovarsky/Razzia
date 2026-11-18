# Packet3 source-only staging receipt

On 15 November 2026, strict existing-key SSH transferred **768,019 file bytes** to the new packet3 source prefix in `README.md`. This comprises nine runtime members (759,149 bytes), one review delta (7,005 bytes) and the hash manifest (1,865 bytes). No archive was extracted and no fixture, namespace, evidence directory, container, preflight or test was created or executed.

All eleven files were read back with matching SHA-256, UID:GID 1001:1001 and mode 0400; source directory mode is 0700. The receiver confirmed existing read-only inputs were readable and the three old-profile result hashes matched. Available disk after transfer was 2,687,533,056 bytes; this is a staging observation, not a fresh runtime resource admission.

- `packet-hashes.json`: `5158038dd2d5b859a9e27c807b7280833f2b381b6a8ede21448ca2393464874d`
- `manifest.json`: `26e5f3280f3f848481e2014faf338e12a67351278493ad79b24a00fbd4dfaa15`
- `plan.json`: `f96282ec931b1e85967959106d5d7c6f81fd30279ca1f369d9b09b119fde90f4`
- `overlay.tar.gz`: `c27c9a47466cec7fca74273319215e653306080c8e616c0ef8be1af491a2155f`

Local static verification passed Python AST for five modules and JavaScript syntax for two scripts. All twenty regular archive files matched their manifest; eighteen non-observer source/test files and all five test records matched `e1fb1b2`. Nine archive directory entries are metadata, not additional source files. An initial audit incorrectly counted all tar members as regular files; the corrected check explicitly counts and verifies regular files.

Evidence beside this directory: `c1-transfer-packet3.py`, `c1-transfer-packet3-receipt.json`, `c1-transfer-packet3-static-checks.json` and the empty transport stderr log. The receiver performs input staging only and never invokes the runner or preflight.

Independent packet review and a fresh exact ROOT runtime grant remain pending. Original packet2 41 PASS / 7 FAIL and old-profile 37 passes remain unchanged; no new runtime pass is claimed. All three source tasks and the HQ task remain open.
