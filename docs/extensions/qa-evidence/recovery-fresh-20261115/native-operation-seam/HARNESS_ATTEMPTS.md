# Preserved harness and static attempts

Initial frozen-baseline assembly rejected the JavaScript Unicode flag on esbuild's Go-regex onLoad filter. Removing that filter flag assembled the exact old C1 module without any product edit or install. First baseline execution incorrectly failed at file level because the fixture did not await the promise-returning real withAccount; baseline-results.log retains that async rejection. Corrected baseline-r2 executes the actual missing optional-seam assertion:0PASS/1FAIL. Neither provisioning/async result is reported as application success.

Candidate-r2 executed10/10PASS; candidate-r3 expanded13/13PASS. Candidate-final expanded14/14PASS. Fixture callback and generic account-helper type corrections emitted identical executable bytes (test-type-qualified-bridge.json); the first two TS failures remain in their own logs. Candidate-tenant-final added mandatory native tenant-scope guards and executed15/15PASS. Candidate-complete-final strengthens full native+sidecar deletion after prior edits and executes15/15PASS again. The extra execution is justified by the new deletion assertion. Every earlier result and prepared bundle is retained under its true label.

Initial source lint diagnostics are retained; new modules were corrected without changing legacy code or suppressing rules. Final new-module lint0, source+test types0 and formatting0. Whole creation-reservation lint remains1 with193 diagnostics on unchanged original lines, zero on added/modified lines; this is not a full-file lint pass.

The first receipt-analysis attempt assumed an explicit null error field, but JSON.stringify omits undefined. It stopped with KeyError:error before issuing any final verification; the corrected analyzer uses get(error) and verifies the unchanged raw receipts. No test was rerun for this parser issue.

All runtime work is local existing WSL Ubuntu Node26.11.1/Linux6.18, persistent ext4 temporary fixtures; esbuild0.28.2 emits targetnode24 with187 recorded input hashes. This is not pinned Oracle Node24 execution, hardware power-loss proof or real F grant/consent-ledger acceptance. F owns and verifies those authorization/consumer concerns.
