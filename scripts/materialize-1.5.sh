#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cat .release/ev150-source-bundle-part-*.b64 | tr -d '\r\n' | base64 -d > "$tmp_dir/source.tar.gz"
tar -xzf "$tmp_dir/source.tar.gz" -C .

cat .release/ev150-mini-assets-part-*.b64 | tr -d '\r\n' | base64 -d > "$tmp_dir/assets.tar.gz"
tar -xzf "$tmp_dir/assets.tar.gz" -C .

echo "Evercade Next 1.5.0 source and cartridge assets materialized."
