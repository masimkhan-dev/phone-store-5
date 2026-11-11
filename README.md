# Multi-Branch Mobile Platform

One website, one database and one login for a UK phone retail and repair business with several branches. Built by Nexly Digital from *Multi-Branch Phone Store Platform — SRS v2*.

**Status: all three phases (Acquire, Invoice, Control) are built and tested locally. Nothing has yet been run against a real Supabase project.** See [docs/development-progress.md](docs/development-progress.md) for exactly what is done, what is verified and what is not.

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
| `npm run test:e2e` | Browser smoke tests of the built site and dashboard against a fixture API. Start `node tests/e2e/stub-api.mjs` and the built app first (see the header of each test file). |

## Documentation

- [Architecture](docs/architecture.md): stack decisions, modules, how branch isolation and money are handled
- [Database](docs/database.md): tables, functions, policies
- [Environment](docs/environment.md): every variable and external service
- [Deployment](docs/deployment.md): Supabase setup, first Owner, hosting, backups
- [Progress](docs/development-progress.md): done, verified, pending, and open questions for the client
