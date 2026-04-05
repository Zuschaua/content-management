# Changelog

All notable changes to Content Factory are documented in this file.

## [0.7.0] — 2026-04-05

### Added
- **Article Suggestion Engine** — AI-powered article topic suggestions based on client niche, competitors, and knowledge base context
- Suggestion management UI at `/clients/[id]/suggestions` with approve, reject, and regenerate actions
- `POST /api/v1/agents/suggest-articles` endpoint to trigger suggestion generation via BullMQ job
- `GET/PATCH` endpoints for suggestion CRUD on articles
- `seo_score` column on articles table (migration `0002_add_article_seo_score.sql`)
- `ArticleSuggester` agent in `packages/agents/` following the BaseAgent pattern
- Shared Zod schemas for suggestion payloads
