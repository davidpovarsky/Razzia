# Deployment OAuth scope contract proof

These public artifacts verify the narrow correction to the exact OAuth challenge expected by the staging, deployed-service, and restored-clone probes. The server already advertised five scopes; the deployment scripts still expected one. No product authorization policy changed.

## Verified behavior

The probes require this exact ordered scope list: `tadazz.catalog.read tadazz.drafts.write tadazz.drafts.read tadazz.library.write tadazz.exports.read`. Resource metadata must contain that same list in all three paths, and issuer metadata must match wherever the probe already fetches issuer metadata. Existing status, authorization, resource, consent-security-header and artifact checks remain intact. Failure receipts retain only allowlisted check codes.

The focused checks passed against the source hashes recorded in `artifact-manifest.json`: 68 existing staging checks, 25 existing deployment checks, and 40 contract cases. The 40 contract cases passed on both Linux and Windows. They execute the actual Python probe and the actual assertion statements extracted from both embedded JavaScript probes. Negative cases reject the old single-scope challenge, an unexpected scope, a wrong resource in the challenge, a missing challenge, and missing, extra, duplicate or reordered metadata scopes. Both complete embedded JavaScript programs also pass syntax checks.

These checks use synthetic in-memory responses and temporary synthetic files. They do not use Docker or network requests, read customer files, change Git, stage a release, or deploy. They supplement the exact-source release gates and do not replace them.

## Reproduce

Use Python 3 and Node 24. Run from the repository root at a revision containing the two script hashes in the manifest. The byte-preserved harness resolves the repository root from its original work path, so copy it there before execution:

```sh
mkdir -p work/ux-unified-20261119/deployment-scope-check
cp docs/extensions/plans/ux-unified-20261119/deployment-scope-check/check_contract.py work/ux-unified-20261119/deployment-scope-check/check_contract.py
python3 extensions/deployment/stage-mcp-site.py --self-test
python3 extensions/deployment/deploy-mcp-site.py --self-test
python3 work/ux-unified-20261119/deployment-scope-check/check_contract.py
```

Run the existing filesystem self-checks on Linux because they exercise POSIX modes and symbolic links. The focused contract harness also runs on Windows with Node 24 available on PATH. Its Windows result is preserved separately.

## Provenance

The five copied artifacts are byte-identical to the files in the original work folder; their source paths, sizes and SHA-256 digests appear in `artifact-manifest.json`. The diffs compare the failed 8b staging candidate's two deployment scripts with the corrected scripts. No runtime logs, private configuration, credentials, backup files or customer inputs are included.
