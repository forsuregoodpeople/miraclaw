#!/bin/bash
#
# Miraclaw Update Script
# Usage: ./update.sh [options]
#   --clear-memory    Clear Qdrant memory (recommended when embedder changes)
#   --restart-only    Only restart service without git pull/build
#   --help            Show this help
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_NAME="miraclaw"
SERVICE_NAME="miraclaw"
QDRANT_DATA_DIR="/var/lib/qdrant/storage/collections"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    echo "Miraclaw Update Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --clear-memory    Clear Qdrant memory (recommended when embedder changes)"
    echo "  --restart-only    Only restart service without git pull/build"
    echo "  --help            Show this help"
    echo ""
    echo "Examples:"
    echo "  $0                    # Normal update (pull, build, restart)"
    echo "  $0 --clear-memory     # Update + clear memory (for embedder changes)"
    echo "  $0 --restart-only     # Just restart the service"
}

# Parse arguments
CLEAR_MEMORY=false
RESTART_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clear-memory)
            CLEAR_MEMORY=true
            shift
            ;;
        --restart-only)
            RESTART_ONLY=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

cd "$SCRIPT_DIR"

# Check if running as root for systemctl operations
if [[ "$RESTART_ONLY" == false ]]; then
    log_info "Checking prerequisites..."
    
    # Check git
    if ! command -v git &> /dev/null; then
        log_error "git is not installed"
        exit 1
    fi
    
    # Check go
    if ! command -v go &> /dev/null; then
        log_error "Go is not installed"
        exit 1
    fi
fi

# Stop service if running
stop_service() {
    log_info "Stopping $SERVICE_NAME service..."
    
    # Try systemd first
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        sudo systemctl stop "$SERVICE_NAME" && log_success "Service stopped (systemd)"
        return
    fi
    
    # Try to find and kill process
    if pgrep -x "$BINARY_NAME" > /dev/null; then
        pkill -x "$BINARY_NAME" && log_success "Process stopped"
        sleep 2
    fi
}

# Start service
start_service() {
    log_info "Starting $SERVICE_NAME service..."
    
    # Try systemd
    if systemctl list-unit-files | grep -q "^$SERVICE_NAME"; then
        sudo systemctl start "$SERVICE_NAME" && log_success "Service started (systemd)"
        return
    fi
    
    # Start in background
    nohup "./$BINARY_NAME" > /dev/null 2>&1 &
    log_success "Service started in background (PID: $!)"
}

# Clear Qdrant memory
clear_memory() {
    log_warn "Clearing Qdrant memory..."
    
    # Check if qdrant is running
    if systemctl is-active --quiet qdrant 2>/dev/null; then
        sudo systemctl stop qdrant
        QDRANT_WAS_RUNNING=true
    else
        QDRANT_WAS_RUNNING=false
    fi
    
    # Clear collections
    if [[ -d "$QDRANT_DATA_DIR" ]]; then
        sudo rm -rf "${QDRANT_DATA_DIR:?}"/*
        log_success "Qdrant collections cleared"
    else
        log_warn "Qdrant data directory not found: $QDRANT_DATA_DIR"
    fi
    
    # Restart qdrant if it was running
    if [[ "$QDRANT_WAS_RUNNING" == true ]]; then
        sudo systemctl start qdrant
        log_success "Qdrant restarted"
        sleep 3
    fi
}

# Main update流程
main() {
    if [[ "$RESTART_ONLY" == true ]]; then
        stop_service
        start_service
        log_success "Service restarted!"
        exit 0
    fi
    
    # Git pull
    log_info "Pulling latest changes from git..."
    if git pull origin main; then
        log_success "Git pull successful"
    else
        log_error "Git pull failed"
        exit 1
    fi
    
    # Clear memory if requested (before build, while service is still running)
    if [[ "$CLEAR_MEMORY" == true ]]; then
        clear_memory
    fi
    
    # Stop service
    stop_service
    
    # Build
    log_info "Building $BINARY_NAME..."
    if go build -o "$BINARY_NAME" .; then
        log_success "Build successful"
    else
        log_error "Build failed"
        exit 1
    fi
    
    # Make executable
    chmod +x "$BINARY_NAME"
    
    # Start service
    start_service
    
    # Show status
    log_info "Checking service status..."
    sleep 2
    
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_success "Service is running!"
        systemctl status "$SERVICE_NAME" --no-pager -l
    elif pgrep -x "$BINARY_NAME" > /dev/null; then
        log_success "Process is running (PID: $(pgrep -x "$BINARY_NAME"))"
    else
        log_warn "Service status unknown - please check manually"
    fi
    
    echo ""
    log_success "Update completed!"
    
    if [[ "$CLEAR_MEMORY" == true ]]; then
        echo ""
        log_warn "Memory was cleared. You need to pair again if using pairing mode."
    fi
}

# Run
main "$@"
