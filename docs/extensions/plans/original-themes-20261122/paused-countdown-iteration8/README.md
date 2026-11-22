# Paused countdown diagnostic — iteration 8 setup failure

This diagnostic failed before creating the late display or making countdown
observations. It does not establish a product failure or a release acceptance.

Candidate checkpoint: 7c6057aeee58459787dc771fe1abbffd80819579
Sentinel job: job_5cc2990d9a15
Browser duration: 72.54 seconds
Source tree digest before/after: fa80ca868e921eac4ce5678c0b263505f67398a308431881b5e4d38b4cf88823

The host reached the voting/countdown presentation and the server acknowledged
pause=true. The diagnostic incorrectly asserted that the server envelope phase
would be 'voting'. The observed phase was 'question', matching the actual
server contract: STATUS.SELECT_ANSWER maps to extension phase 'question';
the presentation maps that same status to kind 'voting'. EXTENSION_PHASES
contains no 'voting' value.

No late-display checks or screenshots were reached. The transfer-only probe
was corrected to assert exact server phase 'question' for the fresh iteration8b
rerun. All visibility, millisecond-remainder, pause, and same-clock resume
assertions remain unchanged. No product source was changed for this correction.

Source, SDK cache, and probe hashes matched before/after; the owned container
stopped successfully. No network, production/customer mounts, config/account/
authentication temporary data, or source mutations were used or copied.
