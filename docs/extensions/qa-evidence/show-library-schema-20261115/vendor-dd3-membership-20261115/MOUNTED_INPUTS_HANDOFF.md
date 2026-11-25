# Retained mounted inputs and frozen output rehash

Independent Lane D read-only observation after E supplied exact mount provenance.
No container was started, stopped, removed or exec'd. Docker inspect of the
retained exited c2/dd3/six containers records the same image digest
sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647
and explicit read-only baseline node_modules mounts under /work. Image metadata
reports linux/arm64. Entrypoint is sleep3600; it does not prove the historical
Vite exec argv. The six container's retained exit137/OOMfalse is lifecycle state,
not a test failure/success assertion. All services/keepers/volumes are untouched.

verify_mounted_inputs.py read only the named106 graph files plus ten actual
package metadata/license files from those physical node_modules paths. All116
SHA256/SHA512/sizes matched the independently observed retained CAFS records.
They are copies, not same-inode hardlinks: sameFileAsCafsCount=0, explicitly
preserved. No hardlink, tarball extraction, signature or historical byte
immutability claim is made. Current .modules.yaml is actually JSON; its actual
fields record pnpm@12.18.0, nodeLinker=isolated, virtualStoreDir=.pnpm and
storeDir=/fixtures/pnpm-store/v11. That metadata is not historical process
execution-version proof; its exact byte hash is recorded separately.

All eight named fixture runtime files and the separate two emitted JS/CSS files
were rehashed, ten physical observations. They match the earlier exact file
records. The six native images remain fixture copies, not emitted Vite outputs.
No license or resource-index file was inserted in either frozen directory.

The assembled current source view matches60 of67 expected dd3 Git source
records. The seven differences were NOT suppressed: the graph recipe has the
later type-only annotation bytes (observed f515631a5a0a5ecd9933aa74dcffc48831f37ab8ca63a0da643f08f561504f94,
instead of original1d1ad372...), and all six image Git paths are absent from
the assembled source tree. Their separately mapped fixture bytes do match the
exact Git-derived image records. All56 graph repository modules, lock/root/
extensions package manifests and base build config match dd3. The original
graph recipe remains identified by its real original Git blob; the current
recipe is not substituted retroactively.

Evidence: mounted-inputs-observation.json, retained-ui-six-container.json,
retained-ui-dd3-containers.jsonl, retained-module-metadata-fields.json. The helper
captures source differences and raw physical paths/modes/inodes, not a fabricated
clean audit. Remote output files/bytes written=0; free disk afterward2,660,896,768
bytes, so no new heavy job was launched from this observation. Cumulative own
remote growth stays0. Python helper and strict-key SSH completed exit0.

Remaining executable prerequisites: E's historical exact build argv and actual
rendered contribution receipt; versioned renderer Ref assignment/ABI binding;
reviewed positive store scope; six image usage rights; font/environment and
production immutable loader acceptance. Matching current mounted bytes plus
old emitted output is evidence, not authority. Existing compiled pins and
trusted rights/store arrays remain empty and all original source tasks OPEN.
