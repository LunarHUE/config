#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$WORKSPACE_DIR/.envrc" ]; then
  direnv allow "$WORKSPACE_DIR" >/dev/null 2>&1 || true
fi

# BASH_ENV makes non-interactive SSH Bash read .bashrc. Load the repo
# environment before that early return so remote servers inherit the dev tools.
BASHRC="$HOME/.bashrc"
touch "$BASHRC"
BASHRC_NEXT="$(mktemp)"
trap 'rm -f "$BASHRC_NEXT"' EXIT
{
  echo '# BEGIN devcontainer SSH direnv'
  printf 'if [[ -n "${SSH_CONNECTION:-}" && "${DEVCONTAINER_LOADING_DIRENV:-}" != 1 && -f %q/.envrc ]]; then\n' "$WORKSPACE_DIR"
  printf '  eval "$(cd %q && /usr/bin/env -u DIRENV_DIFF -u DIRENV_DIR -u DIRENV_FILE -u DIRENV_WATCHES DEVCONTAINER_LOADING_DIRENV=1 /usr/bin/direnv export bash)"\n' "$WORKSPACE_DIR"
  echo '  export DEVCONTAINER_WORKSPACE_PATH="$PATH"'
  echo 'fi'
  echo '# END devcontainer SSH direnv'
  awk '
    $0 == "# BEGIN devcontainer SSH direnv" { skip = 1; next }
    $0 == "# END devcontainer SSH direnv" { skip = 0; next }
    !skip { print }
  ' "$BASHRC"
} > "$BASHRC_NEXT"
if ! cmp -s "$BASHRC_NEXT" "$BASHRC"; then
  cp -p "$BASHRC" "$BASHRC.before-ssh-direnv"
  cat "$BASHRC_NEXT" > "$BASHRC"
fi

# The common-utils feature resets PATH in /etc/profile.d/00-restore-env.sh.
# T3 launches through login sh, which reads .profile instead of .bashrc.
# Restore the toolchain PATH loaded by the outer SSH Bash shell.
PROFILE_LINE='[ -z "${DEVCONTAINER_WORKSPACE_PATH:-}" ] || export PATH="$DEVCONTAINER_WORKSPACE_PATH"'
touch "$HOME/.profile"
grep -qxF "$PROFILE_LINE" "$HOME/.profile" || printf '\n%s\n' "$PROFILE_LINE" >> "$HOME/.profile"

# Personal instructions and skills live on the per-user shared volume.
# Preserve a pre-existing local directory before replacing it with the link.
if [ -d /mnt/user-home/.agents ] && [ "$(readlink "$HOME/.agents" 2>/dev/null || true)" != /mnt/user-home/.agents ]; then
  if [ -e "$HOME/.agents" ] || [ -L "$HOME/.agents" ]; then
    mv "$HOME/.agents" "$HOME/.agents.before-shared-$(date +%Y%m%d-%H%M%S)"
  fi
  ln -s /mnt/user-home/.agents "$HOME/.agents"
fi
