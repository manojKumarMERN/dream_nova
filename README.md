# NOVA

NOVA is an independent AI-powered, cross-platform no-code application development platform.

This repository currently contains Phase 0 foundations: monorepo tooling, the versioned application specification, component contracts, database schema, API boundaries, worker skeleton, architecture documentation, and automated tests.

## Commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Local infrastructure:

```bash
docker compose up -d
cp .env.example .env
```

See [docs/ROADMAP.md](docs/ROADMAP.md) for the implementation sequence and phase gates.
