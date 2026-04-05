#!/usr/bin/env bash
set -euo pipefail

# Content Factory — Deploy / Update script
# Run from the project root on the VPS: deploy/deploy.sh
# Or remotely: ssh root@213.160.77.27 'cd /opt/content-factory && deploy/deploy.sh'

APP_DIR="${APP_DIR:-/opt/content-factory}"
cd "$APP_DIR"

echo "==> Content Factory Deploy"
echo "    $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# 1. Pull latest code
echo "==> Pulling latest from main..."
git fetch origin
git reset --hard origin/main

# 2. Build and start services
echo "==> Building and starting services..."
docker compose up -d --build --remove-orphans

# 3. Wait for postgres to be healthy
echo "==> Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-contentfactory}" &>/dev/null; then
    echo "    PostgreSQL ready."
    break
  fi
  echo "    Waiting... attempt $i/30"
  sleep 2
done

# 4. Run database migrations
echo "==> Running database migrations..."
docker compose exec -T api node -e "
  const { migrate } = require('@content-factory/api/dist/db/migrate.js');
  migrate().then(() => { console.log('Migrations complete'); process.exit(0); })
    .catch(e => { console.error('Migration failed:', e); process.exit(1); });
" 2>/dev/null || {
  echo "    Migration via JS failed, trying drizzle-kit push..."
  docker compose exec -T api npx drizzle-kit push 2>/dev/null || echo "    Note: Run migrations manually if needed"
}

# 5. Health check
echo "==> Running health checks..."
sleep 5

API_OK=false
WEB_OK=false

for i in $(seq 1 10); do
  if curl -sf http://localhost:3001/api/v1/health &>/dev/null; then
    API_OK=true
    break
  fi
  sleep 2
done

for i in $(seq 1 10); do
  if curl -sf http://localhost:3000 &>/dev/null; then
    WEB_OK=true
    break
  fi
  sleep 2
done

echo ""
echo "==> Deploy Results"
echo "    API (port 3001): $($API_OK && echo 'OK' || echo 'FAILED')"
echo "    Web (port 3000): $($WEB_OK && echo 'OK' || echo 'FAILED')"
echo ""
echo "    Services:"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps
echo ""
echo "    Access: http://$(curl -s ifconfig.me 2>/dev/null || echo '213.160.77.27')"
echo "    Logs:   cd $APP_DIR && docker compose logs -f"
