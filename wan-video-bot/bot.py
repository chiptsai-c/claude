"""Telegram agent that turns a photo into a Wan 2.2 video.

Backends (BACKEND in .env):
  fal      phone only: rendering runs on fal.ai's hosted GPUs (default)
  comfyui  your own GPU machine running ComfyUI, reached over Tailscale

Conversation:
  you:  /video (or just send a photo)
  bot:  asks for a photo
  you:  photo (caption optional)
  bot:  asks what should happen, if there was no caption
  you:  "slow zoom in, hair blowing in the wind"
  bot:  renders the video and sends it back
"""

import asyncio
import datetime
import logging
import os
import tempfile

from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import comfy as comfy_backend
import fal_backend
from comfy import ComfyError, load_env

load_env()
logging.basicConfig(format="%(asctime)s %(levelname)s %(message)s", level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("wan-bot")

ALLOWED = {int(x) for x in os.environ.get("ALLOWED_USER_IDS", "").replace(" ", "").split(",") if x}
BACKEND = os.environ.get("BACKEND", "fal").lower()
if BACKEND not in ("fal", "comfyui"):
    raise SystemExit(f"BACKEND must be 'fal' or 'comfyui', not {BACKEND!r}")
backend = (fal_backend if BACKEND == "fal" else comfy_backend).client_from_env()
MAX_PER_DAY = int(os.environ.get("MAX_VIDEOS_PER_DAY", "10"))  # spend guard; 0 = unlimited
render_lock = asyncio.Lock()  # one video at a time
waiting = 0
usage = {"day": None, "count": 0}

HELP = (
    "🎬 I turn a photo into a short AI video.\n\n"
    "1. Send a photo (optionally with a caption describing the motion).\n"
    "2. If there's no caption, I'll ask what should happen.\n"
    "3. Wait a few minutes for the video.\n\n"
    "Prompt tips: describe the movement and the camera, e.g. "
    "\"waves rolling in, palm trees swaying, slow push-in, golden hour\".\n\n"
    "Commands: /video start, /status backend check, /cancel forget current photo, /whoami your user ID."
)


def allowed(update: Update) -> bool:
    return update.effective_user.id in ALLOWED


async def guard(update: Update) -> bool:
    if allowed(update):
        return True
    await update.message.reply_text(
        f"⛔ Not authorised. Your Telegram user ID is {update.effective_user.id}.\n"
        "Add it to ALLOWED_USER_IDS in .env and restart the bot."
    )
    log.warning("Blocked user %s (%s)", update.effective_user.id, update.effective_user.username)
    return False


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if await guard(update):
        await update.message.reply_text(HELP)


async def whoami(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"Your Telegram user ID is {update.effective_user.id}")


async def video(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if await guard(update):
        context.user_data.clear()
        await update.message.reply_text("📸 Send me the photo you want to animate.")


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if await guard(update):
        _forget_photo(context)
        await update.message.reply_text("Cancelled. Send a new photo whenever you're ready.")


async def status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await guard(update):
        return
    ok, text = await asyncio.to_thread(backend.status)
    busy = f"\nThis bot: {'rendering' if render_lock.locked() else 'idle'}, {waiting} waiting."
    if MAX_PER_DAY:
        busy += f"\nVideos today: {_used_today()}/{MAX_PER_DAY}."
    await update.message.reply_text(("✅ " if ok else "❌ ") + text + busy)


async def photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await guard(update):
        return
    msg = update.message
    tg_file = await (msg.photo[-1].get_file() if msg.photo else msg.document.get_file())
    _forget_photo(context)
    suffix = os.path.splitext(tg_file.file_path or "")[1] or ".jpg"
    path = os.path.join(tempfile.gettempdir(), f"wanbot_{msg.chat_id}_{msg.message_id}{suffix}")
    await tg_file.download_to_drive(path)
    context.user_data["photo"] = path

    if msg.caption:
        await render(update, context, msg.caption)
    else:
        await msg.reply_text(
            "👍 Got the photo. What should happen in the video?\n"
            "e.g. \"she turns and smiles, wind in her hair, slow zoom in\""
        )


async def text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await guard(update):
        return
    if "photo" not in context.user_data:
        await update.message.reply_text("📸 First send me a photo, then tell me what should happen.")
        return
    await render(update, context, update.message.text)


async def render(update: Update, context: ContextTypes.DEFAULT_TYPE, prompt: str):
    global waiting
    msg = update.message
    path = context.user_data.pop("photo")
    if MAX_PER_DAY and _used_today() >= MAX_PER_DAY:
        os.remove(path)
        await msg.reply_text(f"🛑 Daily limit of {MAX_PER_DAY} videos reached (MAX_VIDEOS_PER_DAY in .env). "
                             "Try again tomorrow.")
        return
    out = os.path.splitext(path)[0] + ".mp4"

    waiting += 1
    if render_lock.locked():
        await msg.reply_text(f"⏳ Another video is rendering. You're #{waiting} in line.")
    async with render_lock:
        waiting -= 1
        status_msg = await msg.reply_text(f"🎬 Rendering: \"{prompt}\"\nThis usually takes a few minutes…")
        loop = asyncio.get_running_loop()
        last = {"t": 0}

        def progress(seconds):
            if seconds - last["t"] >= 60:  # edit at most once a minute
                last["t"] = seconds
                asyncio.run_coroutine_threadsafe(
                    status_msg.edit_text(f"🎬 Rendering: \"{prompt}\"\n⏱ {seconds // 60} min so far…"), loop
                )

        try:
            log.info("Render start user=%s prompt=%r", update.effective_user.id, prompt)
            out = await asyncio.to_thread(backend.generate_video, path, prompt, out, progress)
            _used_today(add=1)
            size_mb = os.path.getsize(out) / 2**20
            if size_mb > 49:
                await msg.reply_text(f"⚠️ Video is {size_mb:.0f} MB, over Telegram's 50 MB bot limit. "
                                     "Lower VIDEO_WIDTH/VIDEO_HEIGHT/VIDEO_FRAMES in .env.")
            else:
                with open(out, "rb") as f:
                    await msg.reply_video(f, caption=f"✅ AI-generated video\n“{prompt}”",
                                          supports_streaming=True, read_timeout=300, write_timeout=300)
            log.info("Render done (%.1f MB)", size_mb)
        except ComfyError as e:
            await msg.reply_text(f"❌ {e}")
        except Exception as e:  # network errors etc. keep the bot alive
            log.exception("Render failed")
            await msg.reply_text(f"❌ Something went wrong: {type(e).__name__}: {e}\nTry /status.")
        finally:
            for p in (path, out):  # never keep photos or videos on the phone
                if os.path.exists(p):
                    os.remove(p)


def _used_today(add=0):
    today = datetime.date.today()
    if usage["day"] != today:
        usage.update(day=today, count=0)
    usage["count"] += add
    return usage["count"]


def _forget_photo(context):
    path = context.user_data.pop("photo", None)
    if path and os.path.exists(path):
        os.remove(path)


def main():
    token = os.environ.get("BOT_TOKEN")
    if not token:
        raise SystemExit("BOT_TOKEN is missing. Copy .env.example to .env and fill it in.")
    if not ALLOWED:
        log.warning("ALLOWED_USER_IDS is empty: everyone is blocked. Message the bot to get your ID.")
    log.info("Backend %s: %s", BACKEND, backend.status()[1])

    app = ApplicationBuilder().token(token).concurrent_updates(True).build()
    app.add_handler(CommandHandler(["start", "help"], start))
    app.add_handler(CommandHandler("whoami", whoami))
    app.add_handler(CommandHandler("video", video))
    app.add_handler(CommandHandler("cancel", cancel))
    app.add_handler(CommandHandler("status", status))
    app.add_handler(MessageHandler(filters.PHOTO | filters.Document.IMAGE, photo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text))
    log.info("Bot running. Press Ctrl+C to stop.")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
