# ADR-0019: Data security boundaries

Status: Accepted

## Context

Data Engine operations span organizations, applications, environments, models, fields, records, and external connectors. The current implementation enforces authenticated actor checks, app ownership, environment scoping, model-level data permissions, and PostgreSQL RLS context.

## Decision

Authorization is enforced on the backend at every layer. Client-supplied organization, application, environment, role, or record ownership values are never trusted.

Internal PostgreSQL access uses transaction-scoped organization/app/environment context with RLS. The application database role must not be a superuser and must not have `BYPASSRLS`.

Field-level policies, record-level policies, connector permissions, data-operation audit logs, query complexity limits, and tenant-aware caching are required before enterprise hardening is considered complete.

## Rationale

Layered authorization prevents a bug in one layer from exposing cross-tenant data. RLS must be a backstop, not the only check. Runtime clients must not receive database credentials or direct unrestricted query access.

## Consequences

- Every new data route must map actor identity to server-resolved scope.
- Every provider must enforce the same scope contract or be marked unsupported for that capability.
- Sensitive fields must be filtered server-side, including in query results and exports.
- Security tests must verify org, app, environment, model, field, and record boundaries with real infrastructure where available.
