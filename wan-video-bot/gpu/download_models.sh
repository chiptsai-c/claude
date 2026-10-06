#!/usr/bin/env bash
# Run on the GPU machine (Linux / WSL / cloud GPU) to fetch Wan 2.2 5B models.
# Usage: bash download_models.sh /path/to/ComfyUI
# Add --14b to also fetch the 14B image-to-video pair (~30 GB, needs 24 GB+ VRAM).
set -e
COMFY="${1:-$HOME/ComfyUI}"
WAN22=https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files
WAN21=https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files

get() {  # get <url> <dest-dir>
  mkdir -p "$2"
  local f="$2/$(basename "$1")"
  if [ -f "$f" ]; then echo "  have $(basename "$f")"; return; fi
  echo "  downloading $(basename "$f")"
  curl -fL --retry 3 -C - -o "$f.part" "$1" && mv "$f.part" "$f"
}

M="$COMFY/models"
get "$WAN22/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors" "$M/diffusion_models"
get "$WAN22/vae/wan2.2_vae.safetensors"                        "$M/vae"
get "$WAN21/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors" "$M/text_encoders"

if [ "$2" = "--14b" ]; then
  get "$WAN22/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors" "$M/diffusion_models"
  get "$WAN22/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"  "$M/diffusion_models"
  get "$WAN22/vae/wan_2.1_vae.safetensors" "$M/vae"
fi
echo "Models ready in $M"
