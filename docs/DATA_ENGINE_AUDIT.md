# NOVA Data Engine Stage 1 Audit

Status: Stage 1 complete; Stage 2 designer and initial Data Studio UI complete

## Scope

This audit compares the current repository against the NOVA Data Engine architecture specification. It records the existing implementation, confirmed gaps, and the decisions captured in the Stage 1 ADRs. It does not claim that staged SQL execution, provider connectors, dynamic DDL, or enterprise hardening are implemented.

## Summary

The repository contains a functional Phase 4 data baseline: canonical data contracts in `@nova/spec`, validation in `@nova/spec-validator`, a scoped data engine, migration planning/application, in-memory and Prisma stores, protected API/SDK routes, and runtime data actions.

Stage 2 added the React Flow visual database designer and the first Data Studio shell in the editor Data tab. Data Studio exposes overview, designer, tables, relationships, records, query builder, Nova-managed data sources, migrations, and permissions, with explicit unavailable states for SQL editing, connectors, and logs. The remaining large-spec gaps are the advanced SQL editor execution path, dynamic relational table generation, provider connector engine, external databases/REST connectors, field/record-level policies, query/connector history, and connector security controls.

## Verification baseline

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 132 passed. The root suite does not include `*.test.tsx`.
- `pnpm --filter @nova/editor test`: 4 files, 25 tests passed.
- `pnpm build`: passed.
- `pnpm format:check`: passed.
- `pnpm test:e2e`: 4 passed.
- `pnpm exec prisma validate --schema packages/db/prisma/schema.prisma`: passed.
- `pnpm test:db`: 3 files, 5 tests passed against a temporary PostgreSQL 18 instance. The temporary cluster was removed after verification.
- Real database verification exposed a UTF-8 BOM in `packages/db/prisma/migrations/20261118000000_init/migration.sql:1`; the BOM was removed and migrations then applied successfully.

## Current implementation map

| Spec area                   | Current implementation                                                                                                                                                                                                                              | Status          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Canonical schema            | `packages/spec/src/app-definition.ts:23-54`, `packages/spec/src/data-model.ts:12-66`, and `packages/spec/src/data-engine-spec.ts:10-184` define versioned data models, fields, relationships, indexes, queries, sources, bindings, and permissions. | Implemented     |
| Schema validation           | `packages/spec-validator/src/validate-app-definition.ts:489-870` validates model, field, relationship, source, query, binding, and permission references.                                                                                           | Implemented     |
| Schema registry             | `AppVersion.definition` stores canonical definitions; `AppDataSchema` stores a scoped schema snapshot in `packages/db/prisma/schema.prisma:168-191,349-364`.                                                                                        | Partial         |
| Migration engine            | `packages/data-engine/src/migrations.ts:62-280` computes plans, detects destructive operations, requires confirmation, and records applied versions through `DataStore`.                                                                            | Partial         |
| Query engine                | `packages/data-engine/src/query.ts:186-240` applies filters, sorting, field selection, pagination, limits, and relationship expansion in application code.                                                                                          | Partial         |
| CRUD and permissions        | `packages/data-engine/src/engine.ts:83-246` enforces scope and model-level permissions for create/read/update/delete.                                                                                                                               | Implemented     |
| Internal PostgreSQL store   | `packages/backend-adapters/src/data-store.ts:133-421` stores schema snapshots, records, and migrations in shared tables with transaction-scoped RLS context.                                                                                        | Partial         |
| Data plane tables           | `AppDataSchema`, `AppDataRecord`, and `AppDataMigration` exist in `packages/db/prisma/schema.prisma:349-401`.                                                                                                                                       | Implemented     |
| API routes                  | `apps/api/src/platform/data.controller.ts:20-114` exposes schema, migration, and record endpoints.                                                                                                                                                  | Implemented     |
| API orchestration           | `apps/api/src/platform/data.service.ts:26-149` resolves app ownership, latest saved version, environment, and actor before creating a data engine.                                                                                                  | Implemented     |
| SDK                         | `packages/sdk/src/client.ts:374-475` exposes typed schema, migration, and record methods.                                                                                                                                                           | Implemented     |
| Runtime data actions        | `packages/runtime-core/src/runtime-engine.ts:550-585` dispatches data actions through an injected adapter; `apps/web-runtime/src/data-access.ts:9-67` supplies the web SDK adapter.                                                                 | Implemented     |
| Runtime DB verification     | `test/db/runtime-data.db.spec.ts:51-130` verifies queryData through runtime engine, DataService, and PrismaDataStore.                                                                                                                               | Implemented     |
| Editor data UI              | `apps/editor/src/components/DatabasePanel.tsx:290-565` remains as the legacy form-based panel; the Data tab now renders Data Studio. `Inspector.tsx:559-781` provides bindings and data actions.                                                    | Partial         |
| Visual database designer    | `apps/editor/src/components/database-designer/DatabaseDesigner.tsx` edits canonical models/fields/relationships through a React Flow canvas with separate layout persistence, validation, plan preview, and destructive confirmation.               | Implemented     |
| Data Studio                 | `apps/editor/src/components/data-studio/DataStudio.tsx` and workspace components provide navigation, records CRUD, structured query builder, migration status/history/apply, permissions matrix, Nova-managed sources, and unavailable states.      | Partial         |
| Canonical workflow payloads | `definition.workflows` are authored by the event workflow designer, validated by `validateWorkflowEventGraph(...)`, and preserved through platform DTOs, the platform service, the SDK, and runtime payload mapping.                                | Implemented     |
| Backend event execution     | No server-side event dispatcher, correlation engine, retry runner, or runtime branch dispatch exists. The designer reports this dependency as unavailable rather than simulating execution.                                                         | Not implemented |
| Provider abstraction        | `packages/backend-adapters/src/adapters.ts:1-40` defines generic data-store/auth/storage adapter interfaces, but no `DataProvider`, connector, or capability contract exists.                                                                       | Partial         |
| Security                    | Organization/app/environment checks, model permissions, and PostgreSQL RLS are implemented. Field-level, record-level, connector-level, and data audit controls are absent.                                                                         | Partial         |
| Documentation               | `DATA_ENGINE.md:1-124` and `docs/DATA_MODEL.md` document the Phase 4 baseline. Stage 1 ADRs now capture target decisions.                                                                                                                           | Partial         |

