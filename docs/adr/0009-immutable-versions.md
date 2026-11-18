# ADR-0009: Immutable app versions and audit history

Status: Accepted

## Decision

`AppVersion` rows are immutable. Each apply creates a new version. `AuditLog` records actor, action, resource, request ID, and metadata.

## Rationale

Rollback, moderation, and incident review require durable history. In-place mutation makes proposal validation and release integrity impossible to prove.

## Consequences

Services must never update a version row after creation. Corrections are new versions.
