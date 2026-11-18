# NOVA Development Roadmap

## Phase status

| Phase   | Scope                                                          | Status                                                   |
| ------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Phase 0 | Foundations, spec, contracts, DB, API boundaries, docs, tests  | Implemented and verified                                 |
| Phase 1 | Stable web runtime and compiled bundle pipeline                | Implemented; web runtime payload                         |
| Phase 2 | Visual editor foundation and proposal generation               | Implemented                                              |
| Phase 3 | AI-assisted changes with validation, approval, audit, rollback | Implemented; rollback deferred                           |
| Phase 4 | Managed backend and integration adapters                       | Implemented; integration endpoints deferred              |
| Phase 5 | Hosting, releases, environments, rollback                      | Core release flow implemented; hosting/rollback deferred |
| Phase 6 | Mobile and desktop renderers                                   | Deferred                                                 |
| Phase 7 | Marketplace and advanced self-hosting                          | Deferred                                                 |

## Phase 0 deliverables

- pnpm + Turborepo monorepo with strict TypeScript
- Versioned `AppDefinition` specification and migration framework
- Component contract types and initial built-in registry
- Schema/reference/compatibility validation
- Semantic proposal operations with approval enforcement
- Organization RBAC and tenant scoping utilities
- Prisma schema and initial SQL migration
- NestJS API with real liveness, readiness, validation, and registry endpoints
- BullMQ worker host with a real system health job
- Provider-independent AI and backend adapter interfaces
- Architecture, ADR, data model, API, spec, contracts, and AI safety documentation
- Unit tests and CI workflow

Phase 0 was completed and verified before visual builder work began.

## Phase 0 acceptance criteria

- `pnpm install` succeeds and generates Prisma Client.
- `pnpm lint` succeeds.
- `pnpm typecheck` succeeds.
- `pnpm test` succeeds.
- `pnpm build` succeeds.
- Initial Prisma migration is present.
- Phase 0 acceptance criteria were verified before the visual builder was added.

## Visual builder deliverables

- `@nova/runtime-core`, `@nova/web-runtime`, and `@nova/editor-core` packages.
- `@nova/editor` in `apps/editor` and `@nova/web-runtime-app` in `apps/web-runtime`.
- Drag-and-drop editor, web runtime, control plane endpoints, typed SDK, and optional AI proposal flow.
- Spec additions: `layout`, `breakpointOverrides`, `hidden`, `bindings`, `workflows`, `metadata.editorLocks`; `SPEC_VERSION` remains `1.0` with additive/defaulted fields.
- Contract additions: inspector groups/fields, resize constraints, categories, `supportedBreakpoints`, `description`, and `icon`.
- Full registry contracts, expanded proposal operations, in-memory/Prisma repositories, and OpenAI-compatible/template AI generation.
- Typed SDK methods for app CRUD, versions, proposals, publish, runtime, AI proposals, and full component contracts.
- Editor SDK usage with localStorage fallback; runtime payload mapping back to an editor-compatible definition.

## Phase gates

A phase is complete only when:

1. All acceptance criteria pass.
2. Relevant unit and integration tests pass.
3. Lint and typecheck pass.
4. Architecture documentation is updated.
5. Changes are reviewed against phase scope.

Mobile, desktop, marketplace, and complex deployment systems remain deferred; the shared specification and web runtime are now stable.
