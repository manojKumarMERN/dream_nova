# Data Engine and Visual Database Builder

## Scope

Phase 4 adds typed app data modeling, migrations, CRUD, structured queries, tenant-scoped storage, editor tooling, and runtime data actions. The canonical definitions remain in `@nova/spec`; the API, SDK, editor, and runtime consume those definitions rather than maintaining parallel schemas.

## Storage model

App data is stored in shared PostgreSQL tables:

- `AppDataSchema`: one active schema snapshot per organization/app/environment.
- `AppDataRecord`: one row per record, keyed by organization/app/environment/model.
- `AppDataMigration`: migration history with before/after schema versions.

Every row carries `organizationId`, `appId`, and `environment`. RLS policies use `app.current_org_id`, `app.current_app_id`, and `app.current_environment`, set inside parameterized Prisma transactions by `PrismaDataStore`. The application database role must not be a superuser and must not have `BYPASSRLS`, otherwise PostgreSQL will not enforce those policies.

Trade-offs:

- No schema-per-app and no arbitrary SQL or user/AI-generated DDL.
- No database-native per-model unique constraints or foreign keys.
- `@nova/data-engine` enforces validation, uniqueness, delete behavior, and permissions in every scoped operation.

## Permissions

Data permissions are explicit and default-deny. `createDefaultDataPermissions(modelId)` seeds owner/admin/editor/viewer permissions for a new model. API requests use the authenticated actor role from `ActorMiddleware`; the data engine receives `roles: [actor.role]`.

Permissions are checked for:

- `create`, `read`, `update`, `delete`
- Schema/migration status
- Migration planning and application

## API

Routes are mounted under `/api/data/v1/apps/:appId`.

| Method | Path                               | Purpose                     |
| ------ | ---------------------------------- | --------------------------- |
| GET    | `/schema`                          | Schema and migration status |
| POST   | `/migrations/plan`                 | Compute a migration plan    |
| POST   | `/migrations/apply`                | Apply a planned migration   |
| POST   | `/models/:model/records`           | Create a record             |
| GET    | `/models/:model/records/:recordId` | Read one record             |
| POST   | `/models/:model/query`             | Structured query            |
| PATCH  | `/models/:model/records/:recordId` | Update a record             |
| DELETE | `/models/:model/records/:recordId` | Delete a record             |

All data routes accept `?environment=development|preview|production`. `dev` is accepted as an alias for `development`. Destructive migration operations require `confirmed: true`.

## SDK

`@nova/sdk` exposes:

- `getDataSchema`
- `planDataMigration`
- `applyDataMigration`
- `createDataRecord`
- `getDataRecord`
- `queryDataRecords`
- `updateDataRecord`
- `deleteDataRecord`

Data request/result types are exported from `packages/sdk/src/index.ts`.

## Editor

The editor left `Data` tab hosts `DatabasePanel`, which supports:

- Add/remove data models.
- Add/edit/remove fields.
- Add/remove relationships with one-to-one, one-to-many, and many-to-many kinds.
- Configure delete behavior and junction models.
- Preview migration operations.
- Apply confirmed migrations.

Inspector additions:

- Bind component props to state paths such as `data.query.rows`.
- Presets for data-table rows, list items, and first record.
- Attach `queryData`, `createRecord`, `updateRecord`, and `deleteRecord` actions to component events.

## Runtime

Runtime data actions are part of the existing allowlist:

- `queryData`: params `{ model, path, page?, pageSize?, filters?, sort?, fields?, expand? }`
- `createRecord`: params `{ model, values }`
- `updateRecord`: params `{ model, recordId, values }`
- `deleteRecord`: params `{ model, recordId }`

`RuntimeEngine` calls the injected `dataAccess` adapter and stores query results in app state at `params.path`. Web runtime supplies an adapter backed by `NovaClient`; environment is read from `?environment=`. Production requests still require explicit actor headers, so public runtime data access fails closed rather than exposing unauthenticated tenant data.

`data-table`, `list`, and input renderers accept resolved bindings from query results. Query results with `{ rows }`, `{ records }`, or `{ items }` are unwrapped; data-table columns can be inferred from the first row.

## PostgreSQL verification

The dedicated database suite is intentionally separate from the default unit suite:

```bash
docker compose up -d postgres
docker compose exec postgres psql -U nova -c "CREATE DATABASE nova_test;"
docker compose exec postgres psql -U nova -d nova_test -c "CREATE ROLE nova_app LOGIN PASSWORD 'nova_app_test';"
DATABASE_URL_TEST=postgresql://nova:nova@localhost:5432/nova_test?schema=public \
DATABASE_URL_TEST_APP=postgresql://nova_app:nova_app_test@localhost:5432/nova_test?schema=public \
pnpm test:db
```

`pnpm test:db` validates that `DATABASE_URL_TEST` points to a non-production database whose name contains `test`, regenerates Prisma Client, applies all migrations with `prisma migrate deploy`, and then verifies:

- Prisma repository app/version ownership checks match the in-memory repository contract.
- App-data tables and migration history are written to PostgreSQL.
- Data migrations plan, apply, and report status from persisted snapshots.
- CRUD and structured queries persist through `DataService` → `DataEngine` → `PrismaDataStore`.
- Organization and environment scoping prevent cross-tenant and cross-environment reads/writes.
- RLS policies hide rows when `app.current_org_id`, `app.current_app_id`, or `app.current_environment` are missing or mismatched. This check requires `DATABASE_URL_TEST_APP` and fails as skipped when it is absent.
- A runtime `queryData` action reaches PostgreSQL through the runtime engine and a Prisma-backed `DataService`.

The suite never falls back to in-memory storage. If the test database URL is missing or unsafe, `pnpm test:db` fails before touching a database. `DATABASE_URL_TEST_APP` must use a non-superuser role without `BYPASSRLS`; the setup grants table privileges after applying migrations.

## Verification status

- Unit tests cover data engine CRUD/query/validation/permissions/migrations, API tenant isolation, runtime action validation, and runtime adapter execution.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm format:check`, and in-memory `pnpm test:e2e` pass.
- PostgreSQL/Prisma-backed `pnpm test:db` is implemented but NOT TESTED in this environment because Docker, `psql`, and local PostgreSQL are unavailable.
