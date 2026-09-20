#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="$(basename "$WORKSPACE_DIR")"

# Append a line to a file only if it isn't already present (idempotent re-runs).
append_once() {
  local file="$1" line="$2"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  grep -qxF "$line" "$file" 2>/dev/null || printf '%s\n' "$line" >> "$file"
}

# --- Interactive shell -------------------------------------------------------
append_once "$HOME/.bashrc" \
  "export PS1='\\[\\e[1;32m\\]\\u@${PROJECT_NAME}\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]\\$ '"
append_once "$HOME/.bashrc" 'eval "$(direnv hook bash)"'

# --- Nix user config (flakes + quieter output) -------------------------------
append_once "$HOME/.config/nix/nix.conf" "experimental-features = nix-command flakes"
append_once "$HOME/.config/nix/nix.conf" "warn-dirty = false"

# --- bun global bin ----------------------------------------------------------
# `bun install -g` drops binaries in $BUN_INSTALL/bin, which is not on PATH by
# default. Bun itself comes from the flake, so nothing is installed here.
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
mkdir -p "$BUN_INSTALL/bin"

append_once "$HOME/.bashrc" "export BUN_INSTALL=\"$BUN_INSTALL\""
append_once "$HOME/.bashrc" "export PATH=\"\$BUN_INSTALL/bin:\$PATH\""

# --- direnv / flake bootstrap ------------------------------------------------
if [ ! -f "$WORKSPACE_DIR/.envrc" ]; then
  printf 'use flake\n' > "$WORKSPACE_DIR/.envrc" \
    || echo "warning: could not write $WORKSPACE_DIR/.envrc; skipping direnv setup" >&2
fi
if [ -f "$WORKSPACE_DIR/.envrc" ]; then
  direnv allow "$WORKSPACE_DIR" \
    || echo "warning: 'direnv allow' failed; env will load once the flake is valid" >&2
fi

# --- Claim the shared /nix store (one-time bootstrap) ------------------------
# The single-user store is seeded root-owned by the image build; hand it to the
# dev user once. Runs against the mounted volume, so the fix persists.
# NOTE: ongoing correctness depends on EVERY container mounting this volume
# running as the same uid/gid (1000). A sibling running as root plants
# root-owned paths this cheap guard won't catch (big-lock stays writable).
if [ ! -w /nix/var/nix/db/big-lock ]; then
  echo "Claiming /nix for $(id -un) (uid $(id -u))..."
  sudo chown -R "$(id -u):$(id -g)" /nix \
    || echo "warning: could not chown /nix; nix will fail until this is fixed" >&2
fi

# --- git --------------------------------------------------------------------
git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$WORKSPACE_DIR" \
  || git config --global --add safe.directory "$WORKSPACE_DIR"
git lfs install --skip-repo \
  || echo "warning: 'git lfs install' failed; continuing" >&2
