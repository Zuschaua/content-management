#!/usr/bin/env bash
set -euo pipefail

# Content Factory — One-time VPS setup script
# Run this on a fresh Ubuntu 22.04/24.04 VPS as root:
#   curl -sSL <raw-url> | bash
# Or: ssh root@213.160.77.27 'bash -s' < deploy/setup-vps.sh

APP_DIR="/opt/content-factory"
DOMAIN="${DOMAIN:-}"  # Set before running, or pass as env var

echo "==> Content Factory VPS Setup"
echo "    Target: $(hostname) ($(curl -s ifconfig.me))"

# 1. System updates
echo "==> Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release

# 2. Install Docker (official method)
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
else
  echo "==> Docker already installed: $(docker --version)"
fi

# 3. Install Caddy (reverse proxy with auto-HTTPS)
if ! command -v caddy &>/dev/null; then
  echo "==> Installing Caddy..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
else
  echo "==> Caddy already installed: $(caddy version)"
fi

# 4. Clone or update repository
if [ -d "$APP_DIR/.git" ]; then
  echo "==> Updating existing repo..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard origin/main
else
  echo "==> Cloning repository..."
  git clone https://github.com/Zuschaua/content-management.git "$APP_DIR"
  cd "$APP_DIR"
fi

# 5. Create .env if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
  echo "==> Creating .env from production template..."
  cp "$APP_DIR/deploy/.env.production" "$APP_DIR/.env"
  # Generate a random encryption key
  GENERATED_KEY=$(openssl rand -hex 32)
  sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${GENERATED_KEY}|" "$APP_DIR/.env"
  echo ""
  echo "  IMPORTANT: Edit $APP_DIR/.env to set:"
  echo "    - AI provider API keys"
  echo "    - POSTGRES_PASSWORD (change from default)"
  echo "    - Domain/URL settings"
  echo ""
else
  echo "==> .env already exists, skipping..."
fi

# 6. Configure Caddy
if [ -n "$DOMAIN" ]; then
  echo "==> Configuring Caddy for domain: $DOMAIN"
  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:3000
}

api.$DOMAIN {
    reverse_proxy localhost:3001
}
EOF
  systemctl reload caddy
else
  echo "==> No DOMAIN set — configuring Caddy for IP-only access (HTTP, no TLS)"
  cat > /etc/caddy/Caddyfile <<EOF
:80 {
    handle /api/* {
        reverse_proxy localhost:3001
    }
    handle {
        reverse_proxy localhost:3000
    }
}
EOF
  systemctl reload caddy
fi

# 7. Set up firewall
echo "==> Configuring firewall..."
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp   # SSH
  ufw allow 80/tcp   # HTTP
  ufw allow 443/tcp  # HTTPS
  ufw --force enable
fi

echo ""
echo "==> Setup complete!"
echo "    App directory: $APP_DIR"
echo "    Next steps:"
echo "      1. Edit $APP_DIR/.env with production values"
echo "      2. Run: cd $APP_DIR && deploy/deploy.sh"
echo "      3. Access at http://$(curl -s ifconfig.me)"
