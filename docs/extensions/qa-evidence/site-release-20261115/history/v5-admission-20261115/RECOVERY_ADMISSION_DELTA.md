# Recovery admission delta — source review candidate

The preceding `daba54` helper, tests, wrapper, design and receipt remain frozen
in `history/v4-io-20261115`. The working successor remains production-gated.
This note describes the proposed correction, not an independently reviewed or
tested release.

The embedded child's failure receipt now preserves the primary exception,
bounded exception context, failure-journal outcome and any secondary exception.
A failure during failure-journal write/fence or any chained exception cannot
qualify as benign interrupted journal. A single post-fence final-journal EINTR
is eligible only if the failure journal itself was successfully written and
fenced and there is no secondary or chained exception. Unknown provenance and
all other failures remain blocked.

For zero-exit receipts the hold remains `unclassified` until the requested
action, expected classification, both index pins, journal phase, target,
helper and manager lease have all been verified. A failed or malformed receipt
cannot make a later recovery eligible. The canonical closed-hold/refence and
production tmpfs readback remain unchanged.

The new targeted source-owner tests exercise the embedded exception handler
with an injected EINTR followed by EIO, check zero new coordinator exec
dispatch on retries, and compare a wrong success receipt with a fully valid
positive control. The test harness uses a real POSIX hold and substitutes the
Engine and fixture checks; it is not an actual disk EIO, a positive publish,
or independent QA. After the manager revised the resource gate, 17 targeted
Linux tests passed in an isolated 0.25 CPU/256 MiB, network-none container.
The two negative paths retained their holds and dispatched zero new execs;
benign EINTR and a fully valid success receipt were positive controls. The
underlying EIO and Engine outcomes were injected/mocked, not actual disk faults
or real publication. The previously reported 479875 positive fixture trial is
independent evidence for that earlier frozen helper, not this successor.
