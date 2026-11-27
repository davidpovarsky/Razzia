"""Raster regression for the authored four-box puzzle; uses the actual exporter."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw


SPEC = importlib.util.spec_from_file_location(
    "family_media", Path(__file__).with_name("generate-media.py")
)
media = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(media)


class CakeBoxRasterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_output = media.OUT
        media.OUT = Path(self.temp.name)

    def tearDown(self):
        media.OUT = self.previous_output
        self.temp.cleanup()

    def test_actual_export_preserves_all_four_box_bodies(self):
        media.cake_boxes()
        counts = media.validate_cake_boxes_raster(media.OUT / "cake-boxes.png")
        self.assertEqual(len(counts), 4)
        self.assertTrue(all(count >= 10000 for count in counts))

    def test_labels_only_raster_is_rejected(self):
        image = Image.new("RGB", (1280, 720), "#fff8ec")
        draw = ImageDraw.Draw(image)
        for index, label in enumerate("ABCD"):
            draw.text((210 + index * 300, 378), label, fill="#17377f")
        path = media.OUT / "missing-boxes.png"
        image.save(path)
        with self.assertRaisesRegex(RuntimeError, "missing visible geometry"):
            media.validate_cake_boxes_raster(path)


if __name__ == "__main__":
    unittest.main()
