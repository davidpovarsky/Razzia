# Native renderer pin repair — preparation only

The canonical fe254 native-launch attempt failed 3 of its 14 executed checks.
The original failed receipt and input manifest are preserved beside this folder;
no successful receipt was substituted for that attempt.

The two type/lint failures were the original two-family parity fixture indexing
an expanded theme union. A runtime assertion now narrows that existing fixture
contract to Tadazz Classic or Razzia Original.

The native manifest mismatch had two measured metadata causes: relative
external dependency paths changed with canonical source depth, and the broad
style evidence walk included three generated widget dist files. Renderer JavaScript
and CSS were byte-identical. The native style collector now mirrors the existing
widget collector exclusions for dist, node_modules and .git; actual esbuild and
Vite input evidence remains intact.

The repair retained the full failed artifact, prior source inventory, raw receipt
and exact source bytes on the workstation before mutating the failed Oracle tree.
The owned offline Oracle preparation passed eight checks: formatting, semantic
types, semantic lint, semantic format, native generation, strict native manifest
verification, widget build, and strict native manifest verification again.

Exactly the three generated widget CSS/HTML/JS entries disappeared from the
artifact source list. All other source hashes, renderer bytes, registry and
resources remained unchanged. The widget output changed, while the native
artifact and committed manifest remained identical across its rebuild.

Receipt SHA256: 6598d50290cee4c753baf4fa37de7bab069cbedcfc3cd2d44bb406563188de5f
Repaired full-tree SHA256: 3dc24e48430ce2837b76575ced977eeed86a13fa207f3ce6d0fcf2367e502af4
Generated manifest SHA256: 5ea03da86aa1b2e56c06f8a561840ec6d29c42f9521900d7d7fed96fe95e0b96

The container stopped with no OOM. Only the builder, parity fixture and generated
manifest were copied back. This is preparation evidence, not release
qualification. The newly committed candidate must pass the unchanged native
launch and browser gates before staging, backup qualification and deployment.
