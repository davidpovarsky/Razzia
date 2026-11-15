"""Prepare, but do not apply, the exact target-V2 semantic-contract test diff."""
from pathlib import Path
import difflib

directory = Path(__file__).resolve().parent
root = directory.parents[4]
relative = "extensions/src/server/storage/process-interruption.test.ts"
source = (root / relative).read_text(encoding="utf-8")
old_import = 'import { findMediaReferencesAcrossShows } from "../../core/index"'
new_import = '''import {
  computeCanonicalBaseDigest,
  findMediaReferencesAcrossShows,
} from "../../core/index"'''
old = '''          expect(first.state.shows).toEqual(before.shows)
          expect(first.state.mediaSha256).toBe(before.mediaSha256)'''
new = '''          if (boundary.startsWith("quiz-")) {
            // Quiz-save journals store the complete decoded base object. The
            // startup adapter reserializes it using two-space native formatting.
            // Compare all fields/types, with no schema parsing or ID stripping.
            const original = before.shows["show-a"]
            const restored = first.state.shows["show-a"]
            expect(restored.base).toStrictEqual(original.base)
            expect(computeCanonicalBaseDigest(restored.base)).toBe(
              computeCanonicalBaseDigest(original.base),
            )
            expect(restored.extras).toStrictEqual(original.extras)
            expect(restored.sidecarSha256).toBe(original.sidecarSha256)
            expect(first.state.shows["show-b"]).toStrictEqual(
              before.shows["show-b"],
            )
            expect(first.state.shows.unrelated).toStrictEqual(
              before.shows.unrelated,
            )
          } else {
            expect(first.state.shows).toEqual(before.shows)
          }
          expect(first.state.mediaSha256).toBe(before.mediaSha256)'''
assert source.count(old_import) == 1
assert source.count(old) == 1
proposed = source.replace(old_import, new_import).replace(old, new)
patch = "".join(difflib.unified_diff(
    source.splitlines(keepends=True), proposed.splitlines(keepends=True),
    fromfile=f"a/{relative}", tofile=f"b/{relative}",
))
(directory / "proposed-v2-semantic-oracle.patch").write_text(patch, encoding="utf-8", newline="\n")
print("Proposal written; source test unchanged.")
