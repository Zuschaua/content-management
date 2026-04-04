# Content Factory

AI-powered SEO content production platform. Onboard SEO clients, analyze their niche and competitors, generate strategically informed blog content with AI agents, and export finished articles for delivery.

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 10+, Docker

# Clone and install
git clone https://github.com/Zuschaua/content-management.git
cd content-management
cp .env.example .env
pnpm install

# Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis minio

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

- Frontend: http://localhost:3000
- API: http://localhost:3001
- MinIO Console: http://localhost:9001

## Production Deployment

```bash
docker compose up -d
```

Single `docker compose up` starts the entire stack with Traefik reverse proxy.

## Architecture

See [CLAUDE.md](./CLAUDE.md) for the full developer guide.

## License

See [LICENSE](./LICENSE).
