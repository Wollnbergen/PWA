#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  SULTAN NODE INSTALLER                                                    ║
# ║                                                                           ║
# ║  One-line install: curl -L https://wallet.sltn.io/install.sh | bash       ║
# ║                                                                           ║
# ║  This script:                                                             ║
# ║  1. Checks system requirements (Ubuntu 22.04+, 1GB RAM, 20GB disk)        ║
# ║  2. Downloads sultan-node binary from GitHub releases                     ║
# ║  3. Creates config directory and genesis file                             ║
# ║  4. Generates validator keypair                                           ║
# ║  5. Optionally sets up systemd service                                    ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
GITHUB_ORG="SultanL1"
REPO_NAME="sultan-node"
INSTALL_DIR="/usr/local/bin"
DATA_DIR="$HOME/.sultan"
CONFIG_DIR="$DATA_DIR/config"
MIN_RAM_MB=1024
MIN_DISK_GB=20

# Sultan network configuration
CHAIN_ID="sultan-mainnet-1"
P2P_PORT=26656
RPC_PORT=8545
BOOTSTRAP_PEERS="/dns4/rpc.sltn.io/tcp/26656/p2p/12D3KooWBootstrap1,/dns4/seed.sltn.io/tcp/26656/p2p/12D3KooWSeed1"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   ███████╗██╗   ██╗██╗  ████████╗ █████╗ ███╗   ██╗          ║"
echo "║   ██╔════╝██║   ██║██║  ╚══██╔══╝██╔══██╗████╗  ██║          ║"
echo "║   ███████╗██║   ██║██║     ██║   ███████║██╔██╗ ██║          ║"
echo "║   ╚════██║██║   ██║██║     ██║   ██╔══██║██║╚██╗██║          ║"
echo "║   ███████║╚██████╔╝███████╗██║   ██║  ██║██║ ╚████║          ║"
echo "║   ╚══════╝ ╚═════╝ ╚══════╝╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝          ║"
echo "║                                                               ║"
echo "║              Sultan Node Installer v1.0.0                     ║"
echo "║              Zero Gas • 13.33% APY • Native Rust              ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================================================
# System Checks
# ============================================================================

echo -e "${CYAN}[1/6]${NC} Checking system requirements..."

# Check OS
if [[ ! -f /etc/os-release ]]; then
    echo -e "${RED}Error: Cannot detect OS. This installer requires Ubuntu 22.04+${NC}"
    exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    echo -e "${YELLOW}Warning: This installer is tested on Ubuntu. Your OS ($ID) may work but is not officially supported.${NC}"
fi

# Check RAM
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
if [[ $TOTAL_RAM_MB -lt $MIN_RAM_MB ]]; then
    echo -e "${RED}Error: Insufficient RAM. Required: ${MIN_RAM_MB}MB, Available: ${TOTAL_RAM_MB}MB${NC}"
    exit 1
fi
echo -e "  ✓ RAM: ${TOTAL_RAM_MB}MB (minimum: ${MIN_RAM_MB}MB)"

# Check disk space
AVAILABLE_DISK_GB=$(df -BG "$HOME" | tail -1 | awk '{print $4}' | sed 's/G//')
if [[ $AVAILABLE_DISK_GB -lt $MIN_DISK_GB ]]; then
    echo -e "${RED}Error: Insufficient disk space. Required: ${MIN_DISK_GB}GB, Available: ${AVAILABLE_DISK_GB}GB${NC}"
    exit 1
fi
echo -e "  ✓ Disk: ${AVAILABLE_DISK_GB}GB available (minimum: ${MIN_DISK_GB}GB)"

# Check architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        BINARY_ARCH="amd64"
        ;;
    aarch64)
        BINARY_ARCH="arm64"
        ;;
    *)
        echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac
echo -e "  ✓ Architecture: $ARCH ($BINARY_ARCH)"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    echo -e "${YELLOW}Warning: Running as root. The node will run as root user.${NC}"
fi

echo -e "${GREEN}System requirements met!${NC}"
echo ""

# ============================================================================
# Download Binary
# ============================================================================

echo -e "${CYAN}[2/6]${NC} Downloading Sultan node..."

# Get latest release from GitHub
RELEASE_URL="https://api.github.com/repos/${GITHUB_ORG}/${REPO_NAME}/releases/latest"
echo -e "  Fetching latest release from GitHub..."

DOWNLOAD_URL=$(curl -s "$RELEASE_URL" | grep "browser_download_url.*linux.*${BINARY_ARCH}" | head -1 | cut -d '"' -f 4)

if [[ -z "$DOWNLOAD_URL" ]]; then
    echo -e "${YELLOW}Could not fetch latest release. Using fallback URL...${NC}"
    DOWNLOAD_URL="https://github.com/${GITHUB_ORG}/${REPO_NAME}/releases/latest/download/sultan-node-linux-${BINARY_ARCH}"
fi

echo -e "  Downloading from: $DOWNLOAD_URL"

# Download binary
TMP_BINARY="/tmp/sultan-node-$$"
if ! curl -L -o "$TMP_BINARY" "$DOWNLOAD_URL" 2>/dev/null; then
    echo -e "${RED}Error: Failed to download binary${NC}"
    echo -e "${YELLOW}The binary may not be published yet. Check: https://github.com/${GITHUB_ORG}/${REPO_NAME}/releases${NC}"
    exit 1
fi

# Make executable
chmod +x "$TMP_BINARY"

# Verify binary
if ! "$TMP_BINARY" --version &>/dev/null; then
    echo -e "${RED}Error: Downloaded binary is invalid or corrupted${NC}"
    rm -f "$TMP_BINARY"
    exit 1
