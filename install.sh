#!/usr/bin/env bash
set -euo pipefail

QDRANT_VERSION="v1.14.0"
INSTALL_DIR="/usr/local/bin"
QDRANT_DATA_DIR="$HOME/.miraclaw/qdrant"
QDRANT_CONFIG_DIR="/etc/qdrant"
QDRANT_SERVICE="/etc/systemd/system/qdrant.service"
MIRACLAW_BIN="$INSTALL_DIR/miraclaw"

# ── helpers ──────────────────────────────────────────────────────────────────

info()    { echo -e "\033[1;34m[*]\033[0m $*"; }
success() { echo -e "\033[1;32m[✓]\033[0m $*"; }
warn()    { echo -e "\033[1;33m[!]\033[0m $*"; }
die()     { echo -e "\033[1;31m[✗]\033[0m $*" >&2; exit 1; }

require() {
    command -v "$1" &>/dev/null || die "$1 is required but not installed. Install it and re-run."
}

# ── checks ───────────────────────────────────────────────────────────────────

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash install.sh"

require curl
require go
require systemctl

ARCH=$(uname -m)
case "$ARCH" in
    x86_64)  QDRANT_ARCH="x86_64-unknown-linux-musl" ;;
    aarch64) QDRANT_ARCH="aarch64-unknown-linux-musl" ;;
    *)       die "Unsupported architecture: $ARCH" ;;
esac

# ── install qdrant ────────────────────────────────────────────────────────────

if command -v qdrant &>/dev/null; then
    success "Qdrant already installed, skipping download"
else
    info "Downloading Qdrant $QDRANT_VERSION ($QDRANT_ARCH)..."
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT

    curl -fsSL \
        "https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-${QDRANT_ARCH}.tar.gz" \
        -o "$TMP/qdrant.tar.gz"

    tar -xzf "$TMP/qdrant.tar.gz" -C "$TMP"
    install -m 755 "$TMP/qdrant" "$INSTALL_DIR/qdrant"
    success "Qdrant installed to $INSTALL_DIR/qdrant"
fi

# ── qdrant config & data dirs ─────────────────────────────────────────────────

mkdir -p "$QDRANT_DATA_DIR"
mkdir -p "$QDRANT_CONFIG_DIR"

if [[ ! -f "$QDRANT_CONFIG_DIR/config.yaml" ]]; then
    cat > "$QDRANT_CONFIG_DIR/config.yaml" <<EOF
storage:
  storage_path: $QDRANT_DATA_DIR

service:
  grpc_port: 6334
  http_port: 6333
EOF
    success "Qdrant config written to $QDRANT_CONFIG_DIR/config.yaml"
fi

# ── systemd service ───────────────────────────────────────────────────────────

if [[ ! -f "$QDRANT_SERVICE" ]]; then
    info "Creating systemd service for Qdrant..."
    cat > "$QDRANT_SERVICE" <<EOF
[Unit]
Description=Qdrant vector database
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/qdrant --config-path $QDRANT_CONFIG_DIR/config.yaml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable qdrant
    success "Qdrant systemd service installed and enabled"
fi

info "Starting Qdrant..."
systemctl start qdrant

# wait up to 15s for Qdrant gRPC to be ready
for i in $(seq 1 15); do
    if curl -sf http://localhost:6333/healthz &>/dev/null; then
        success "Qdrant is running"
        break
    fi
    [[ $i -eq 15 ]] && die "Qdrant did not start in time. Check: journalctl -u qdrant"
    sleep 1
done

# ── build miraclaw ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
info "Building MiraClaw..."
(cd "$SCRIPT_DIR" && go build -o "$MIRACLAW_BIN" .)
success "MiraClaw installed to $MIRACLAW_BIN"

# ── bashrc integration ────────────────────────────────────────────────────────

# Determine the actual user's bashrc (not root's) when running via sudo
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER")
BASHRC="$REAL_HOME/.bashrc"
MARKER="# miraclaw"

if ! grep -q "$MARKER" "$BASHRC" 2>/dev/null; then
    info "Adding miraclaw alias to $BASHRC..."
    cat >> "$BASHRC" <<EOF

$MARKER
alias miraclaw='$MIRACLAW_BIN'
EOF
    success "Alias added. Run: source ~/.bashrc  (or open a new terminal)"
else
    warn "miraclaw alias already in $BASHRC, skipping"
fi

# ── run setup wizard ──────────────────────────────────────────────────────────

echo
info "Running MiraClaw setup wizard..."
sudo -u "$REAL_USER" "$MIRACLAW_BIN" --setup 2>/dev/null || "$MIRACLAW_BIN"

echo
success "Installation complete!"
echo "  Start bot : miraclaw"
echo "  Qdrant    : systemctl status qdrant"
