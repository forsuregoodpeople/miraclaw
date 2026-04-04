#!/usr/bin/env bash
set -euo pipefail

QDRANT_VERSION="v1.14.0"
INSTALL_DIR="/usr/local/bin"
QDRANT_DATA_DIR="$HOME/.miraclaw/qdrant"
QDRANT_CONFIG_DIR="/etc/qdrant"
QDRANT_SERVICE="/etc/systemd/system/qdrant.service"
MIRACLAW_SERVICE="/etc/systemd/system/miraclaw.service"
MIRACLAW_BIN="$INSTALL_DIR/miraclaw"
MIRACLAW_REPO="${MIRACLAW_REPO:-https://github.com/forsuregoodpeople/miraclaw.git}"
MIRACLAW_SRC="/usr/local/src/miraclaw"
GO_MIN="1.26"

# ── helpers ──────────────────────────────────────────────────────────────────

# ANSI RGB color — matches config/setup.go colorRGB()
rgb()     { printf "\033[38;2;%d;%d;%dm" "$1" "$2" "$3"; }
reset()   { printf "\033[0m"; }
bold()    { printf "\033[1m"; }

# Purple→Blue gradient palette (mirrors config/setup.go)
_C0=$(rgb 147  51 234)
_C1=$(rgb 130  60 238)
_C2=$(rgb 110  70 240)
_C3=$(rgb  90  82 242)
_C4=$(rgb  72  96 244)
_C5=$(rgb  59 113 246)
_C6=$(rgb  59 130 246)
_RST=$(reset)
_BLD=$(bold)

print_banner() {
    printf "\n"
    printf "%s██   ██  ███████  ██████     ███     ██████  ██         ███    ██   ██%s\n" "$_C0" "$_RST"
    printf "%s███ ███    ███    ██   ██   ██ ██   ██       ██        ██ ██   ██   ██%s\n" "$_C1" "$_RST"
    printf "%s████████   ███    ██   ██  ██   ██  ██       ██       ██   ██  ██ █ ██%s\n" "$_C2" "$_RST"
    printf "%s██ █ ██    ███    ██████   ███████  ██       ██       ███████  ████████%s\n" "$_C3" "$_RST"
    printf "%s██   ██    ███    ██  ██   ██   ██  ██       ██       ██   ██  ██ █ ██%s\n" "$_C4" "$_RST"
    printf "%s██   ██    ███    ██   ██  ██   ██  ██       ██       ██   ██  ██   ██%s\n" "$_C5" "$_RST"
    printf "%s██   ██  ███████  ██   ██  ██   ██   ██████  ███████  ██   ██  ██   ██%s\n" "$_C6" "$_RST"
    printf "\n"
    printf "%s%sThe most token-efficient self-hosted AI agent%s\n" "$_BLD" "$_C3" "$_RST"
    printf "\n"
}

info()    { printf "%s[*]%s %s\n" "$_C3" "$_RST" "$*"; }
success() { printf "%s[✓]%s %s\n" "$_C6" "$_RST" "$*"; }
warn()    { printf "%s[!]%s %s\n" "$(rgb 251 191 36)" "$_RST" "$*"; }
die()     { printf "%s[✗]%s %s\n" "$(rgb 239 68 68)" "$_RST" "$*" >&2; exit 1; }

require() {
    command -v "$1" &>/dev/null || die "$1 is required but not installed. Install it and re-run."
}

# ── checks ───────────────────────────────────────────────────────────────────

print_banner

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash install.sh"

require curl
require go
require git
require systemctl

# Go version check
GO_VER=$(go version | awk '{print $3}' | sed 's/go//')
if ! awk -v v="$GO_VER" -v m="$GO_MIN" 'BEGIN{
    split(v,a,"."); split(m,b,".")
    exit ((a[1]+0 > b[1]+0) || (a[1]+0 == b[1]+0 && a[2]+0 >= b[2]+0)) ? 0 : 1
}'; then
    die "Go >= $GO_MIN required, found $GO_VER"
fi
success "Go $GO_VER OK"

ARCH=$(uname -m)
case "$ARCH" in
    x86_64)  QDRANT_ARCH="x86_64-unknown-linux-musl" ;;
    aarch64) QDRANT_ARCH="aarch64-unknown-linux-musl" ;;
    *)       die "Unsupported architecture: $ARCH" ;;
esac

# Determine the actual user (not root) when running via sudo
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)

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

# ── systemd service for Qdrant ────────────────────────────────────────────────

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

# wait up to 15s for Qdrant HTTP to be ready
for i in $(seq 1 15); do
    if curl -sf http://localhost:6333/healthz &>/dev/null; then
        success "Qdrant is running"
        break
    fi
    [[ $i -eq 15 ]] && die "Qdrant did not start in time. Check: journalctl -u qdrant"
    sleep 1
done

# ── fetch / update miraclaw source ───────────────────────────────────────────

# If we were piped from curl, BASH_SOURCE[0] is empty — clone from GitHub.
# If we were run from a local checkout, build in place instead.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-/dev/null}")" 2>/dev/null && pwd || echo "")"
if [[ -f "$SCRIPT_DIR/go.mod" ]]; then
    MIRACLAW_SRC="$SCRIPT_DIR"
    info "Using local source at $MIRACLAW_SRC"
elif [[ -d "$MIRACLAW_SRC/.git" ]]; then
    info "Updating MiraClaw source..."
    git -C "$MIRACLAW_SRC" pull --ff-only
else
    info "Cloning MiraClaw from $MIRACLAW_REPO..."
    git clone --depth=1 "$MIRACLAW_REPO" "$MIRACLAW_SRC"
fi

# ── build miraclaw ────────────────────────────────────────────────────────────

info "Building MiraClaw..."
(cd "$MIRACLAW_SRC" && go build -o "$MIRACLAW_BIN" .)
[[ -x "$MIRACLAW_BIN" ]] || die "Build failed: $MIRACLAW_BIN not found"
success "MiraClaw installed to $MIRACLAW_BIN"

# ── systemd service for MiraClaw ──────────────────────────────────────────────

if [[ ! -f "$MIRACLAW_SERVICE" ]]; then
    info "Creating systemd service for MiraClaw..."
    cat > "$MIRACLAW_SERVICE" <<EOF
[Unit]
Description=MiraClaw AI Agent
After=network.target qdrant.service
Requires=qdrant.service

[Service]
Type=simple
User=$REAL_USER
ExecStart=$MIRACLAW_BIN
Restart=on-failure
RestartSec=5
Environment=HOME=$REAL_HOME

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable miraclaw
    success "MiraClaw systemd service installed and enabled"
else
    # Reload in case binary was updated
    systemctl daemon-reload
fi

# ── bashrc integration ────────────────────────────────────────────────────────

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
sudo -u "$REAL_USER" "$MIRACLAW_BIN" --setup || warn "Setup cancelled or failed. Run manually: miraclaw --setup"

# ── start miraclaw service ────────────────────────────────────────────────────

echo
info "Starting MiraClaw service..."
systemctl restart miraclaw
sleep 2
if systemctl is-active --quiet miraclaw; then
    success "MiraClaw is running"
else
    warn "MiraClaw service failed to start. Check: journalctl -u miraclaw"
fi

# ── done ──────────────────────────────────────────────────────────────────────

echo
success "Installation complete!"
echo "  Logs       : journalctl -u miraclaw -f"
echo "  Stop bot   : systemctl stop miraclaw"
echo "  Reconfigure: miraclaw --setup"
echo "  Qdrant     : systemctl status qdrant"
