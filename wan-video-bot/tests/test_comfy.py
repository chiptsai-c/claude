"""End-to-end test of comfy.py against a fake ComfyUI server (no GPU needed).

Run: python -m unittest discover -s tests
"""

import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from comfy import ComfyClient, ComfyError  # noqa: E402

WORKFLOW = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "workflows", "wan22_5b_i2v_api.json")


class FakeComfy(BaseHTTPRequestHandler):
    queued = {}
    fail = False

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        data = self.rfile.read(int(self.headers["Content-Length"]))
        if self.path == "/upload/image":
            self._json({"name": "uploaded.jpg", "subfolder": "", "type": "input"})
        elif self.path == "/prompt":
            wf = json.loads(data)["prompt"]
            if FakeComfy.fail:
                return self._json({"error": {"message": "Prompt outputs failed validation"},
                                   "node_errors": {"1": {"class_type": "UNETLoader", "errors": [
                                       {"message": "Value not in list", "details": "unet_name"}]}}}, 400)
            FakeComfy.queued["p1"] = wf
            self._json({"prompt_id": "p1"})

    def do_GET(self):
        if self.path.startswith("/history/p1"):
            self._json({"p1": {"status": {"status_str": "success"}, "outputs": {
                "12": {"images": [{"filename": "wanbot_00001_.mp4", "subfolder": "video", "type": "output"}],
                       "animated": [True]}}}})
        elif self.path.startswith("/view"):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"FAKEVIDEO")
        elif self.path == "/system_stats":
            self._json({"devices": [{"name": "cuda:0 RTX 4090", "vram_free": 20 * 2**30}]})
        elif self.path == "/queue":
            self._json({"queue_running": [], "queue_pending": []})


class ComfyClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeComfy)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        FakeComfy.fail = False
        self.tmp = tempfile.mkdtemp()
        self.img = os.path.join(self.tmp, "in.jpg")
        with open(self.img, "wb") as f:
            f.write(b"jpg")

    def test_full_render(self):
        c = ComfyClient(self.url, WORKFLOW, width=832, height=480, length=73)
        out = c.generate_video(self.img, "waves rolling in", os.path.join(self.tmp, "out.mp4"))
        self.assertEqual(open(out, "rb").read(), b"FAKEVIDEO")
        wf = FakeComfy.queued["p1"]
        self.assertEqual(wf["7"]["inputs"]["image"], "uploaded.jpg")
        self.assertEqual(wf["5"]["inputs"]["text"], "waves rolling in")
        self.assertNotEqual(wf["6"]["inputs"]["text"], "waves rolling in")  # negative untouched
        self.assertEqual((wf["8"]["inputs"]["width"], wf["8"]["inputs"]["height"], wf["8"]["inputs"]["length"]),
                         (832, 480, 73))

    def test_validation_error_is_readable(self):
        FakeComfy.fail = True
        c = ComfyClient(self.url, WORKFLOW)
        with self.assertRaises(ComfyError) as e:
            c.generate_video(self.img, "x", os.path.join(self.tmp, "out.mp4"))
        self.assertIn("UNETLoader", str(e.exception))

    def test_status(self):
        ok, text = ComfyClient(self.url, WORKFLOW).status()
        self.assertTrue(ok)
        self.assertIn("RTX 4090", text)

    def test_ui_format_rejected(self):
        ui = os.path.join(self.tmp, "ui.json")
        json.dump({"nodes": [], "links": []}, open(ui, "w"))
        with self.assertRaises(ComfyError):
            ComfyClient(self.url, ui).build_workflow("a.jpg", "x")

    def test_finds_positive_prompt_in_14b_style_graph(self):
        wf = {"10": {"class_type": "CLIPTextEncode", "inputs": {"text": ""}},
              "11": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg"}},
              "20": {"class_type": "WanImageToVideo", "inputs": {"positive": ["10", 0], "negative": ["11", 0]}},
              "30": {"class_type": "KSamplerAdvanced", "inputs": {"positive": ["20", 0], "noise_seed": 1}}}
        self.assertEqual(ComfyClient._positive_prompt_node(wf), "10")


if __name__ == "__main__":
    unittest.main()
