# TADAZZ show audio refresh — 8 November 2026

`tadazz-silky-transition-20261108.mp3` adapts SFXMint's **Light Silky Fabric Swoosh49**:
- Source: https://sfxmint.com/sounds/transition-swoosh-49
- Download: https://sfxmint.com/dl/transition-swoosh-49.mp3
- License: CC0 1.0, https://sfxmint.com/license
- Source SHA256: `702b837540b02bb7c6e4ec544f465a7da9d0f56cec1aaebc31b0925e88c78bdb`.
- Adaptation: trim initial silence/end to0.7s,160Hz high-pass/4kHz low-pass, -20LUFS target/-3dBTP,25ms fade-in/220ms fade-out. Served locally; no third-party requests during play.
- Adapted SHA256: `4c3c0a5b880c5a1eae787c3895fae6a4cab4b4b7538eadb3b0b66955ce87e104`.

`tadazz-reveal-bright-20261108.mp3`, `tadazz-confirm-20261108.mp3` and `tadazz-timer-{tick,urgent,final}-20261108.mp3` are original procedural sound designs created for this project, without third-party samples. Rounded sine tones with a quiet second harmonic and tapered envelopes prevent hard clicks. Reveal is a1.1s G-major arpeggio/chord (196–784Hz); timer advances from659Hz to784Hz and a final880/988Hz double pulse, one cue per remaining second. MP3 mono44.1kHz/192kbps, peak below -2dBFS. The original reveal remains available as a rollback asset; the new reveal measures mean -13.9dBFS against the old asset's -33.2dBFS, with explicit cue gain and temporary background ducking.

Reproduction source: `work/audio-refresh/make-sounds.py` (local working evidence). All six new files are part of the app public assets. Original legacy Razzia audio/catalog files remain unchanged.
