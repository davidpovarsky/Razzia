Checkpoint, 17 November 2026: NOT_READY.

The prior immutable c4125d58a746 native Linux packet passed13/13 HTTP checks,
focused types/lint/format and site build. Its old-container browser launch
failed. A fresh bounded, network-none container then ran both browser engines
and exposed six real UI failures: the native consent pathname displayed404.
Receipts and all1669 verified source hashes are preserved beside this directory.
The first fresh-container setup failure (runc /proc bind refusal) is also retained.

This change registers the missing downstream route behind the existing default-
off flag and allows only its exact local54-character, query/hash-free login
return target. It also preserves the existing100 MiB +64 KiB native media body
cap using bounded streaming rather than generic16 MiB buffering. Two media
requests may run concurrently; generic requests retain their independent cap.
Native authorization can reject an incomplete upload before body completion.

Local verification of this source: Windows native16/16 PASS (including8 TCP
checks and explicit Windows POSIX/C1 refusal); return-target9/9 PASS; focused
types, lint and format PASS. TCP tests streamed the exact media cap, accepted
chunked17 MiB, refused declared/chunked generic and media overflow, checked
pre-body refusal and third-upload backpressure. The initial overflow test used
fetch while continuing a rejected declared upload and observed ECONNRESET;
the declared-overflow assertion now sends headers only over TCP and requires
the actual413 response. Chunked overflow still sends real streamed payloads.

pnpm ui:check attempted dependency repair and correctly refused the shared
node_modules junction; no install proceeded. The three exact UI script stages
were run directly and passed. Freeze remains the historical23 mismatches;
the protected packages/editor delta from34cfd464 is empty. No broad TS147
baseline closure, full-show qualification, installed ChatGPT proof or production
deployment is claimed. Native Linux/browser qualification must run on the next
immutable commit; its source hashes and acceptance remain separate from c412.

Owner approved cleanup only of this agent's temporary failed copies after
preserving logs, manifests and source in Git. Preserved Cezar worktrees and
customer data remain out of scope. Shared Git metadata writes and existing SSH
work in danger-full-access; the effective approval policy is still never.
