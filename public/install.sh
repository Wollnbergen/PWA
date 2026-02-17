#!/bin/bash
# Sultan Validator One-Line Installer v0.2.7
# Usage: curl -L https://wallet.sltn.io/install.sh -o install.sh && bash install.sh
#
# ═══════════════════════════════════════════════════════════════════════════
# COMPLETE VALIDATOR SETUP GUIDE
# ═══════════════════════════════════════════════════════════════════════════
#
# STEP 1: CREATE A CLOUD SERVER
#   Choose a provider and create a VPS with these minimum specs:
#   • 2 vCPU, 4GB RAM, 80GB SSD, Ubuntu 22.04/24.04
#   • Recommended providers:
#     - Hetzner:      https://hetzner.cloud (cheapest, EU/US)
#     - DigitalOcean: https://digitalocean.com ($4-6/mo droplets)
#     - Vultr:        https://vultr.com (global locations)
#     - AWS:          https://aws.amazon.com (EC2 t3.medium)
#     - Linode:       https://linode.com
#
# STEP 2: CREATE YOUR SULTAN WALLET
#   • Go to https://wallet.sltn.io
#   • Install the browser extension OR use web wallet
#   • Create new wallet → SAVE YOUR MNEMONIC SECURELY
#   • Copy your wallet address (starts with sultan1...)
#
# STEP 3: SSH INTO YOUR SERVER AND RUN THIS SCRIPT
#   ssh root@your-server-ip
#   curl -L https://wallet.sltn.io/install.sh -o install.sh && bash install.sh
#   → Enter your wallet address when prompted
#
# STEP 4: FUND YOUR WALLET
#   • Send 10,000+ SLTN to your wallet address
#   • Get SLTN from: exchanges, OTC, or team allocation
#
# STEP 5: REGISTER AS VALIDATOR
#   • Open Sultan Wallet → Stake → "Become a Validator"
#   • Enter validator name and stake amount (min 10,000 SLTN)
#   • Sign the transaction
#
# ═══════════════════════════════════════════════════════════════════════════
# After registration, your node will start producing blocks and earning
# ~13.33% APY on your staked SLTN!
# ═══════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           Sultan Network Validator Installer               ║"
echo "║                    Version 0.2.7                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}PRE-FLIGHT CHECKLIST:${NC}"
echo -e "  ${GREEN}✓${NC} You created this server (Hetzner/DO/Vultr/AWS/etc.)"
echo -e "  ${GREEN}?${NC} You have a Sultan Wallet address"
echo ""
echo -e "${CYAN}Don't have a wallet yet?${NC}"
echo -e "  → Go to ${GREEN}https://wallet.sltn.io${NC} and create one first"
echo -e "  → Save your mnemonic phrase securely!"
echo ""
read -p "Press Enter to continue (or Ctrl+C to exit and create wallet first)..."
echo ""

INSTALL_DIR="/opt/sultan"
BINARY_URL="https://github.com/Sultan-Labs/DOCS/releases/download/v0.2.6/sultan-node"
NYC_NODE="206.189.224.142"
RPC_ENDPOINT="http://${NYC_NODE}:8545"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Install dependencies
for cmd in curl jq; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${YELLOW}Installing $cmd...${NC}"
        apt-get update -qq && apt-get install -y -qq $cmd
    fi
done

echo ""
read -p "Enter your Sultan wallet address (sultan1...): " VALIDATOR_ADDR

# Validate address format
if [[ ! "$VALIDATOR_ADDR" =~ ^sultan1[a-z0-9]{38,42}$ ]]; then
    echo -e "${RED}Invalid address format. Must start with 'sultan1' and be ~42 characters.${NC}"
    echo -e "${RED}Example: sultan1faf2cmlcg2z9qrd4vaxhc3acjc79mcygz86f29${NC}"
    exit 1
fi

echo -e "${GREEN}Using validator address: $VALIDATOR_ADDR${NC}"

read -p "Enter validator name (e.g., Tokyo, Sydney): " VALIDATOR_NAME
VALIDATOR_NAME=${VALIDATOR_NAME:-$(hostname)}

echo -e "${GREEN}Validator name: $VALIDATOR_NAME${NC}"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download binary
if [ ! -f "$INSTALL_DIR/sultan-node" ]; then
    echo -e "${BLUE}Downloading Sultan node binary...${NC}"
    curl -L "$BINARY_URL" -o "$INSTALL_DIR/sultan-node"
    chmod +x "$INSTALL_DIR/sultan-node"
else
    echo -e "${GREEN}Binary already exists${NC}"
fi

# Save config
echo "$VALIDATOR_NAME" > "$INSTALL_DIR/validator.name"
echo "$VALIDATOR_ADDR" > "$INSTALL_DIR/validator.address"

# Configure firewall
echo -e "${BLUE}Configuring firewall...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 8545/tcp >/dev/null 2>&1 || true
    ufw allow 26656/tcp >/dev/null 2>&1 || true
fi

