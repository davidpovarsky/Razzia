#!/usr/bin/env python3
"""Prepare a safe, new Tzila quiz sidecar: one directory, continuous music.

The source is never modified. Review the generated file and deploy it only
after verifying the production sidecar hash, backing it up and checking rooms.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path


def patch_show(source: dict) -> tuple[dict, dict]:
    updated = copy.deepcopy(source)
    scenes = updated["scenes"]
    timeline = updated["timeline"]

    def scene_for(step: dict) -> dict:
        return scenes.get(step.get("sceneId", ""), {})

    full_directory = [
        step for step in timeline
        if scene_for(step).get("preset") == "representative-directory"
        and scene_for(step).get("groupPage") is None
    ]
    grouped = [
        step for step in timeline
        if scene_for(step).get("preset") == "representative-directory"
        and scene_for(step).get("groupPage") is not None
    ]
    pages = sorted(scene_for(step).get("groupPage") for step in grouped)
    if len(full_directory) != 1 or pages != [0, 1, 2, 3]:
        raise ValueError(
            f"Unexpected directory layout: full={len(full_directory)}, pages={pages}"
        )
    dropped_ids = {step["sceneId"] for step in grouped}
    updated["timeline"] = [step for step in timeline if step not in grouped]
    remaining_ids = {
        step.get("sceneId") for step in updated["timeline"] if step.get("sceneId")
    }
    for scene_id in dropped_ids - remaining_ids:
        scenes.pop(scene_id, None)

    tracks = updated["audio"]["soundtrack"]
    for slot in ("roundStart", "finale"):
        track = tracks[slot]
        if track.get("mode") != "media" or not track.get("url"):
            raise ValueError(f"{slot}: missing configured soundtrack")
        track["loop"] = True
        track.pop("maxDurationMs", None)
    opening = tracks["openingIntro"]
    if opening.get("loop") is not False or opening.get("maxDurationMs") != 12000:
        raise ValueError("Unexpected original timed opening - refusing to alter it")
    if len(updated["timeline"]) != len(timeline) - 4:
        raise AssertionError("Unexpected timeline changes")

    return updated, {
        "oldSteps": len(timeline),
        "newSteps": len(updated["timeline"]),
        "removedFocusedPages": pages,
        "fullDirectoryCount": 1,
        "loopedTracks": ["roundStart", "finale"],
        "openingPreserved": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        parser.error("Refusing to modify the source in place")
    raw = args.source.read_bytes()
    source = json.loads(raw.decode("utf-8-sig"))
    patched, report = patch_show(source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(patched, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    report["sourceSha256"] = hashlib.sha256(raw).hexdigest()
    report["outputSha256"] = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
