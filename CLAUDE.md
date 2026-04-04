# Content Factory — Developer Guide

## Project Overview
AI-powered SEO content production platform. Produces content for SEO agency clients — does NOT publish it.

## Tech Stack
- **Frontend:** Next.js 14 (App Router), React 19, shadcn/ui + Tailwind CSS v4, Tiptap, @dnd-kit, TanStack Query
- **Backend:** Fastify 5, Drizzle ORM, PostgreSQL 16 + pgvector, Redis 7, BullMQ
- **Storage:** MinIO (S3-compatible)
- **AI:** Vercel AI SDK (provider-agnostic), Crawlee (web crawling)
- **Monorepo:** pnpm workspaces + Turborepo

## Repository Structure
```
apps/web/          — Next.js frontend (port 3000)
apps/api/          — Fastify API server (port 3001)
packages/shared/   — Zod schemas, TypeScript types
packages/agents/   — AI agent modules (BaseAgent pattern)
```

## Commands
- `pnpm dev` — Start all services in dev mode
- `pnpm build` — Build all packages
- `pnpm lint` — Lint all packages
- `pnpm typecheck` — TypeScript check all packages
- `pnpm test` — Run all tests
- `pnpm db:generate` — Generate Drizzle migration
- `pnpm db:migrate` — Run database migrations
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` — Start dev infrastructure

## Key Architecture Decisions
1. **Client-scoped everything** — every table has `client_id`, enforced at application layer
2. **AI agents are modular** — each implements `BaseAgent` in `packages/agents/`
3. **Pipeline state machine** — article status transitions enforced in `packages/shared/`
4. **Agent configs cascade** — client-specific overrides global defaults
5. **BullMQ for async AI jobs** — with SSE progress streaming
6. **Export = .docx** — no Google Docs API integration (CEO directive)

## Branch Strategy
- `main` — always deployable
- `feature/<code>` — e.g. `feature/m1-client-management`
- `fix/<desc>` — bug fixes
- PR required for all merges to main

## Environment Variables
See `.env.example` for all required variables.

## Database
PostgreSQL 16 with pgvector extension. Schema defined in `apps/api/src/db/schema.ts`.
Migrations managed by Drizzle Kit in `apps/api/src/db/migrations/`.
