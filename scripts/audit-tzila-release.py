#!/usr/bin/env python3
"""Read-only Tzila show audit; omit personal representative data."""
import collections
import hashlib
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
raw = path.read_bytes()
d = json.loads(raw)
scenes = d.get("scenes", {})
timeline = d.get("timeline", [])
counts = collections.Counter(
    (step.get("kind"), scenes.get(step.get("sceneId"), {}).get("preset"))
    for step in timeline
)
by_preset = collections.Counter(
    scenes.get(step.get("sceneId"), {}).get("preset")
    for step in timeline if step.get("sceneId")
)
presets = sorted((key, value) for key, value in by_preset.items() if key)
directory = [
    s for s in scenes.values()
    if s.get("preset") == "representative-directory"
]
print(json.dumps({
    "sourceSha256": hashlib.sha256(raw).hexdigest(),
    "quizId": d.get("quizId"),
    "revision": d.get("revision"),
    "timelineSteps": len(timeline),
    "questionCount": len(d.get("questionIds", [])),
    "representativeCount": len(d.get("roster", {}).get("participants", [])),
    "interimResults": sum(s.get("kind") == "interimResults" for s in timeline),
    "directoryPages": sorted(
        s.get("groupPage") for s in directory if s.get("groupPage") is not None
    ),
    "fullDirectoryScenes": sum(s.get("groupPage") is None for s in directory),
    "hasDialInNumber": any(bool(s.get("dialNumber")) for s in directory),
    "timelinePresets": presets,
    "firstStepKind": timeline[0].get("kind") if timeline else None,
    "originalVotingUrl": d.get("audio", {}).get("soundtrack", {}).get("question", {}).get("url"),
    "roundStartLoop": d.get("audio", {}).get("soundtrack", {}).get("roundStart", {}).get("loop"),
    "finaleLoop": d.get("audio", {}).get("soundtrack", {}).get("finale", {}).get("loop"),
}, indent=2, ensure_ascii=False))
