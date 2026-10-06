"""Minimal ComfyUI API client for Wan 2.2 image-to-video.

Uploads a photo, injects it and a text prompt into an API-format workflow,
queues the job, waits for it, and downloads the resulting video.

Run directly to test without Telegram:
    python comfy.py photo.jpg "camera slowly zooms in, leaves blowing"
"""

import argparse
import json
import os
import random
import time
import uuid

import requests

VIDEO_EXTS = (".mp4", ".webm", ".mov", ".gif", ".webp")
IMAGE_TO_VIDEO_NODES = ("Wan22ImageToVideoLatent", "WanImageToVideo")


class ComfyError(RuntimeError):
    pass


class ComfyClient:
    def __init__(self, base_url, workflow_path, timeout_s=1800, width=None, height=None, length=None):
        self.base = base_url.rstrip("/")
        self.workflow_path = workflow_path
        self.timeout_s = timeout_s
        self.size_overrides = {"width": width, "height": height, "length": length}

    # ---- health ---------------------------------------------------------

    def status(self):
        """Return (ok, text) describing whether ComfyUI is reachable and its queue."""
        try:
            stats = requests.get(f"{self.base}/system_stats", timeout=10).json()
            queue = requests.get(f"{self.base}/queue", timeout=10).json()
        except requests.RequestException as e:
            return False, f"ComfyUI not reachable at {self.base}: {e}"
        devices = ", ".join(
            f"{d.get('name', '?')} ({d.get('vram_free', 0) // 2**20} MB free)"
            for d in stats.get("devices", [])
        ) or "no GPU reported"
        running = len(queue.get("queue_running", []))
        pending = len(queue.get("queue_pending", []))
        return True, f"ComfyUI online. GPU: {devices}. Jobs running: {running}, waiting: {pending}."

    # ---- workflow -------------------------------------------------------

    def build_workflow(self, image_name, prompt, seed=None):
        with open(self.workflow_path, encoding="utf-8") as f:
            wf = json.load(f)
        if "nodes" in wf and "links" in wf:
            raise ComfyError(
                f"{self.workflow_path} is a UI workflow, not API format. "
                "In ComfyUI use Workflow > Export (API)."
            )

        image_nodes = [n for n in wf.values() if n.get("class_type") == "LoadImage"]
        if not image_nodes:
            raise ComfyError(
                "Workflow has no LoadImage node. In the Wan 2.2 template, un-bypass "
                "the Load Image node (Ctrl+B) before exporting."
            )
        for node in image_nodes:
            node["inputs"]["image"] = image_name

        prompt_id = os.environ.get("PROMPT_NODE_ID") or self._positive_prompt_node(wf)
        wf[prompt_id]["inputs"]["text"] = prompt

        seed = random.randint(0, 2**48) if seed is None else seed
        for node in wf.values():
            inputs = node.get("inputs", {})
            for key in ("seed", "noise_seed"):
                if isinstance(inputs.get(key), int):
                    inputs[key] = seed
            if node.get("class_type") in IMAGE_TO_VIDEO_NODES:
                for key, value in self.size_overrides.items():
                    if value:
                        inputs[key] = int(value)
        return wf

    @staticmethod
    def _positive_prompt_node(wf):
        """Find the CLIPTextEncode node wired into any node's 'positive' input."""
        for node in wf.values():
            ref = node.get("inputs", {}).get("positive")
            if isinstance(ref, list) and wf.get(str(ref[0]), {}).get("class_type") == "CLIPTextEncode":
                return str(ref[0])
        for node_id, node in wf.items():  # fallback: node titled "Positive ..."
            title = node.get("_meta", {}).get("title", "").lower()
            if node.get("class_type") == "CLIPTextEncode" and "positive" in title:
                return node_id
        raise ComfyError("Could not find the positive prompt node; set PROMPT_NODE_ID in .env.")

    # ---- run ------------------------------------------------------------

    def upload_image(self, image_path):
        name = f"tg_{uuid.uuid4().hex[:12]}{os.path.splitext(image_path)[1] or '.jpg'}"
        with open(image_path, "rb") as f:
            r = requests.post(
                f"{self.base}/upload/image",
                files={"image": (name, f)},
                data={"overwrite": "true"},
                timeout=120,
            )
        r.raise_for_status()
        up = r.json()
        return f"{up['subfolder']}/{up['name']}" if up.get("subfolder") else up["name"]

    def queue(self, wf):
        r = requests.post(f"{self.base}/prompt", json={"prompt": wf, "client_id": uuid.uuid4().hex}, timeout=60)
        if r.status_code != 200:
            raise ComfyError(f"ComfyUI rejected the workflow: {self._explain(r)}")
        return r.json()["prompt_id"]

    @staticmethod
    def _explain(r):
        try:
            body = r.json()
        except ValueError:
            return r.text[:500]
        msgs = [body.get("error", {}).get("message", "")]
        for node_id, err in (body.get("node_errors") or {}).items():
            for e in err.get("errors", []):
                msgs.append(f"node {node_id} ({err.get('class_type')}): {e.get('message')} {e.get('details', '')}")
        return "; ".join(m for m in msgs if m)[:1500]

    def wait(self, prompt_id, on_progress=None):
        start = time.time()
        while time.time() - start < self.timeout_s:
            hist = requests.get(f"{self.base}/history/{prompt_id}", timeout=30).json()
            if prompt_id in hist:
                entry = hist[prompt_id]
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    raise ComfyError(f"Render failed: {self._history_error(status)}")
                return entry
            if on_progress:
                on_progress(int(time.time() - start))
            time.sleep(5)
        raise ComfyError(f"Timed out after {self.timeout_s}s waiting for ComfyUI.")

    @staticmethod
    def _history_error(status):
        for kind, data in status.get("messages", []):
            if kind == "execution_error":
                return f"{data.get('node_type')}: {data.get('exception_message', '').strip()}"
        return "unknown error"

    def download_video(self, entry, out_path):
        for output in entry.get("outputs", {}).values():
            for items in output.values():
                for item in items if isinstance(items, list) else []:
                    if isinstance(item, dict) and item.get("filename", "").lower().endswith(VIDEO_EXTS):
                        r = requests.get(
                            f"{self.base}/view",
                            params={"filename": item["filename"], "subfolder": item.get("subfolder", ""),
                                    "type": item.get("type", "output")},
                            timeout=300,
                        )
                        r.raise_for_status()
                        root, _ = os.path.splitext(out_path)
                        out_path = root + os.path.splitext(item["filename"])[1].lower()
                        with open(out_path, "wb") as f:
                            f.write(r.content)
                        return out_path
        raise ComfyError("Render finished but no video file was produced. Does the workflow end in a Save Video node?")

    def generate_video(self, image_path, prompt, out_path, on_progress=None):
        image_name = self.upload_image(image_path)
        prompt_id = self.queue(self.build_workflow(image_name, prompt))
        entry = self.wait(prompt_id, on_progress)
        return self.download_video(entry, out_path)


