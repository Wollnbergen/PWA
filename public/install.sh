#!/bin/bash
# Sultan Validator Node - One-Line Installer v0.4.0
# Usage: curl -L https://wallet.sltn.io/install.sh -o install.sh && bash install.sh
#
# STEP 1: Create wallet at https://wallet.sltn.io
# STEP 2: Get a VPS (1 vCPU, 2GB RAM, Ubuntu 22.04+)
# STEP 3: SSH in and run this script
# STEP 4: Register via wallet with the address this script outputs
# That's it — the node starts in validator mode automatically

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

VERSION="0.4.0"
BINARY_URL="https://github.com/Sultan-Labs/DOCS/releases/download/v0.2.6/sultan-node"
BOOTSTRAP_IP="206.189.224.142"
BOOTSTRAP_PEER="/ip4/${BOOTSTRAP_IP}/tcp/26656"
GENESIS_WALLET="sultan15g5nwnlemn7zt6rtl7ch46ssvx2ym2v2umm07g"
GENESIS_VALIDATORS="sultan1nyc00000000000000000000000000000,sultan1sfo00000000000000000000000000002,sultan1fra00000000000000000000000000003,sultan1ams00000000000000000000000000004,sultan1sgp00000000000000000000000000005,sultan1lon00000000000000000000000000006"
INSTALL_DIR="/opt/sultan"
DATA_DIR="/opt/sultan/data"
BINARY_PATH="${INSTALL_DIR}/sultan-node"
SERVICE_NAME="sultan-node"
RPC_PORT="8545"
P2P_PORT="26656"
SHARD_COUNT="20"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           Sultan Network Validator Installer               ║"
echo "║                    Version ${VERSION}                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Pre-flight: must be root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Please run as root (use sudo)${NC}"
    exit 1
fi

if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo -e "${BLUE}📋 Detected OS: ${ID} ${VERSION_ID}${NC}"
else
    echo -e "${RED}❌ Unable to detect OS. Ubuntu 22.04+ required.${NC}"
    exit 1
fi

for cmd in curl jq xxd; do
    if ! command -v "$cmd" &> /dev/null; then
        echo -e "${YELLOW}Installing $cmd...${NC}"
        apt-get update -qq && apt-get install -y -qq "$cmd" 2>/dev/null || {
            # xxd is in vim-common or xxd package depending on distro
            if [ "$cmd" = "xxd" ]; then
                apt-get install -y -qq xxd 2>/dev/null || apt-get install -y -qq vim-common 2>/dev/null || true
            fi
        }
    fi
done

