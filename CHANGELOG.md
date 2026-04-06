# Changelog

All notable changes to Content Factory are documented in this file.

## [0.10.0] — 2026-04-06

### Added
- **Auto-outline generation** — articles without outlines now get AI-generated section headings before writing begins, removing the manual outline requirement
- Exported `generateOutline` helper from `packages/agents/` for reuse

### Fixed
- Fixed 400 Bad Request on "Analyze Website" — `triggerAnalyzeWebsite` now sends an empty JSON body as required by the API
- Auto-trigger website analysis failures on client creation are now logged instead of silently swallowed
- Removed premature outline validation gate from write-article job and API route — outline is now generated on-the-fly if missing

## [0.9.0] — 2026-04-05

### Added
- **Article Writer Agent** — AI-powered full-article generation from approved outlines, with section-by-section writing and progress streaming
- `POST /api/v1/clients/:clientId/agents/write-article` endpoint to enqueue article writing jobs
- `POST /api/v1/clients/:clientId/agents/rewrite-section` endpoint to regenerate individual article sections
- `ArticleWriter` agent in `packages/agents/` following the BaseAgent pattern
- Concurrency guard migration (`0003_agent_job_concurrency_guard.sql`) preventing duplicate write jobs
- Section-level rewrite support with transactional DB writes
- TOCTOU protection on article status checks before job enqueue
- Batch insert for article sections

### Fixed
- Wrapped rewrite-section DB writes in transaction for atomicity
- Addressed structural audit findings: transaction safety, TOCTOU race condition, batch insert optimization

## [0.7.0] — 2026-04-05

### Added
- **Article Suggestion Engine** — AI-powered article topic suggestions based on client niche, competitors, and knowledge base context
- Suggestion management UI at `/clients/[id]/suggestions` with approve, reject, and regenerate actions
- `POST /api/v1/agents/suggest-articles` endpoint to trigger suggestion generation via BullMQ job
- `GET/PATCH` endpoints for suggestion CRUD on articles
- `seo_score` column on articles table (migration `0002_add_article_seo_score.sql`)
- `ArticleSuggester` agent in `packages/agents/` following the BaseAgent pattern
- Shared Zod schemas for suggestion payloads
