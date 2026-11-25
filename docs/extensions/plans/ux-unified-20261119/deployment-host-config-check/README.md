# Docker HostConfig normalization proof

The failed deployment of the qualified d8 application reached Docker container creation and then stopped before starting the replacement. The exact reported HostConfig difference was `OomKillDisable: null` on the original container versus `OomKillDisable: false` on the created replacement. Image, environment and mounts had already passed their guards. The deployment automatically restored the original running container. This patch changes only deployment-tool comparison and its direct regression checks.

## Narrow comparison policy

`canonical_host_config` copies the supplied dictionary. Only an explicitly present `OomKillDisable` with value `null` becomes `false`. Present Boolean values remain unchanged. Integers 0 and 1, strings and other types are rejected. An absent key remains absent, so a missing key does not equal either an explicit null or false. Every other HostConfig key and value is preserved and compared by the existing dictionary equality guard. Image, environment and mount comparisons remain unchanged.

This matches the Docker implementation: the [Moby daemon](https://github.com/moby/moby/blob/master/daemon/daemon_unix.go) initializes a nil `hostConfig.OomKillDisable` to a pointer to false. The [Docker CLI container options](https://github.com/docker/cli/blob/master/cli/command/container/opts.go) also use false as the default. The correction does not request disabling the OOM killer or change container resource settings.

Successful deployment reports retain `hostConfigurationUnchanged: true` and explicitly include `hostConfigurationComparison: "exact-except-present-null-OomKillDisable-equals-false"`. This identifies the comparison of effective settings and avoids claiming that the raw inspect dictionaries were identical.

## Verification

The deployer SHA-256 is `3cf6acd277c9c9f7322c21c17ad27da8ee10a8ab2dd76594f81bc7d5f707cc35`; its prior d8 version was `07b17a2ed71035c573cb9d945e9ed36acd8093af3b940978339fa4054cd532ba`. The full existing Linux self-test command passed 75 checks: all original 25 checks and 50 new direct `verify_replacement` checks. The new checks cover null/false equivalence in both directions, unchanged true, rejection of true/default changes, invalid types on both sides, missing-key distinction, changes to network/ports, binds, security/privileges, devices, resource limits, logging, restart policy, image, environment and mounts. Every case checks that the original, replacement and create payload are unmodified.

Windows passed the same 50 new direct checks, all 8 deployment identity checks and all 10 room-count checks, for 68 total. Python syntax passed. These checks use synthetic dictionaries and temporary synthetic files; they do not use Docker or network requests, read customer files or change running processes. No deployment was attempted as part of this verification.

## Reproduce

On Linux, from the repository root containing the exact deployer hash:

```sh
python3 extensions/deployment/deploy-mcp-site.py --self-test
```

For the bounded checks supported on Windows as well as Linux, import the deployer without invoking its main entry point:

```python
import importlib.util
from pathlib import Path

path = Path("extensions/deployment/deploy-mcp-site.py")
spec = importlib.util.spec_from_file_location("deployer_checks", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert len(module.host_config_self_tests()) == 50
assert len(module.deployment_identity_self_tests()) == 8
assert len(module.game_count_self_tests()) == 10
```

The application remains the already qualified source `d8a402dd39bf3cd7e5b046c3bf3b955181815a62`. This evidence qualifies the narrow deployment-tool correction; it does not substitute a new application image or alter the application's release receipts.

## Public artifacts

The three verification/diff files are byte-preserved copies from the original work folder. `artifact-manifest.json` records their source paths, sizes and SHA-256 hashes. No logs, private configuration, credentials, backup archives or customer inputs are included.
