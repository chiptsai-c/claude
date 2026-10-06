# Wan Video Bot

A Telegram agent that runs on an Android phone (target: Xiaomi 15 Ultra, Termux). You send it a photo and describe the motion, and it sends back a short AI video made with **Wan 2.2**.

**For personal use and testing only.**

There are two ways to render. The bot is the same for both; you pick one with `BACKEND` in `.env`.

| | **Phone only** (`BACKEND=fal`, default) | **Own GPU** (`BACKEND=comfyui`) |
|---|---|---|
| What you need | Just the phone + a [fal.ai](https://fal.ai) account | Phone + a PC with an NVIDIA GPU (12 GB+), running ComfyUI |
| Model | Wan 2.2 hosted by fal.ai | Wan 2.2 from [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged) |
| Cost | Pay per video (see the model's page on fal.ai) | Free after the hardware |
| Setup | About 15 min | About 1 hour |

```
Phone only:   You ─Telegram─▶ 📱 bot.py (Termux) ─HTTPS─▶ ☁️ fal.ai renders Wan 2.2 ─▶ video back to you
Own GPU:      You ─Telegram─▶ 📱 bot.py (Termux) ─Tailscale─▶ 🖥️ ComfyUI renders Wan 2.2 ─▶ video back to you
```

A phone can't render Wan 2.2 itself: ComfyUI needs an NVIDIA GPU, and the model needs more memory than the phone has. So even in phone-only mode the video is made on fal.ai's servers, but there's nothing else for you to install or keep switched on.

---

## Setup: phone only (about 15 min)

1. **Get a fal.ai API key.** Sign up at <https://fal.ai>, add a small amount of credit (USD 5–10 is plenty for testing), then create a key at <https://fal.ai/dashboard/keys>.
2. **Install apps** on the phone:
   - **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/). The Play Store version is outdated and broken.
   - **Termux:API** and, optionally, **Termux:Boot** (auto-start after reboot), both from F-Droid.
3. **Stop HyperOS killing the bot**
   - **Settings → Apps → Manage apps → Termux → Battery saver → No restrictions**
   - **Settings → Apps → Manage apps → Termux → Autostart → On**
   - Open Recents, long-press Termux, and tap the 🔒 lock icon.
4. **Create the Telegram bot.** In Telegram, message **@BotFather**, send `/newbot`, and copy the **token**.
5. **Get the code and install it.** In Termux:
   ```bash
   pkg install -y git
   git clone -b claude/wan-comfyui-video-jhfmn6 https://github.com/chiptsai-c/claude.git
   cd claude/wan-video-bot
   bash termux/install.sh
   ```
   If the repo is private, git asks for a username and password. Enter your GitHub username, and for the password paste a [Personal Access Token](https://github.com/settings/tokens) (classic, scope `repo`), not your GitHub password.
6. **Configure.** Run `nano .env` and set:
   - `BOT_TOKEN`: from BotFather
   - `FAL_KEY`: from step 1
   - For cheap first tests, uncomment `FAL_RESOLUTION=480p`.
   - Save with `Ctrl+O`, `Enter`, then exit with `Ctrl+X`. On Termux's extra-keys row, Ctrl is the `CTRL` key.
7. **Start the bot, then find your user ID**
   ```bash
   bash termux/run.sh
   ```
   Message your bot `/whoami` in Telegram, then put that number in `ALLOWED_USER_IDS` in `.env`. Stop the bot with `Ctrl+C` and run `bash termux/run.sh` again. Until you do this, the bot refuses everyone, including you.
8. **Try it.** Send the bot a photo with a caption such as *"waves rolling in, slow push-in"*.

Optional test without Telegram: `python fal_backend.py photo.jpg "slow zoom in"`. Termux can see your phone's photos after you run `termux-setup-storage`; they're under `~/storage/dcim/Camera/`.

### Choosing the fal.ai model
| `FAL_MODEL` | Notes |
|---|---|
| `fal-ai/wan/v2.2-5b/image-to-video` (default) | Cheaper and faster. Good for testing. |
| `fal-ai/wan/v2.2-a14b/image-to-video` | Higher quality, costs more. |

Check the current price and options on each model's page at fal.ai. Pass extra options with `FAL_EXTRA_ARGS` as JSON, for example `{"num_frames": 81}`.

`MAX_VIDEOS_PER_DAY` (default 10) caps how many videos the bot makes per day, so a runaway loop or a shared bot can't drain your fal.ai credit.

---

## Setup: own GPU with ComfyUI (optional)

Use this if you later get access to an NVIDIA PC and want to run the Comfy-Org models yourself at no per-video cost.

**On the GPU machine:**
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
3. **Install Tailscale** (<https://tailscale.com/download>) on the GPU machine and the phone, signed in to the same account. Note the GPU machine's Tailscale IP (`100.x.y.z`).
4. **Start ComfyUI so it accepts connections from the phone**
   - Linux: `bash gpu/start_comfyui.sh ~/ComfyUI`
   - Windows Portable: edit `run_nvidia_gpu.bat` to add `--listen 0.0.0.0` after `main.py`, then run it.
   - Desktop app: **Settings → Server-Config → Host = 0.0.0.0**, then restart.
5. **Test it once in the browser:** open `http://localhost:8188`, then **Templates → Video → Wan 2.2 5B**, and generate one video.

> Keep port 8188 private. Reach it only over Tailscale and never forward it on your router, because ComfyUI has no login.

**On the phone:** in `.env` set `BACKEND=comfyui` and `COMFY_URL=http://<GPU Tailscale IP>:8188`. Check the connection with `python comfy.py --check`, which should print `ComfyUI online. GPU: …`, then restart the bot.

For quicker renders, uncomment `VIDEO_WIDTH=832`, `VIDEO_HEIGHT=480` and `VIDEO_FRAMES=73` in `.env`. A 5-second 1280×704 clip takes roughly 4–10 minutes on an RTX 4090/3090.

### Using your own ComfyUI workflow (e.g. Wan 2.2 14B)
1. In ComfyUI, load the template you want, such as **Wan 2.2 14B Image to Video**.
2. Make sure the **Load Image** node is enabled. If it's purple or bypassed, select it and press `Ctrl+B`.
3. Turn on **Settings → Comfy → Dev mode**, then use **Workflow → Export (API)**.
4. Copy the JSON into `workflows/` on the phone and set `WORKFLOW=workflows/<file>.json` in `.env`.

The bot finds the image node and the positive prompt node automatically, and it randomises the seed on each run.

---

## Using it

| You send | Bot does |
|---|---|
| Photo with a caption | Starts rendering straight away using the caption as the prompt |
| Photo without a caption | Asks what should happen, and your next message becomes the prompt |
| `/video` | Asks for a photo |
| `/status` | Shows whether the backend is ready, the queue, and today's video count |
| `/cancel` | Forgets the pending photo |

**Prompt tips:** describe the motion and the camera, not the picture. For example: *"the woman turns to the camera and smiles, hair blowing in the wind, slow push-in, warm sunset light."*

Send pictures as a normal **photo**, not as a file, so Telegram compresses them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `API key rejected` | Check `FAL_KEY` in `.env` and that your fal.ai account has credit. |
| `fal.ai submit failed (422)` | An option isn't valid for that model. Check `FAL_RESOLUTION` and `FAL_EXTRA_ARGS` against the model's API page. |
| `Daily limit … reached` | Raise `MAX_VIDEOS_PER_DAY` in `.env`, or wait until tomorrow. |
| `ComfyUI not reachable` | Tailscale must be on for both devices. ComfyUI must have been started with `--listen 0.0.0.0`. Check the IP and port in `COMFY_URL`. |
| `Value not in list … unet_name` | A model file is missing or in the wrong folder. Restart ComfyUI after adding files. |
| `node … does not exist` | ComfyUI is too old. Update it. |
| Bot stops when the screen is off | Re-check the battery settings in setup step 3. `run.sh` already holds a wake lock and restarts the bot after a crash. |
| Video is over 50 MB | Telegram bots can't send files that large. Lower the resolution or frame count. |

Logs are in `logs/bot.log`. Photos and videos are deleted from the phone after each job.

## Privacy and responsible use
- **Phone-only mode sends your photo and prompt to fal.ai.** Don't use photos you wouldn't upload to an online service, and check fal.ai's data-retention terms. Use the own-GPU mode if photos must stay private.
- Only animate photos you own, or people who have agreed to it. Never use it to impersonate anyone.
- Label outputs as AI-generated if you share them. The bot's caption already does this.
- Keep `ALLOWED_USER_IDS` limited to yourself and people you trust, because each video costs money or GPU time.

## Development
```bash
pip install -r requirements.txt
python -m unittest discover -s tests   # fake fal.ai and ComfyUI servers, no network or GPU needed
```
