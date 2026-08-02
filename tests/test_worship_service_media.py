import io
import unittest
from unittest import mock

from PIL import Image
from werkzeug.datastructures import FileStorage

import app


class _Document:
    def __init__(self):
        self.saved = None

    def set(self, value):
        self.saved = value


class _Collection:
    def __init__(self, document):
        self._document = document

    def document(self, _media_id):
        return self._document


class WorshipServiceMediaTests(unittest.TestCase):
    def test_photo_falls_back_to_bounded_firestore_media(self):
        image_bytes = io.BytesIO()
        Image.new("RGB", (1800, 1200), "#2d6a74").save(image_bytes, "PNG")
        image_bytes.seek(0)
        upload = FileStorage(stream=image_bytes, filename="missionaries.png", content_type="image/png")
        document = _Document()

        with (
            app.app.test_request_context("/worship/service-slide/add", method="POST"),
            mock.patch.object(app, "upload_to_storage_checked", return_value=False),
            mock.patch.object(app, "db", object()),
            mock.patch.object(app, "_worship_media_ref", return_value=_Collection(document)),
        ):
            image_path = app._save_worship_service_image(upload)

        self.assertTrue(image_path.startswith("firestore:"))
        self.assertEqual(document.saved["mime_type"], "image/jpeg")
        self.assertLess(len(document.saved["data"]), 900_000)


if __name__ == "__main__":
    unittest.main()