## Confirmed gaps

1. No Monaco/SQL editor dependency, SQL parser, statement classifier, query history, or schema browser. Data Studio keeps the SQL Editor section explicitly unavailable.
2. Data Studio has navigation, records CRUD, CSV page export, structured query builder, migration history/apply, permissions matrix, and Nova-managed source creation. It does not have external connection management, logs, SQL editing, query history, or a dedicated JSON viewer.
3. Current storage is shared `AppDataRecord.values` JSONB. It does not create user-defined PostgreSQL columns, primary keys, foreign keys, indexes, or per-app schemas.
4. Query execution is application-side over loaded records. SQL `JOIN`, aggregation, grouping, database transactions, and query complexity controls beyond page/filter limits are absent.
5. Relationship behavior is enforced in `DataEngine`; there is no junction-table DDL or database-native referential action layer.
6. External REST, PostgreSQL, MySQL, MongoDB, and SQL Server connectors are not implemented.
7. `Integration.secretRef` exists in `packages/db/prisma/schema.prisma:310-325`, but there is no encrypted credential store, rotation flow, SSRF protection, or connector permission model.
8. Editor preview does not inject `dataAccess`; real data actions must be tested in the standalone web runtime.
9. Automated UI tests cover designer behavior, Data Studio navigation, unavailable states, environment-scoped records, saved structured queries, migration confirmation, and Nova-managed source creation. Bindings, data actions, and failed-operation states remain uncovered.
10. Runtime workflows are canonical payload data only. Backend event execution, correlation, retries, and outcome branch dispatch are absent; the event workflow designer must keep showing an explicit unavailable state until server-side contracts and execution tests exist.

## Stage mapping

| Stage   | Spec deliverable                                          | Current status                                                                                                                                                            |
| ------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 1 | Foundation, ADRs, canonical contracts, provider contracts | Mostly present; remaining work is provider/connector contracts and validation hardening.                                                                                  |
| Stage 2 | React Flow designer and Data Studio shell                 | Implemented. Visual designer and initial Data Studio replace the interim Data tab experience.                                                                             |
| Stage 3 | Dynamic PostgreSQL engine, JSONB, DDL, RLS                | Partially present. Shared JSONB storage and RLS work; dynamic relational DDL does not.                                                                                    |
| Stage 4 | Query and relationship engine                             | Partially present. CRUD, filters, sort, pagination, expansion, and structured query storage work; SQL joins/aggregations/transactions do not.                             |
| Stage 5 | Advanced SQL editor                                       | Not implemented. Data Studio shows an explicit unavailable state.                                                                                                         |
| Stage 6 | External connectors                                       | Not implemented. Data Studio shows an explicit unavailable state.                                                                                                         |
| Stage 7 | Enterprise hardening                                      | Partially present. Basic scoping/permissions/RLS and a permissions matrix exist; audit, field/record policies, query limits, cache policy, and monitoring are incomplete. |

## Non-negotiable constraints carried forward

- `@nova/spec` remains the only canonical application schema source.
- Visual and SQL editors must write through one validated schema model.
- Control-plane metadata must never be exposed as application data.
- Runtime clients must not receive database credentials or unrestricted SQL access.
- No database per application.
- No fake connectors or unsupported capability claims.
- No destructive migration without explicit approval.
- No client-supplied tenant context.
- Real database and external-service availability must be reported honestly; unavailable infrastructure is `NOT TESTED`, not `PASS`.

## Next stage entry criteria

Before SQL editing or external connectors are enabled:

1. Add the provider/connector capability contract described in `docs/adr/0017-data-provider-contract.md`.
2. Add the SQL parser, statement classifier, parameterized execution path, statement limits, timeout, and audit workflow described in `docs/adr/0016-sql-editor-safety.md`.
3. Keep all designer edits additive to `@nova/spec`; canvas coordinates, Data Studio state, and UI state must remain separate from canonical schema data.
4. Keep unsupported surfaces explicitly unavailable until their server-side contracts and tests exist.
5. Add UI tests for failed-operation states, bindings, and data actions.

## Stage 1 ADRs

- [ADR-0013: Canonical Data Engine schema extension](adr/0013-canonical-data-schema.md)
- [ADR-0014: Hybrid storage and isolation strategy](adr/0014-hybrid-storage-isolation.md)
- [ADR-0015: React Flow database designer](adr/0015-react-flow-database-designer.md)
- [ADR-0016: SQL editor and SQL safety](adr/0016-sql-editor-safety.md)
- [ADR-0017: Data provider and connector contract](adr/0017-data-provider-contract.md)
- [ADR-0018: Migration safety](adr/0018-migration-safety.md)
- [ADR-0019: Data security boundaries](adr/0019-data-security-boundaries.md)
- [ADR-0020: Data Studio information architecture](adr/0020-data-studio-information-architecture.md)
