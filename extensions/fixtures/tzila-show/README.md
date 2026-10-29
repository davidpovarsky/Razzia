# Tzila — Build Our Story | media and authored show package

Source: Goldy forwarded Tzila Phirer’s “Final Character Images” email on 29 October 2026.

**IMPORTANT — NOT YET IMPORTABLE on currently checked branch `agent/tomer/wave2` commit `0209a9f`.** Five answers, telephone surveys and winning-option reveal require code work described by `TOMER_IMPLEMENTATION_PROMPT.md`. No code was modified in Tada.

Package contents:
- `TZILA_STORY_SHOW.tada.json` — exact Tada authored show skeleton, 10 survey questions (5 choices each), two rounds, 20 seconds per poll, interim results screens.
- `TZILA_STORY_SHOW.xlsx` — equivalent six-sheet workbook in the existing source format. Re-validate with Tada’s native parser after widening answer limit.
- `media/` — 40 unique artwork crops, stripped of caption region. PNGs remain unchanged artwork (no generative redraw).
- `source_panels/` — 40 original cropped panels including printed captions for reference.
- `MEDIA_MANIFEST.json` — maps each choice number to label, original source file, image name and /media/ target.
- `IMAGE_CONTACT_SHEET.jpg` — visual QA overview.

After implementation, upload 40 `media/*.png` files with the existing media endpoint as a manager, then import JSON/XLSX. Verify each `/media/tzila-...png` URL with HTTP GET and actual browser render. Do not silently replace nonexistent images with dummy online URLs.

Ambiguity resolved by image content: `Round 2 - Category 2 - Main Character.png` belongs to category 1/main character in round 2 despite filename. Category 3 (Era) and 5 (Ending) repeat unchanged in both rounds.

Labels are transcribed from the source captions. Please review spelling before a live event. Results are **plurality** (highest votes) with explicit tie handling, not mathematically necessarily >50% majority.
