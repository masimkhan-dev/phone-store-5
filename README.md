# Multi-Branch Mobile Platform

One website, one database and one login for a UK phone retail and repair business with several branches. Built by Nexly Digital from *Multi-Branch Phone Store Platform — SRS v2*.

**Status: Phase A (Acquire) is built and tested locally. It has not yet been run against a real Supabase project.** See [docs/development-progress.md](docs/development-progress.md) for exactly what is done, what is verified and what is not.

## Quick start

```bash
npm install
cp .env.example .env      # then fill it in: see docs/environment.md
npm run dev
```

The site answers 503 with a clear message until the Supabase variables are set. Apply the database first: see [docs/deployment.md](docs/deployment.md).

## Checks

| Command | What it does |
|---|---|
| `npm run typecheck` | Strict TypeScript |
| `npm test` | Unit tests (money, opening hours, validation, dates, CSV, structured data) |
| `npm run test:db` | Applies all migrations to a throwaway local PostgreSQL and runs the isolation, invoice, concurrency and financial tests |
| `npm run build` | Production build |
| `npm run test:e2e` | Browser smoke test of the built site against a fixture API (see the header of `tests/e2e/smoke.mjs`) |

## Documentation

- [Architecture](docs/architecture.md): stack decisions, modules, how branch isolation and money are handled
- [Database](docs/database.md): tables, functions, policies
- [Environment](docs/environment.md): every variable and external service
- [Deployment](docs/deployment.md): Supabase setup, first Owner, hosting, backups
- [Progress](docs/development-progress.md): done, verified, pending, and open questions for the client
