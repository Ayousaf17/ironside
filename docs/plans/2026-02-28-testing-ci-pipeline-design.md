# Testing & CI Pipeline Design

## Context

Peter's feedback: add Jest tests with mocked Prisma, Dockerized test database, lint GitHub workflow, and full CI workflow that runs on every PR. Currently zero automated checks gate PR merges.

## Components

### 1. Jest Test Suite

**Unit tests** (mocked Prisma — fast, test pure logic):
- `parseGorgiasEvent()` — parses ticket-created/updated/message-created correctly
- `detectCategory()` — maps subjects/tags to categories
- Slack route — rejects bot messages, retries, empty text

**Integration tests** (real Docker Postgres — test DB writes):
- Webhook POST → creates `agent_behavior_logs` rows
- Backfill → skips duplicates via unique constraint

### 2. Docker Test Postgres

GitHub Actions spins up a Postgres 16 service container. Prisma migrations run against it before tests execute. Same approach works locally via existing `docker-compose.yml`.

### 3. GitHub Actions Workflows

**Lint workflow** (`lint.yml`) — runs on PR:
- Checkout, setup Bun, install deps (cached)
- ESLint + TypeScript compile check

**Test workflow** (`test.yml`) — runs on PR:
- Checkout, setup Bun, install deps (cached)
- Start Postgres service container
- Run `prisma migrate deploy`
- Run Jest test suite against real DB

### 4. Environment

`.env.test` committed with sanitized values (test DB connection string, mock flags). `.gitignore` already excludes `.env*` except `.env.example` — we add `.env.test` exception.

### 5. Peter-Fullstack Skill Update

Add Layer 7 (Testing/CI) to the mental model, update file tree and Local vs Production table.

## Files

| File | Status | Purpose |
|------|--------|---------|
| `.github/workflows/lint.yml` | New | Lint + TS compile on PRs |
| `.github/workflows/test.yml` | New | Jest + Docker Postgres on PRs |
| `jest.config.ts` | New | Jest config using next/jest |
| `__tests__/setup.ts` | New | Global test DB setup |
| `__tests__/lib/gorgias/events.test.ts` | New | Event parser unit tests |
| `__tests__/api/gorgias-webhook.test.ts` | New | Webhook integration test |
| `__tests__/api/slack-incoming.test.ts` | New | Slack route unit test |
| `.env.test` | New | Sanitized test environment |
| `lib/prisma.ts` | Modified | Make client injectable for testing |
| `package.json` | Modified | Add jest, @types/jest, test script |
| `peter-fullstack/SKILL.md` | Modified | Add Layer 7 |

## Not Included (YAGNI)

- No E2E browser tests (no frontend)
- No coverage thresholds
- No branch protection rules (manual GitHub setting)
