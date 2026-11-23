"""Render the collection's original instrumental cues, using only Python's stdlib.

Run on the authorized Linux asset worker: python3 generate-audio.py OUTPUT_ROOT.
This is deterministic sound synthesis, not sampled or downloaded music. The
shared AudioCuePlayer remains the sole playback owner. No speech is generated.
"""
from __future__ import annotations

import array
import hashlib
import json
import math
import pathlib
import struct
import sys
import wave

RATE = 44100
TAU = math.tau
STYLES = [
    ("royal-quiz", 84, 57, "warm", (0, 3, 7, 10), (0, -5, 3, -2)),
    ("neon-arcade", 112, 45, "pulse", (0, 7, 12, 15), (0, -5, 3, 7)),
    ("retro-tv", 100, 53, "organ", (0, 4, 7, 9), (0, 5, 2, 7)),
    ("magic-storybook", 72, 60, "bell", (0, 4, 7, 11), (0, 5, 9, 7)),
    ("crystal-future", 80, 62, "glass", (0, 4, 7, 14), (0, -2, -5, 0)),
    ("carnival-pop", 108, 60, "wood", (0, 4, 7, 12), (0, 5, 7, 0)),
    ("sports-arena", 116, 43, "brass", (0, 7, 12, 7), (0, 3, -2, 5)),
    ("mystery-noir", 70, 50, "noir", (0, 3, 7, 10), (0, -1, -5, 2)),
]


def note(buffer: list[float], start: float, length: float, midi: float,
         gain: float, voice: str, pan: float = 0.0, looping: bool = False) -> None:
    frequency = 440 * 2 ** ((midi - 69) / 12)
    count = int(length * RATE)
    offset = round(start * RATE)
    frames = len(buffer) // 2
    left = math.sqrt((1 - pan) / 2)
    right = math.sqrt((1 + pan) / 2)
    for i in range(count):
        position = offset + i
        if not looping and position >= frames:
            break
        position %= frames
        t = i / RATE
        phase = TAU * frequency * t
        attack = min(1.0, t / (0.035 if voice in ("warm", "glass", "brass") else 0.008))
        release = min(1.0, (length - t) / min(0.18, length * 0.35))
        decay = math.exp(-t * (1.9 if voice in ("bell", "wood", "noir") else 0.55))
        if voice == "pulse":
            value = math.sin(phase) + 0.24 * math.sin(3 * phase) + 0.09 * math.sin(5 * phase)
        elif voice == "organ":
            value = math.sin(phase) + 0.32 * math.sin(2 * phase) + 0.12 * math.sin(4 * phase)
        elif voice in ("bell", "glass"):
            value = math.sin(phase + 1.5 * math.sin(phase * 2.003) * math.exp(-t * 5))
            value += 0.15 * math.sin(phase * 3.996) * math.exp(-t * 7)
        elif voice == "wood":
            value = math.sin(phase) + 0.28 * math.sin(phase * 3.99) * math.exp(-t * 9)
        elif voice == "brass":
            value = math.sin(phase) + 0.24 * math.sin(phase * 2) + 0.13 * math.sin(phase * 3)
        elif voice == "noir":
            value = math.sin(phase) + 0.18 * math.sin(phase * 2.002) * math.exp(-t * 3)
        else:
            value = math.sin(phase) + 0.16 * math.sin(phase * 1.004) + 0.1 * math.sin(phase * 2)
        value *= gain * attack * max(0.0, release) * decay
        buffer[2 * position] += value * left
        buffer[2 * position + 1] += value * right


def percussion(buffer: list[float], start: float, strength: float, high: bool = False) -> None:
    length = 0.07 if high else 0.24
    count = int(length * RATE)
    offset = round(start * RATE)
    frames = len(buffer) // 2
    state = 1337 + offset
    for i in range(count):
        position = (offset + i) % frames
        t = i / RATE
        if high:
            state = (1664525 * state + 1013904223) & 0xffffffff
            value = (state / 2147483648 - 1) * math.exp(-t * 65) * math.sin(TAU * 6000 * t)
        else:
            value = math.sin(TAU * (45 * t + 50 * (1 - math.exp(-t * 25)) / 25)) * math.exp(-t * 22)
        value *= strength * min(1, t / 0.003) * min(1, (length - t) / 0.01)
        buffer[position * 2] += value
        buffer[position * 2 + 1] += value


