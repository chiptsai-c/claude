#!/usr/bin/env bash
# Start ComfyUI so the phone can reach it over Tailscale.
# --listen 0.0.0.0 exposes port 8188 on all interfaces: only do this on a machine
# behind a firewall / NAT, and reach it from the phone via Tailscale, never the open internet.
COMFY="${1:-$HOME/ComfyUI}"
cd "$COMFY" && python main.py --listen 0.0.0.0 --port 8188