# Create systemd service (FULL NODE - not validator until registered)
cat > /etc/systemd/system/sultan-node.service << EOF
[Unit]
Description=Sultan Network Node
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/sultan-node \\
    --name "$VALIDATOR_NAME" \\
    --data-dir $INSTALL_DIR/data \\
    --bootstrap-peers /ip4/$NYC_NODE/tcp/26656 \\
    --genesis-validators sultan1nyc00000000000000000000000000000 \\
    --genesis sultan15g5nwnlemn7zt6rtl7ch46ssvx2ym2v2umm07g:500000000000000000 \\
    --enable-p2p \\
    --p2p-addr /ip4/0.0.0.0/tcp/26656 \\
    --rpc-addr 0.0.0.0:8545 \\
    --enable-sharding \\
    --shard-count 20
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sultan-node
systemctl stop sultan-node 2>/dev/null || true
systemctl start sultan-node

echo -e "${BLUE}Starting node and waiting for sync...${NC}"
sleep 5

# Check if running
if ! systemctl is-active --quiet sultan-node; then
    echo -e "${RED}Node failed to start. Check logs: journalctl -u sultan-node -f${NC}"
    exit 1
fi

# Wait for initial sync
for i in {1..30}; do
    HEIGHT=$(curl -s http://localhost:8545/status 2>/dev/null | jq -r '.height // 0')
    if [ "$HEIGHT" -gt 0 ]; then
        echo -e "${GREEN}Node synced! Current height: $HEIGHT${NC}"
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

# Check balance
BALANCE=$(curl -s "$RPC_ENDPOINT/balance/$VALIDATOR_ADDR" 2>/dev/null | jq -r '.balance // 0')
BALANCE_SLTN=$((BALANCE / 1000000000))

# Check if already a validator
IS_VALIDATOR=$(curl -s "$RPC_ENDPOINT/staking/validators" 2>/dev/null | jq -r ".[] | select(.validator_address==\"$VALIDATOR_ADDR\") | .validator_address" || echo "")

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              ✅ NODE INSTALLATION COMPLETE!                       ║${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║                                                                   ║${NC}"
echo -e "${CYAN}║  Validator Name:    ${GREEN}$VALIDATOR_NAME${NC}"
echo -e "${CYAN}║  Validator Address: ${GREEN}$VALIDATOR_ADDR${NC}"
echo -e "${CYAN}║  Current Balance:   ${GREEN}$BALANCE_SLTN SLTN${NC}"
if [ -n "$IS_VALIDATOR" ]; then
echo -e "${CYAN}║  Status:            ${GREEN}✅ REGISTERED AS VALIDATOR${NC}"
else
echo -e "${CYAN}║  Status:            ${YELLOW}⏳ FULL NODE (not yet validator)${NC}"
fi
echo -e "${CYAN}║                                                                   ║${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════════╣${NC}"

if [ -n "$IS_VALIDATOR" ]; then
    echo -e "${CYAN}║  ${GREEN}🎉 You are already a registered validator!${NC}"
    echo -e "${CYAN}║  Your node will start producing blocks once fully synced.       ║${NC}"
else
    echo -e "${CYAN}║  ${YELLOW}TO BECOME A VALIDATOR:${NC}"
    echo -e "${CYAN}║                                                                   ║${NC}"
    if [ "$BALANCE_SLTN" -lt 10000 ]; then
        echo -e "${CYAN}║  ${RED}1. Fund your wallet with 10,000+ SLTN${NC}"
        echo -e "${CYAN}║     Current: $BALANCE_SLTN SLTN | Need: 10,000 SLTN            ${NC}"
    else
        echo -e "${CYAN}║  ${GREEN}1. ✅ Wallet has sufficient balance ($BALANCE_SLTN SLTN)${NC}"
    fi
    echo -e "${CYAN}║                                                                   ║${NC}"
    echo -e "${CYAN}║  2. Open Sultan Wallet: ${GREEN}https://wallet.sltn.io${NC}"
    echo -e "${CYAN}║                                                                   ║${NC}"
    echo -e "${CYAN}║  3. Go to Stake → ${GREEN}Become a Validator${NC}"
    echo -e "${CYAN}║                                                                   ║${NC}"
    echo -e "${CYAN}║  4. Enter validator name and stake 10,000 SLTN                    ║${NC}"
fi
echo -e "${CYAN}║                                                                   ║${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  ${YELLOW}USEFUL COMMANDS:${NC}"
echo -e "${CYAN}║                                                                   ║${NC}"
echo -e "${CYAN}║  View logs:     ${GREEN}journalctl -u sultan-node -f${NC}"
echo -e "${CYAN}║  Check status:  ${GREEN}systemctl status sultan-node${NC}"
echo -e "${CYAN}║  Node RPC:      ${GREEN}curl http://localhost:8545/status${NC}"
echo -e "${CYAN}║  Restart:       ${GREEN}systemctl restart sultan-node${NC}"
echo -e "${CYAN}║                                                                   ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -z "$IS_VALIDATOR" ]; then
    echo -e "${GREEN}🚀 Node is syncing with the Sultan Network!${NC}"
    echo -e "${YELLOW}   Complete validator registration via wallet to start earning ~13.33% APY${NC}"
else
    echo -e "${GREEN}🎉 Your validator is active! You'll earn ~13.33% APY on your stake.${NC}"
fi
echo ""
curl http://localhost:8545/node_info | jq .