#!/data/data/com.termux/files/usr/bin/bash
# One-time setup in Termux:  bash termux/install.sh
set -e
cd "$(dirname "$0")/.."

echo "==> Installing Python and tools"
pkg update -y
pkg install -y python git termux-api

echo "==> Installing Python packages"
pip install -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> Created .env. Edit it now:  nano .env"
fi

# Optional auto-start on phone boot (needs the Termux:Boot app from F-Droid)
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/wan-video-bot.sh <<BOOT
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd "$PWD" && nohup bash termux/run.sh >/dev/null 2>&1 &
BOOT
chmod +x ~/.termux/boot/wan-video-bot.sh termux/*.sh

echo
echo "Done. Next:"
echo "  1. nano .env        (BOT_TOKEN and FAL_KEY; or BACKEND=comfyui + COMFY_URL)"
echo "  2. bash termux/run.sh"
echo "  3. Send /whoami to your bot, put the number in ALLOWED_USER_IDS, restart"
