# Wan Video Bot

A Telegram agent that runs on an Android phone (tested target: Xiaomi 15 Ultra, Termux). You send it a photo and describe the motion, and it sends back a short AI video made with **Wan 2.2** ([Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged)).

**For personal use and testing only.**

```
You (Telegram, any device)
   │ photo + "waves rolling in, slow push-in"
   ▼
📱 Phone (Termux): bot.py ── asks for the photo and prompt, queues the job, sends the video back
   │ Tailscale (private network)
   ▼
🖥️ GPU machine: ComfyUI + Wan 2.2 does the rendering
```

The phone runs the agent. The **rendering needs an NVIDIA GPU**: a home PC with 12 GB+ VRAM, or a rented cloud GPU. A phone can't run Wan 2.2.

---

## Part 1: GPU machine (about 30 min, once)

1. **Install ComfyUI**
   - Windows: download **ComfyUI Portable** or **ComfyUI Desktop** from <https://www.comfy.org/download>.
   - Linux or cloud GPU: `git clone https://github.com/comfyanonymous/ComfyUI && cd ComfyUI && pip install -r requirements.txt`.
   - Update to the latest version, because Wan 2.2 nodes need a recent build.
2. **Download the models (about 17 GB)**
   - Linux, WSL or cloud: `bash gpu/download_models.sh ~/ComfyUI`
   - Windows: download these files manually and put them in the folders shown:

     | File | Put in `ComfyUI/models/…` | From |
     |---|---|---|
     | `wan2.2_ti2v_5B_fp16.safetensors` | `diffusion_models/` | Wan_2.2 repo → `split_files/diffusion_models` |
     | `wan2.2_vae.safetensors` | `vae/` | Wan_2.2 repo → `split_files/vae` |
     | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `text_encoders/` | [Wan_2.1 repo](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/text_encoders) |
3. **Install Tailscale** (<https://tailscale.com/download>) and sign in. Note the machine's Tailscale IP (`100.x.y.z`).
4. **Start ComfyUI so it accepts connections from the phone**
   - Linux: `bash gpu/start_comfyui.sh ~/ComfyUI`
   - Windows Portable: edit `run_nvidia_gpu.bat` to add `--listen 0.0.0.0` after `main.py`, then run it.
   - Desktop app: **Settings → Server-Config → Host = 0.0.0.0**, then restart.
5. **Test it once in the browser:** open `http://localhost:8188`, then **Templates → Video → Wan 2.2 5B**, and generate one video. If that works, the bot will work.

> Keep port 8188 private. Reach it only over Tailscale and never forward it on your router, because ComfyUI has no login.

## Part 2: Phone (about 15 min, once)

1. **Install apps**
   - **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/). The Play Store version is outdated and broken.
   - **Termux:API** and, optionally, **Termux:Boot** from F-Droid.
   - **Tailscale** from the Play Store. Sign in with the same account as the GPU machine.
2. **Stop HyperOS killing the bot**
   - **Settings → Apps → Manage apps → Termux → Battery saver → No restrictions**
   - **Settings → Apps → Manage apps → Termux → Autostart → On**
   - Open Recents, long-press Termux, and tap the 🔒 lock icon.
3. **Create the Telegram bot.** In Telegram, message **@BotFather**, send `/newbot`, and copy the **token**.
4. **Get the code and install it.** In Termux:
   ```bash
   pkg install -y git
   git clone -b claude/wan-comfyui-video-jhfmn6 https://github.com/chiptsai-c/claude.git
   cd claude/wan-video-bot
   bash termux/install.sh
   ```
   If the repo is private, git asks for a username and password. Enter your GitHub username, and for the password paste a [Personal Access Token](https://github.com/settings/tokens) (classic, scope `repo`), not your GitHub password.
5. **Configure.** Run `nano .env` and set:
   - `BOT_TOKEN`: from BotFather
   - `COMFY_URL`: `http://<GPU Tailscale IP>:8188`
   - Save with `Ctrl+O`, `Enter`, then exit with `Ctrl+X`. On Termux's extra-keys row, Ctrl is the `CTRL` key.
6. **Check the GPU connection:** `python comfy.py --check` should print `ComfyUI online. GPU: …`.
7. **Start the bot, then find your user ID**
   ```bash
   bash termux/run.sh
   ```
   Message your bot `/whoami` in Telegram, then put that number in `ALLOWED_USER_IDS` in `.env`. Stop the bot with `Ctrl+C` and run `bash termux/run.sh` again. Until you do this, the bot refuses everyone, including you.

## Using it

| You send | Bot does |
|---|---|
| Photo with a caption | Starts rendering straight away using the caption as the prompt |
| Photo without a caption | Asks what should happen, and your next message becomes the prompt |
| `/video` | Asks for a photo |
| `/status` | Shows whether the GPU is online and the queue length |
| `/cancel` | Forgets the pending photo |

**Prompt tips:** describe the motion and the camera, not the picture. For example: *"the woman turns to the camera and smiles, hair blowing in the wind, slow push-in, warm sunset light."*

**Timing:** a 5-second 1280×704 clip takes roughly 4–10 minutes on an RTX 4090/3090, and longer on smaller GPUs. For quicker tests, uncomment these lines in `.env`:
```
VIDEO_WIDTH=832
VIDEO_HEIGHT=480
VIDEO_FRAMES=73
```

## Using your own workflow (e.g. Wan 2.2 14B)

1. In ComfyUI, load the template you want, such as **Wan 2.2 14B Image to Video**.
2. Make sure the **Load Image** node is enabled. If it's purple or bypassed, select it and press `Ctrl+B`.
3. Turn on **Settings → Comfy → Dev mode**, then use **Workflow → Export (API)**.
4. Copy the JSON into `workflows/` on the phone and set `WORKFLOW=workflows/<file>.json` in `.env`.

The bot finds the image node and the positive prompt node automatically, and it randomises the seed on each run.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ComfyUI not reachable` | Tailscale must be on for both devices. ComfyUI must have been started with `--listen 0.0.0.0`. Check that the IP and port in `COMFY_URL` are right. |
| `Value not in list … unet_name` | A model file is missing or in the wrong folder (see Part 1, step 2). Restart ComfyUI after adding files. |
| `node … does not exist` | ComfyUI is too old. Update it. |
| Out of memory / render fails | Use the smaller `VIDEO_*` settings, or start ComfyUI with `--lowvram`. |
| Bot stops when the screen is off | Re-check Part 2, step 2. `run.sh` already holds a wake lock and restarts the bot after a crash. |
| Video is over 50 MB | Telegram bots can't send files that large. Lower the resolution or frame count. |

Logs are in `logs/bot.log`. Photos and videos are deleted from the phone after each job. ComfyUI keeps its own copies in `ComfyUI/input` and `ComfyUI/output` on the GPU machine, so clear those folders yourself.

## Responsible use
- Only animate photos you own, or people who have agreed to it. Never use it to impersonate anyone.
- Label outputs as AI-generated if you share them. The bot's caption already does this.
- Keep `ALLOWED_USER_IDS` limited to yourself and people you trust, because each request uses your GPU.

## Development
```bash
pip install -r requirements.txt
python -m unittest discover -s tests   # fake ComfyUI server, no GPU needed
python comfy.py photo.jpg "slow zoom in" -o out.mp4   # one render without Telegram
```
