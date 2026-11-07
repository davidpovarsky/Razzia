# TADAZZ production release — 2026-11-07

## Deployment

- Public URL: `https://tadazz.com`
- Docker tag: `tadazz:p0-successor-20261106`
- Docker image: `sha256:0eba445e0f0444f5bf137e3c385cc6f206787eff42ec16183004e7f65516dc1b`
- Container at verification: `4a117b8c036e92e578f7db8504155037998df18622dff947def34068fccf939a`
- Public `/api/health`: HTTP 200
- Public JS: `/assets/index-CTKGczUW.js`, HTTP 200, `application/javascript`, 2,559,741 bytes

## Show integrity

- Quiz: original `0KTcUgc0uvF_vGWYHrpTJ`
- Base SHA256 unchanged: `878c5814fdc30c9ab9b06ae49d650e12cd76e66114ee5388ee0b66fe73752f86`
- Release sidecar SHA256: `3a2cb1c9bf4a6ad4e82c32dd5e0642b9c4b5a4813cf2b049312d0c5dbd9829f2`
- Revision: 5
- Questions: 10
- Timeline steps: 70
- Sample representatives: 40, all without phone numbers
- Existing voting soundtrack remains `/media/tzila-determined-pursuit-20261105.mp3`, enabled, looped, volume `0.38`.
- Existing voting file SHA256: `bbd4db307419437e490b9285e594a0c15a30c29de87a384c36567e0c36201f3d`.

## Verification

- Five mocked activation/rollback cases: PASS.
- Workspace Vitest: 326/326 PASS.
- Extensions Vitest: 484/484 PASS.
- Web, Socket and Extensions TypeScript: PASS.
- Production build: PASS.
- Local Chromium release suite: 4/4 PASS.
- Server candidate exact-media/show smoke: PASS.
- Final server-candidate game: PASS, 10 questions, 2 rounds, tie resolution, 40 representatives, all five image answers, host presentation, Pause/Resume, voting and result audio, recap and finale.
- Final production Chromium smoke: PASS in 35.1 seconds against `https://tadazz.com`, including real room/socket, same-window host presentation, keyboard Pause/Resume, vote, result reveal and result soundtrack.
- Remaining expected warning: optional `/branding/theme.json` returns 404 and falls back to the built-in theme.

## Backups and rollback

Release root: `/opt/tadazz-releases/p0-successor-20261106`

- Previous image archive: `previous-image.tar`
  - SHA256 `b7111d989cb47cc5d4ca8e687a3ad2f076cd95786533ab511eb41e2bcb69c3a9`
- Production config archive: `production-config-backup.tar.gz`
  - SHA256 `bc0b7efd495c587083a97056f7195df424a50dca9cb946448ea1ab2ba2e9c600`
- Original sidecar: `original-sidecar.json`
- Previous container: `tadazz-before-p0-successor-20261106`
- Rollback command: `sudo python3 /opt/tadazz-releases/p0-successor-20261106/successor-release.py rollback`

The rollback retains the current accounts database, sessions, uploads, unrelated shows and result files. It restores only the retained production container and the CAS-guarded original Tzila sidecar.
