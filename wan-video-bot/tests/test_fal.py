"""Test fal_backend.py against a fake fal.ai queue API (no network or key needed)."""

import json
import os
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from comfy import ComfyError  # noqa: E402
from fal_backend import FalClient  # noqa: E402


class FakeFal(BaseHTTPRequestHandler):
    submitted = None
    polls = 0
    reject_key = False

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())

    def do_POST(self):
        if FakeFal.reject_key:
            return self._json({"detail": "Unauthorized"}, 401)
        FakeFal.submitted = (self.path, self.headers["Authorization"],
                             json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        base = f"http://{self.headers['Host']}"
        self._json({"request_id": "r1", "status_url": f"{base}/req/r1/status", "response_url": f"{base}/req/r1"})

    def do_GET(self):
        base = f"http://{self.headers['Host']}"
        if self.path == "/req/r1/status":
            FakeFal.polls += 1
            self._json({"status": "COMPLETED" if FakeFal.polls > 1 else "IN_PROGRESS"})
        elif self.path == "/req/r1":
            self._json({"video": {"url": f"{base}/files/out.mp4"}, "seed": 1})
        elif self.path == "/files/out.mp4":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"FALVIDEO")


class FalClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeFal)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        FakeFal.reject_key, FakeFal.polls = False, 0
        self.tmp = tempfile.mkdtemp()
        self.img = os.path.join(self.tmp, "in.jpg")
        with open(self.img, "wb") as f:
            f.write(b"\xff\xd8jpg")

    def client(self, **kw):
        return FalClient("secret", base_url=self.url, extra_args={"resolution": "480p"}, **kw)

    def test_full_render(self):
        with patch("fal_backend.time.sleep"):  # don't wait between polls
            out = self.client().generate_video(self.img, "waves rolling in", os.path.join(self.tmp, "out.mp4"))
        self.assertEqual(open(out, "rb").read(), b"FALVIDEO")
        path, auth, body = FakeFal.submitted
        self.assertEqual(path, "/fal-ai/wan/v2.2-5b/image-to-video")
        self.assertEqual(auth, "Key secret")
        self.assertEqual(body["prompt"], "waves rolling in")
        self.assertEqual(body["resolution"], "480p")
        self.assertTrue(body["image_url"].startswith("data:image/jpeg;base64,"))

    def test_bad_key_is_readable(self):
        FakeFal.reject_key = True
        with self.assertRaises(ComfyError) as e:
            self.client().generate_video(self.img, "x", os.path.join(self.tmp, "out.mp4"))
        self.assertIn("FAL_KEY", str(e.exception))

    def test_missing_key(self):
        ok, text = FalClient("").status()
        self.assertFalse(ok)
        self.assertIn("FAL_KEY", text)


if __name__ == "__main__":
    unittest.main()
