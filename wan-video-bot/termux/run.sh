#!/data/data/com.termux/files/usr/bin/bash
# Keeps the bot running: holds a wake lock and restarts it if it crashes.
cd "$(dirname "$0")/.."
mkdir -p logs
command -v termux-wake-lock >/dev/null && termux-wake-lock
while true; do
  echo "[$(date)] starting bot" | tee -a logs/bot.log
  python bot.py 2>&1 | tee -a logs/bot.log
  echo "[$(date)] bot exited, restarting in 10s (Ctrl+C to stop)" | tee -a logs/bot.log
  sleep 10
done
