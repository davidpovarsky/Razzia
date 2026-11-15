# Two documented public audio sources

This is a later read-only addendum to the local observation committed at `91c1b9b`. The original local-only observations and Asana note remain historical and unchanged.

On 15 November 2026, the two exact public source pages identify [Light Silky Fabric Swoosh 49](https://sfxmint.com/sounds/transition-swoosh-49) and [Soft Bell-Like Notification Chime 46](https://sfxmint.com/sounds/ui-chime-46) as CC0 1.0. The [current SFXMint license page](https://sfxmint.com/license) distinguishes the public library from private sounds made with credits. These observations are specific to those public pages; they do not establish a blanket grant for private generations or unrelated media.

`audit_public_audio_sources.py` made two bounded anonymous HTTPS GETs and hashed the MP3 responses in memory. Both returned HTTP 200 / audio/mpeg. Transition source: 33,061 bytes, SHA256 `702b837540b02bb7c6e4ec544f465a7da9d0f56cec1aaebc31b0925e88c78bdb`. Chime source: 17,179 bytes, SHA256 `0b72fb267433cd114d24dadbe661c731fa4d5c94d99c7d2dd3c63e6c8dcc5e3d`. Both exactly match their respective existing repository notices. `public-source-bytes.json` records the actual response metadata and hashes; no remote audio file was saved or played, and no credential was used.

This narrows two source-provenance gaps. It does not reproduce the adaptation commands, recover historical license archives, establish rights for the other audio/video/images or five embedded Lottie PNGs, verify font tarball/CAFS membership, or install runtime/export authority. The separate soft-reveal adaptation remains outside the two current native manifests. Original tasks remain OPEN; no product code, media, manifest, rights enum, pin or readiness changed. No accepted suite was rerun.
