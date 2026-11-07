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
    interim = [step for step in timeline if step.get("kind") == "interimResults"]
    prejoin = [
        step for step in timeline
        if scene_for(step).get("preset") in ("company-opening", "grand-opening", "phone-instructions", "connection-readiness")
    ] + full_directory
    old_openings = [scene_for(step).get("preset") for step in prejoin]
    if len(full_directory) not in (0, 1) or pages not in ([0, 1, 2, 3], []):
        raise ValueError(
            f"Unexpected directory layout: full={len(full_directory)}, pages={pages}"
        )
    if old_openings and sorted(old_openings) != sorted([
        "company-opening", "grand-opening", "representative-directory",
        "phone-instructions", "connection-readiness"
    ]):
        raise ValueError(f"Unexpected authored pre-join screens: {old_openings}")
    if len(interim) not in (0, 10):
        raise ValueError(f"Unexpected interimResults count: {len(interim)}")
    if sum(step.get("kind") == "question" for step in timeline) != 10:
        raise ValueError("Not Tzila's original ten-question story")
    for index, step in enumerate(timeline):
        if step.get("kind") != "question":
            continue
        following = [it for it in timeline[index + 1:] if it.get("kind") not in ("interimResults",)]
        if not following or scene_for(following[0]).get("preset") != "tie-break":
            raise ValueError("Unexpected question-to-tie-break sequence")
    removed = grouped + interim + prejoin
    dropped_ids = {step["sceneId"] for step in removed}
    removed_step_ids = {step["id"] for step in removed}
    updated["timeline"] = [step for step in timeline if step["id"] not in removed_step_ids]
    remaining_ids = {
        step.get("sceneId") for step in updated["timeline"] if step.get("sceneId")
    }
    for scene_id in dropped_ids - remaining_ids:
        # Keep the full directory as a settings-only scene. The phone number
        # is authored there and used by the public lobby before Start Game.
        if scenes.get(scene_id, {}).get("preset") == "representative-directory" and \
           scenes[scene_id].get("groupPage") is None:
            continue
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
    if len(updated["timeline"]) != len(timeline) - len(removed):
        raise AssertionError("Unexpected timeline changes")

    return updated, {
        "oldSteps": len(timeline),
        "newSteps": len(updated["timeline"]),
        "removedFocusedPages": pages,
        "removedInterimResults": len(interim),
        "relocatedPreJoinScreens": old_openings,
        "fullDirectoryInLobby": True,
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