def client_from_env():
    return ComfyClient(
        base_url=os.environ.get("COMFY_URL", "http://127.0.0.1:8188"),
        workflow_path=os.environ.get(
            "WORKFLOW", os.path.join(os.path.dirname(os.path.abspath(__file__)), "workflows", "wan22_5b_i2v_api.json")
        ),
        timeout_s=int(os.environ.get("RENDER_TIMEOUT_S", "1800")),
        width=os.environ.get("VIDEO_WIDTH"),
        height=os.environ.get("VIDEO_HEIGHT"),
        length=os.environ.get("VIDEO_FRAMES"),
    )


def load_env(path=".env"):
    """Tiny .env loader so Termux needs no extra packages. Existing env vars win."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), path)
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


if __name__ == "__main__":
    load_env()
    p = argparse.ArgumentParser(description="Render one Wan 2.2 video via ComfyUI.")
    p.add_argument("image", nargs="?")
    p.add_argument("prompt", nargs="?")
    p.add_argument("-o", "--out", default="out.mp4")
    p.add_argument("--check", action="store_true", help="only check that ComfyUI is reachable")
    a = p.parse_args()
    c = client_from_env()
    ok, text = c.status()
    print(text)
    if a.check or not ok:
        raise SystemExit(0 if ok else 1)
    if not (a.image and a.prompt):
        p.error("image and prompt are required (or use --check)")
    print("Saved:", c.generate_video(a.image, a.prompt, a.out, on_progress=lambda s: print(f"  ...{s}s", end="\r")))
