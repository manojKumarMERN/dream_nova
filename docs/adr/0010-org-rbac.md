# ADR-0010: Organization-scoped RBAC

Status: Accepted

## Decision

Authorization is organization-scoped using `OWNER`, `ADMIN`, `EDITOR`, and `VIEWER` roles.

## Rationale

NOVA is multi-tenant. Permissions must be enforced server-side on every mutation and sensitive read.

## Consequences

Every resource query must include organization scope. Applying high-risk proposals requires elevated roles in later service implementations.
