#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${1:-blackknight@100.98.190.19}"
REMOTE_RUNTIME_DIR="${2:-~/work/emet-runtime}"
REMOTE_TRAIN_DIR="${REMOTE_TRAIN_DIR:-~/work/emet-router-phase4-20260521}"
NODE_LINE="${NODE_LINE:-22}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ssh "$REMOTE_HOST" "mkdir -p $REMOTE_RUNTIME_DIR/.cache/models/emet-router"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.venv*' \
  --exclude '.cache' \
  --exclude '.sem' \
  --exclude '.pi-context' \
  --exclude '__pycache__' \
  ./ "$REMOTE_HOST:$REMOTE_RUNTIME_DIR/"

if [ -d ".cache/models/emet-router/followup" ]; then
  rsync -az \
    .cache/models/emet-router/followup/ \
    "$REMOTE_HOST:$REMOTE_RUNTIME_DIR/.cache/models/emet-router/followup/"
fi

ssh "$REMOTE_HOST" "REMOTE_RUNTIME_DIR=$REMOTE_RUNTIME_DIR REMOTE_TRAIN_DIR=$REMOTE_TRAIN_DIR NODE_LINE=$NODE_LINE bash -s" <<'EOF'
set -euo pipefail
cd "$REMOTE_RUNTIME_DIR"

mkdir -p .cache/models/emet-router
for model in domain conflict-structured sufficiency-structured; do
  if [ -d "$REMOTE_TRAIN_DIR/.cache/models/emet-router/$model" ]; then
    rm -rf ".cache/models/emet-router/$model"
    cp -R "$REMOTE_TRAIN_DIR/.cache/models/emet-router/$model" ".cache/models/emet-router/$model"
  fi
done

if ! command -v node >/dev/null 2>&1; then
  mkdir -p "$HOME/.local"
  cd "$HOME/.local"
  DIST_DIR="latest-v${NODE_LINE}.x"
  SHASUMS_URL="https://nodejs.org/dist/${DIST_DIR}/SHASUMS256.txt"
  TARBALL="$(curl -fsSL "$SHASUMS_URL" | awk '/linux-x64.tar.xz$/ {print $2; exit}')"
  if [ -z "$TARBALL" ]; then
    echo "Failed to resolve Node.js tarball from $SHASUMS_URL" >&2
    exit 1
  fi
  curl -fsSLO "https://nodejs.org/dist/${DIST_DIR}/${TARBALL}"
  tar -xf "$TARBALL"
  rm -f "$TARBALL"
  NODE_DIR="${TARBALL%.tar.xz}"
  ln -sfn "$HOME/.local/$NODE_DIR" "$HOME/.local/node-v${NODE_LINE}"
  ln -sfn "$HOME/.local/$NODE_DIR" "$HOME/.local/node"
fi

if [ ! -L "$HOME/.local/node" ] && [ -d "$HOME/.local/node-v${NODE_LINE}" ]; then
  ln -sfn "$HOME/.local/node-v${NODE_LINE}" "$HOME/.local/node"
fi

cd "$REMOTE_RUNTIME_DIR"
export PATH="$HOME/.local/node/bin:$PATH"
node --version
npm --version
npm install

python3 -m venv .venv-router
. .venv-router/bin/activate
pip install -r ml/router/requirements.txt

cat > start-mcp-tiny-router-safe.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$PATH"
export EMET_TINY_ROUTER=1
export EMET_TINY_ROUTER_MODEL="$PWD/.cache/models/emet-router"
export EMET_TINY_ROUTER_PYTHON="$PWD/.venv-router/bin/python"
export EMET_TINY_ROUTER_TIMEOUT_MS="${EMET_TINY_ROUTER_TIMEOUT_MS:-50}"
export EMET_TINY_ROUTER_DOMAIN=1
export EMET_TINY_ROUTER_FOLLOWUP=0
export EMET_TINY_ROUTER_CONFLICT=0
export EMET_TINY_ROUTER_SUFFICIENCY=0
exec node ./mcp/server.js
SH
chmod +x start-mcp-tiny-router-safe.sh

cat > start-mcp-tiny-router-experimental.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$PATH"
export EMET_TINY_ROUTER=1
export EMET_TINY_ROUTER_MODEL="$PWD/.cache/models/emet-router"
export EMET_TINY_ROUTER_PYTHON="$PWD/.venv-router/bin/python"
export EMET_TINY_ROUTER_TIMEOUT_MS="${EMET_TINY_ROUTER_TIMEOUT_MS:-50}"
export EMET_TINY_ROUTER_DOMAIN=1
export EMET_TINY_ROUTER_FOLLOWUP=1
export EMET_TINY_ROUTER_CONFLICT=1
export EMET_TINY_ROUTER_SUFFICIENCY=1
exec node ./mcp/server.js
SH
chmod +x start-mcp-tiny-router-experimental.sh

node -e "import('./mcp/server.js').then((m) => console.log(JSON.stringify(m.buildInitializeResult().serverInfo)))"

find .cache/models/emet-router -maxdepth 2 -type f | sort
EOF

echo "Deployed to $REMOTE_HOST:$REMOTE_RUNTIME_DIR"
