"""Phone-only backend: renders Wan 2.2 on fal.ai's hosted GPUs.

No ComfyUI or GPU machine needed; the phone sends the photo and prompt to
fal.ai's queue API and downloads the finished video.

Run directly to test without Telegram:
    python fal_backend.py photo.jpg "camera slowly zooms in, leaves blowing"
"""

import base64
import json
import mimetypes
import os
import time

import requests

from comfy import ComfyError, load_env

DEFAULT_MODEL = "fal-ai/wan/v2.2-5b/image-to-video"
MAX_IMAGE_MB = 8  # sent inline as a data URI; Telegram "photo" uploads are well below this


class FalClient:
    def __init__(self, api_key, model=DEFAULT_MODEL, timeout_s=1800, extra_args=None,
                 base_url="https://queue.fal.run"):
        self.key = api_key
        self.model = model.strip("/")
        self.timeout_s = timeout_s
        self.extra_args = extra_args or {}
        self.base = base_url.rstrip("/")

    @property
    def _headers(self):
        return {"Authorization": f"Key {self.key}", "Content-Type": "application/json"}

    def status(self):
        if not self.key:
            return False, "FAL_KEY is missing in .env (get one at https://fal.ai/dashboard/keys)."
        return True, f"fal.ai backend ready. Model: {self.model}."

    def _data_uri(self, image_path):
        size_mb = os.path.getsize(image_path) / 2**20
        if size_mb > MAX_IMAGE_MB:
            raise ComfyError(f"Photo is {size_mb:.0f} MB; send it as a normal photo (not a file) so Telegram compresses it.")
        mime = mimetypes.guess_type(image_path)[0] or "image/jpeg"
        with open(image_path, "rb") as f:
            return f"data:{mime};base64,{base64.b64encode(f.read()).decode()}"

    def _check(self, r, what):
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail", r.text)
            except ValueError:
                detail = r.text
            if r.status_code in (401, 403):
                detail = "API key rejected. Check FAL_KEY in .env and that your fal.ai account has credit."
            raise ComfyError(f"fal.ai {what} failed ({r.status_code}): {json.dumps(detail)[:800]}")
        return r.json()

    def generate_video(self, image_path, prompt, out_path, on_progress=None):
        if not self.key:
            raise ComfyError(self.status()[1])
        payload = {**self.extra_args, "prompt": prompt, "image_url": self._data_uri(image_path)}
        job = self._check(requests.post(f"{self.base}/{self.model}", headers=self._headers, json=payload, timeout=120),
                          "submit")
        status_url, response_url = job["status_url"], job["response_url"]

        start = time.time()
        while True:
            if time.time() - start > self.timeout_s:
                raise ComfyError(f"Timed out after {self.timeout_s}s waiting for fal.ai.")
            st = self._check(requests.get(status_url, headers=self._headers, timeout=30), "status check")
            if st.get("status") == "COMPLETED":
                break
            if on_progress:
                on_progress(int(time.time() - start))
            time.sleep(5)

        result = self._check(requests.get(response_url, headers=self._headers, timeout=60), "result")
        url = (result.get("video") or {}).get("url")
        if not url:
            raise ComfyError(f"fal.ai finished but returned no video: {json.dumps(result)[:500]}")
        r = requests.get(url, timeout=300)
        r.raise_for_status()
        with open(out_path, "wb") as f:
            f.write(r.content)
        return out_path


def client_from_env():
    extra = os.environ.get("FAL_EXTRA_ARGS", "").strip()
    try:
        extra = json.loads(extra) if extra else {}
    except json.JSONDecodeError as e:
        raise SystemExit(f"FAL_EXTRA_ARGS in .env is not valid JSON: {e}")
    if os.environ.get("FAL_RESOLUTION"):
        extra.setdefault("resolution", os.environ["FAL_RESOLUTION"])
    return FalClient(
        api_key=os.environ.get("FAL_KEY", ""),
        model=os.environ.get("FAL_MODEL", DEFAULT_MODEL),
        timeout_s=int(os.environ.get("RENDER_TIMEOUT_S", "1800")),
        extra_args=extra,
    )


if __name__ == "__main__":
    import argparse

    load_env()
    p = argparse.ArgumentParser(description="Render one Wan 2.2 video on fal.ai.")
    p.add_argument("image")
    p.add_argument("prompt")
    p.add_argument("-o", "--out", default="out.mp4")
    a = p.parse_args()
    c = client_from_env()
    print(c.status()[1])
    print("Saved:", c.generate_video(a.image, a.prompt, a.out, on_progress=lambda s: print(f"  ...{s}s", end="\r")))
