"""Invoke the live TypeScript validator; do not maintain a second Python schema."""
from pathlib import Path
import argparse
import shutil
import subprocess


def command(manifest, asset_root, trusted=False):
    root = Path(__file__).resolve().parents[4]
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required")
    result = [node, "--import", (root / "extensions/node_modules/tsx/dist/loader.mjs").as_uri(),
              str(root / "extensions/qa/theme-authoring.ts"), "validate",
              str(Path(manifest).resolve()), str(Path(asset_root).resolve())]
    if trusted:
        result.append("--trusted-repository")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest")
    parser.add_argument("asset_root")
    parser.add_argument("--trusted-repository", action="store_true")
    args = parser.parse_args()
    return subprocess.run(command(args.manifest, args.asset_root, args.trusted_repository), check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