def render(family, name: str) -> tuple[list[float], float]:
    _, bpm, root, voice, intervals, progression = family
    beat = 60 / bpm
    durations = {"voting-bed": beat * 32, "transition": 0.75, "confirm": 0.34,
                 "tick": 0.12, "urgent": 0.16, "final": 0.23,
                 "timer-end": 0.85, "lock": 0.5, "reveal": 1.65,
                 "leaderboard": 2.6, "podium": 3.8, "closing": 4.8}
    duration = durations[name]
    buffer = [0.0] * (round(duration * RATE) * 2)
    if name == "voting-bed":
        for bar in range(8):
            tonic = root + progression[(bar // 2) % len(progression)]
            for step in range(8):
                midi = tonic + intervals[step % len(intervals)] + 12
                note(buffer, (bar * 4 + step / 2) * beat, beat * 0.88, midi,
                     0.09, voice, (-0.3, 0.2, -0.15, 0.3)[step % 4], True)
            note(buffer, bar * 4 * beat, beat * 3.9, tonic - 12, 0.13, "warm", 0, True)
            note(buffer, bar * 4 * beat, beat * 3.7, tonic + 7, 0.045, "warm", 0.25, True)
            if voice in ("pulse", "organ", "wood", "brass"):
                for tick in range(4):
                    percussion(buffer, (bar * 4 + tick) * beat, 0.07 if tick % 2 else 0.11)
                    percussion(buffer, (bar * 4 + tick + 0.5) * beat, 0.028, True)
    else:
        sequences = {
            "transition": [(0, 0, .45), (.1, 7, .5), (.22, 12, .45)],
            "confirm": [(0, 12, .23), (.09, 19, .23)],
            "tick": [(0, 24, .11)],
            "urgent": [(0, 26, .15)],
            "final": [(0, 28, .22)],
            "timer-end": [(0, 7, .42), (.13, 0, .6)],
            "lock": [(0, 0, .35), (.08, 7, .34)],
            "reveal": [(0, 0, .8), (.12, 7, .9), (.27, 12, 1.1)],
            "leaderboard": [(0, 0, .9), (.2, 7, 1.0), (.4, 12, 1.1), (.65, 16, 1.6)],
            "podium": [(0, 0, 2), (.2, 7, 2), (.4, 12, 2.5), (.7, 19, 2.8)],
            "closing": [(0, 0, 2.8), (.2, 7, 2.6), (.6, 12, 3.3), (1.2, 16, 3.4)],
        }
        for n, (start, interval, length) in enumerate(sequences[name]):
            note(buffer, start, length, root + interval + (0 if name in ("closing", "podium") else 12),
                 .19, voice, -.18 if n % 2 else .18)
        if name in ("leaderboard", "podium", "closing"):
            note(buffer, 0.05, duration - .15, root - 12, .12, "warm")
    # A short stereo reflection supplies depth. No limiter pumping or clipping.
    for delay, amount in ((0.067, .13), (0.113, .08), (0.179, .045)):
        shift = round(delay * RATE)
        for i in range(len(buffer) // 2 - 1, shift - 1, -1):
            buffer[2 * i] += buffer[2 * (i - shift) + 1] * amount
            buffer[2 * i + 1] += buffer[2 * (i - shift)] * amount
    peak = max(map(abs, buffer), default=1)
    gain = 0.58 / max(peak, .58)
    edge = round(.012 * RATE)
    frames = len(buffer) // 2
    for i in range(frames):
        fade = min(1, i / edge, (frames - 1 - i) / edge)
        buffer[2 * i] *= gain * fade
        buffer[2 * i + 1] *= gain * fade
    return buffer, duration


def main() -> None:
    if sys.platform != "linux":
        raise SystemExit("Asset generation is restricted to the authorized Linux worker")
    root = pathlib.Path(sys.argv[1]).resolve()
    assets = []
    for family in STYLES:
        folder = root / "packages/web/public/tadazz-show/originals" / family[0]
        folder.mkdir(parents=True, exist_ok=True)
        for name in ("voting-bed", "transition", "confirm", "tick", "urgent", "final", "timer-end", "lock", "reveal", "leaderboard", "podium", "closing"):
            buffer, duration = render(family, name)
            target = folder / (name + ".wav")
            pcm = array.array("h", (round(max(-1, min(1, x)) * 32767) for x in buffer))
            if sys.byteorder != "little":
                pcm.byteswap()
            with wave.open(str(target), "wb") as out:
                out.setnchannels(2)
                out.setsampwidth(2)
                out.setframerate(RATE)
                out.writeframes(pcm.tobytes())
            payload = target.read_bytes()
            assets.append({"family": family[0], "name": name, "kind": "audio", "url": "/tadazz-show/originals/" + family[0] + "/" + name + ".wav", "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(), "durationSeconds": round(duration, 6), "peak": round(max(map(abs, buffer)), 6)})
        print(json.dumps({"family": family[0], "audioFiles": 12}), flush=True)
    path = root / "extensions/src/core/show-themes/original-audio-assets.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(assets, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