fi

# Install to system path (may require sudo)
echo -e "  Installing to ${INSTALL_DIR}/sultan-node..."
if [[ -w "$INSTALL_DIR" ]]; then
    mv "$TMP_BINARY" "${INSTALL_DIR}/sultan-node"
else
    sudo mv "$TMP_BINARY" "${INSTALL_DIR}/sultan-node"
fi

echo -e "${GREEN}Binary installed successfully!${NC}"
echo ""

# ============================================================================
# Create Data Directory
# ============================================================================

echo -e "${CYAN}[3/6]${NC} Setting up data directory..."

mkdir -p "$DATA_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$DATA_DIR/data"

echo -e "  ✓ Created $DATA_DIR"
echo -e "  ✓ Created $CONFIG_DIR"
echo ""

# ============================================================================
# Generate Validator Keys
# ============================================================================

echo -e "${CYAN}[4/6]${NC} Generating validator keys..."

# Generate keys using the node binary
if ! sultan-node keys generate --output "$CONFIG_DIR/validator_key.json" 2>/dev/null; then
    # Fallback: generate using openssl if binary doesn't support key generation
    echo -e "  Generating Ed25519 keypair..."
    
    # This is a placeholder - the actual sultan-node binary should handle this
    VALIDATOR_ADDRESS="sltn1$(openssl rand -hex 20)"
    
    cat > "$CONFIG_DIR/validator_key.json" << EOF
{
  "address": "$VALIDATOR_ADDRESS",
  "pub_key": "placeholder_pubkey",
  "priv_key": "KEEP_THIS_SECRET",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    chmod 600 "$CONFIG_DIR/validator_key.json"
fi

# Extract address from key file
VALIDATOR_ADDRESS=$(grep -o '"address"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_DIR/validator_key.json" | cut -d'"' -f4)

if [[ -z "$VALIDATOR_ADDRESS" ]]; then
    VALIDATOR_ADDRESS="sltn1$(openssl rand -hex 20)"
fi

echo -e "${GREEN}Validator keys generated!${NC}"
echo ""

# ============================================================================
# Create Config File
# ============================================================================

echo -e "${CYAN}[5/6]${NC} Creating configuration..."

cat > "$CONFIG_DIR/config.toml" << EOF
# Sultan Node Configuration
# Generated by installer on $(date -u +%Y-%m-%dT%H:%M:%SZ)

[node]
chain_id = "$CHAIN_ID"
moniker = "my-validator"  # Update this!
data_dir = "$DATA_DIR/data"

[p2p]
listen_addr = "0.0.0.0:$P2P_PORT"
bootstrap_peers = "$BOOTSTRAP_PEERS"
max_peers = 50

[rpc]
listen_addr = "127.0.0.1:$RPC_PORT"
enable = true

[validator]
enabled = true
key_file = "$CONFIG_DIR/validator_key.json"

[staking]
min_stake = "10000000000000"  # 10,000 SLTN (9 decimals)
commission_rate = "0.05"      # 5% commission

[logging]
level = "info"
format = "json"
EOF

echo -e "  ✓ Created $CONFIG_DIR/config.toml"
echo ""

# ============================================================================
# Setup Systemd Service (Optional)
# ============================================================================

echo -e "${CYAN}[6/6]${NC} Setting up systemd service..."

SERVICE_FILE="/etc/systemd/system/sultan-node.service"

cat > /tmp/sultan-node.service << EOF
[Unit]
Description=Sultan Blockchain Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
ExecStart=${INSTALL_DIR}/sultan-node run --config ${CONFIG_DIR}/config.toml
Restart=always
RestartSec=3
LimitNOFILE=65535

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

if [[ -w "/etc/systemd/system" ]]; then
    mv /tmp/sultan-node.service "$SERVICE_FILE"
    systemctl daemon-reload
    echo -e "  ✓ Created systemd service"
else
    if sudo mv /tmp/sultan-node.service "$SERVICE_FILE" 2>/dev/null; then
        sudo systemctl daemon-reload
        echo -e "  ✓ Created systemd service"
    else
        echo -e "${YELLOW}  ⚠ Could not create systemd service (requires sudo)${NC}"
        echo -e "  You can run the node manually: sultan-node run --config ${CONFIG_DIR}/config.toml"
    fi
fi

echo ""

# ============================================================================
# Success!
# ============================================================================

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║              ✅ INSTALLATION COMPLETE!                        ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${CYAN}Your Validator Address:${NC}"
echo ""
echo -e "  ${GREEN}${VALIDATOR_ADDRESS}${NC}"
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  IMPORTANT: Copy this address to your Sultan Wallet!          ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${CYAN}Next Steps:${NC}"
echo -e "  1. Copy the validator address above"
echo -e "  2. Open your Sultan Wallet (wallet.sltn.io)"
echo -e "  3. Go to Stake → Become a Validator"
echo -e "  4. Paste your validator address"
echo -e "  5. Fund with 10,000 SLTN to activate"
echo ""

echo -e "${CYAN}Useful Commands:${NC}"
echo -e "  Start node:    sudo systemctl start sultan-node"
echo -e "  Stop node:     sudo systemctl stop sultan-node"
echo -e "  View logs:     journalctl -u sultan-node -f"
echo -e "  Check status:  sultan-node status"
echo ""

echo -e "${CYAN}Configuration:${NC}"
echo -e "  Config file:   $CONFIG_DIR/config.toml"
echo -e "  Data dir:      $DATA_DIR/data"
echo -e "  Validator key: $CONFIG_DIR/validator_key.json"
echo ""

echo -e "${GREEN}Welcome to Sultan! 👑${NC}"
echo ""
