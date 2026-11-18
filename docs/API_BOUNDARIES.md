# API Boundaries

## Implemented control-plane endpoints

All endpoints are mounted under the global `/api` prefix.

| Method | Path                                  | Purpose                                          |
| ------ | ------------------------------------- | ------------------------------------------------ |
| GET    | `/api/health`                         | Process liveness and uptime.                     |
| GET    | `/api/health/ready`                   | Database readiness via `SELECT 1`.               |
| GET    | `/api/v1/registry/components`         | List built-in component contract summaries.      |
| GET    | `/api/v1/registry/components/full`    | List full component contracts for the builder.   |
| POST   | `/api/v1/spec/validate`               | Validate an application definition.              |
| POST   | `/api/v1/apps`                        | Create an app.                                   |
| GET    | `/api/v1/apps?orgId=:orgId`           | List apps for an organization.                   |
| GET    | `/api/v1/apps/:appId`                 | Get an app.                                      |
| POST   | `/api/v1/apps/:appId/versions`        | Create an immutable app version.                 |
| GET    | `/api/v1/apps/:appId/versions`        | List app versions.                               |
| GET    | `/api/v1/versions/:versionId`         | Get an app version.                              |
| POST   | `/api/v1/proposals/validate`          | Validate and classify a proposal.                |
| POST   | `/api/v1/apps/:appId/proposals/apply` | Apply an approved proposal and create a version. |
| POST   | `/api/v1/apps/:appId/publish`         | Publish a release for an environment.            |
| POST   | `/api/v1/apps/:appId/ai/proposals`    | Generate an optional AI proposal.                |
| GET    | `/api/docs`                           | OpenAPI documentation.                           |

Request ID middleware reads `x-request-id` or generates a UUID and echoes it in the response header.

Error envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid request",
    "requestId": "uuid",
    "details": {}
  }
}
```

## Actor headers

Actor middleware reads `x-org-id`, `x-user-id`, and `x-user-roles`. In production these headers are required. When `NODE_ENV !== production`, missing values default to `dev-org`, `dev-user`, and `OWNER`.

## Persistence

`@nova/api` uses `InMemoryPlatformRepository` by default. Set `NOVA_PLATFORM_REPOSITORY=prisma` with `DATABASE_URL` to use `PrismaPlatformRepository`.

## Planned control-plane endpoints

These boundaries are reserved but intentionally not implemented yet:

| Domain        | Endpoints                                     |
| ------------- | --------------------------------------------- |
| Auth          | `/api/v1/auth/login`, `/api/v1/auth/me`       |
| Organizations | `/api/v1/orgs`, `/api/v1/orgs/:orgId/members` |
| Rollback      | `/api/v1/apps/:appId/rollback`                |
| Integrations  | `/api/v1/apps/:appId/integrations`            |
| Audit         | `/api/v1/apps/:appId/audit-logs`              |

## Runtime boundary

Implemented runtime endpoint:

```text
GET /api/runtime/v1/apps/:appSlug/releases/current?environment=production
```

It returns only compiled, validated runtime data from published releases. It must not expose platform metadata, secrets, integrations, or admin operations.

## Rules

1. All DTOs are validated on the server.
2. All mutations require server-side authorization and tenant scoping.
3. AI endpoints may only create/validate proposals; the UI requires explicit approval before apply.
4. Apply operations must run through `@nova/proposal-model`.
5. No endpoint returns a fake success response.
6. The editor uses `@nova/sdk` for save/publish/version/proposal calls; localStorage fallback is for offline/dev use only.