# Step 1: Validator name
echo ""
HOSTNAME_VAL=$(hostname)
read -p "Enter validator name (e.g., tokyo, sydney, berlin) [${HOSTNAME_VAL}]: " VALIDATOR_NAME
VALIDATOR_NAME=${VALIDATOR_NAME:-$HOSTNAME_VAL}
VALIDATOR_NAME=$(echo "$VALIDATOR_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')
echo -e "${GREEN}✓ Validator name: ${VALIDATOR_NAME}${NC}"

# Step 2: Download binary
echo ""
echo -e "${YELLOW}📁 Creating directories...${NC}"
mkdir -p "$INSTALL_DIR" "$DATA_DIR"

echo -e "${YELLOW}📥 Downloading Sultan Node binary...${NC}"
if [ -f "$BINARY_PATH" ]; then
    mv "$BINARY_PATH" "${BINARY_PATH}.bak" 2>/dev/null || true
fi

curl -L --fail --progress-bar "$BINARY_URL" -o "$BINARY_PATH"
if [ ! -s "$BINARY_PATH" ]; then
    echo -e "${RED}❌ Download failed or file is empty${NC}"
    mv "${BINARY_PATH}.bak" "$BINARY_PATH" 2>/dev/null || true
    exit 1
fi
chmod +x "$BINARY_PATH"
rm -f "${BINARY_PATH}.bak"
echo -e "${GREEN}✓ Binary downloaded${NC}"

# Step 3: Generate Ed25519 validator keypair
echo ""
echo -e "${YELLOW}🔑 Generating Ed25519 validator keypair...${NC}"

VALIDATOR_PUBKEY=""
VALIDATOR_SECRET=""
VALIDATOR_ADDR=""

KEYGEN_OUTPUT=$("${BINARY_PATH}" keygen --format json 2>&1 || true)
VALIDATOR_PUBKEY=$(echo "$KEYGEN_OUTPUT" | jq -r '.public_key // empty' 2>/dev/null || true)
VALIDATOR_SECRET=$(echo "$KEYGEN_OUTPUT" | jq -r '.secret_key // empty' 2>/dev/null || true)

if [ -n "$VALIDATOR_PUBKEY" ] && [ -n "$VALIDATOR_SECRET" ]; then
    # Try to get address from keygen output
    VALIDATOR_ADDR=$(echo "$KEYGEN_OUTPUT" | jq -r '.address // empty' 2>/dev/null || true)
    if [ -z "$VALIDATOR_ADDR" ]; then
        # Derive address: SHA-256 of raw pubkey bytes, take first 40 hex chars
        if command -v xxd &> /dev/null; then
            PUBKEY_HASH=$(echo -n "$VALIDATOR_PUBKEY" | xxd -r -p | sha256sum | cut -c1-40)
        else
            PUBKEY_HASH=$(echo -n "$VALIDATOR_PUBKEY" | fold -w2 | while read byte; do printf "\\x$byte"; done | sha256sum | cut -c1-40)
        fi
        VALIDATOR_ADDR="sultan1${PUBKEY_HASH}"
    fi

    # Save keypair securely
    KEYFILE="${INSTALL_DIR}/validator_key.json"
    (
        umask 077
        cat > "$KEYFILE" << KEYEOF
{
    "public_key": "${VALIDATOR_PUBKEY}",
    "secret_key": "${VALIDATOR_SECRET}",
    "address": "${VALIDATOR_ADDR}",
    "algorithm": "Ed25519",
    "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "warning": "KEEP THIS FILE SECURE - DO NOT SHARE"
}
KEYEOF
    )
    chmod 600 "$KEYFILE"
    echo -e "${GREEN}✓ Keypair saved to ${KEYFILE}${NC}"
    echo -e "${RED}⚠  BACK UP ${KEYFILE} — loss = loss of validator identity${NC}"
else
    echo -e "${RED}⚠  Automatic keygen failed.${NC}"
    echo -e "${YELLOW}Please enter your Sultan wallet address from https://wallet.sltn.io${NC}"
    while true; do
        read -p "Sultan wallet address (sultan1...): " VALIDATOR_ADDR
        if [[ "$VALIDATOR_ADDR" =~ ^sultan1[a-z0-9]{32,52}$ ]]; then
            break
        fi
        echo -e "${RED}Invalid format. Must start with sultan1 followed by 32-52 lowercase alphanumeric chars.${NC}"
    done
fi

echo -e "${CYAN}   Validator Address: ${VALIDATOR_ADDR}${NC}"
echo "$VALIDATOR_ADDR" > "${INSTALL_DIR}/validator.address"
echo "$VALIDATOR_NAME" > "${INSTALL_DIR}/validator.name"

# Step 4: Firewall
echo ""
echo -e "${YELLOW}🔥 Configuring firewall...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp comment "SSH" 2>/dev/null || true
    ufw allow "${P2P_PORT}/tcp" comment "Sultan P2P" 2>/dev/null || true
    ufw allow "${RPC_PORT}/tcp" comment "Sultan RPC" 2>/dev/null || true
    ufw --force enable 2>/dev/null || true
    echo -e "${GREEN}✓ UFW configured${NC}"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=22/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port="${P2P_PORT}/tcp" 2>/dev/null || true
    firewall-cmd --permanent --add-port="${RPC_PORT}/tcp" 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    echo -e "${GREEN}✓ firewalld configured${NC}"
else
    echo -e "${YELLOW}⚠ No firewall manager. Ensure ports ${P2P_PORT} and ${RPC_PORT} are open.${NC}"
fi

# Step 5: Systemd service — start in validator mode directly
echo ""
echo -e "${YELLOW}⚙️  Creating systemd service...${NC}"
systemctl stop "$SERVICE_NAME" 2>/dev/null || true

# Build validator flags
VALIDATOR_FLAGS="--validator --validator-address ${VALIDATOR_ADDR}"
if [ -n "$VALIDATOR_SECRET" ]; then
    VALIDATOR_FLAGS="${VALIDATOR_FLAGS} --validator-secret ${VALIDATOR_SECRET}"
fi
if [ -n "$VALIDATOR_PUBKEY" ]; then
    VALIDATOR_FLAGS="${VALIDATOR_FLAGS} --validator-pubkey ${VALIDATOR_PUBKEY}"
fi

cat > "/etc/systemd/system/${SERVICE_NAME}.service" << SVCEOF
[Unit]
Description=Sultan Network Validator (${VALIDATOR_NAME})
After=network-online.target
Wants=network-online.target
Documentation=https://sltn.io/docs

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${BINARY_PATH} \
  --name "${VALIDATOR_NAME}" \
  --data-dir ${DATA_DIR} \
  ${VALIDATOR_FLAGS} \
  --enable-p2p \
  --p2p-addr /ip4/0.0.0.0/tcp/${P2P_PORT} \
  --rpc-addr 0.0.0.0:${RPC_PORT} \
  --bootstrap-peers "${BOOTSTRAP_PEER}" \
  --genesis "${GENESIS_WALLET}:500000000000000000" \
  --genesis-validators "${GENESIS_VALIDATORS}" \
  --enable-sharding \
  --shard-count ${SHARD_COUNT} \
  --allowed-origins "*"
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${DATA_DIR} ${INSTALL_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
echo -e "${GREEN}✓ Service created (validator mode)${NC}"

# Step 6: Start and verify
echo ""
echo -e "${YELLOW}🚀 Starting node (syncing blockchain)...${NC}"
systemctl start "$SERVICE_NAME"

echo -n "Waiting for node"
NODE_STARTED=false
for _ in $(seq 1 30); do
    if curl -s "http://localhost:${RPC_PORT}/status" >/dev/null 2>&1; then
        NODE_STARTED=true
        echo ""
        break
    fi
    echo -n "."
    sleep 2
done

if [ "$NODE_STARTED" = false ]; then
    echo ""
    echo -e "${RED}❌ Node did not start in 60s. Check: journalctl -u ${SERVICE_NAME} -n 50${NC}"
    exit 1
fi

HEIGHT=$(curl -s "http://localhost:${RPC_PORT}/status" 2>/dev/null | jq -r '.height // 0' 2>/dev/null || echo "0")
PEER_COUNT=$(curl -s "http://localhost:${RPC_PORT}/status" 2>/dev/null | jq -r '.peer_count // 0' 2>/dev/null || echo "0")
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 icanhazip.com 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║               ✅ NODE INSTALLATION COMPLETE                       ║${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Validator Name:    ${GREEN}${VALIDATOR_NAME}${NC}"
echo -e "${CYAN}║  Validator Address: ${GREEN}${VALIDATOR_ADDR}${NC}"
if [ -n "$VALIDATOR_PUBKEY" ]; then
echo -e "${CYAN}║  Public Key:        ${GREEN}${VALIDATOR_PUBKEY}${NC}"
fi
echo -e "${CYAN}║  Public IP:         ${GREEN}${PUBLIC_IP}${NC}"
echo -e "${CYAN}║  RPC:               ${GREEN}http://localhost:${RPC_PORT}${NC}"
echo -e "${CYAN}║  Height:            ${GREEN}${HEIGHT}${NC}"
echo -e "${CYAN}║  Peers:             ${GREEN}${PEER_COUNT}${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  ${YELLOW}NEXT STEPS:${NC}"
echo -e "${CYAN}║  ${YELLOW}1. Open wallet.sltn.io → Stake → Become Validator${NC}"
echo -e "${CYAN}║  ${YELLOW}2. Paste Address:   ${GREEN}${VALIDATOR_ADDR}${NC}"
if [ -n "$VALIDATOR_PUBKEY" ]; then
echo -e "${CYAN}║  ${YELLOW}3. Paste Public Key: ${GREEN}${VALIDATOR_PUBKEY}${NC}"
fi
echo -e "${CYAN}║  ${YELLOW}4. Stake 10,000 SLTN and submit — done!${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  ${RED}⚠  BACK UP: ${INSTALL_DIR}/validator_key.json${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Logs:              ${GREEN}journalctl -u ${SERVICE_NAME} -f${NC}"
echo -e "${CYAN}║  Status:            ${GREEN}curl http://localhost:${RPC_PORT}/status${NC}"
echo -e "${CYAN}║  Restart:           ${GREEN}systemctl restart ${SERVICE_NAME}${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
journalctl -u "$SERVICE_NAME" -n 5 --no-pager 2>/dev/null || true
echo ""
echo -e "${GREEN}🎉 Node running in validator mode! Register via wallet.sltn.io to start earning.${NC}"
