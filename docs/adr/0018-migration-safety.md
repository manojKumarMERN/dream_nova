# ADR-0018: Migration safety

Status: Accepted

## Context

The migration engine must transform application schemas safely and support both visual designer and SQL editor proposals. The current engine computes deterministic schema versions, detects destructive operations, and requires `confirmed: true` for destructive application.

## Decision

All schema changes follow one lifecycle: proposal, canonical validation, migration plan, destructive classification, preview, explicit approval, execution, status recording, version update, and metadata refresh.

No destructive migration may execute without explicit user approval. Migrations must not be described as automatically reversible. Recovery procedures or backups are required for destructive operations.

Concurrent schema migrations for the same scope must be serialized. Migration records must include IDs, version transition, plan, status, timestamp, and error details.

## Rationale

Schema changes can destroy application data. A single lifecycle prevents visual and SQL paths from diverging and gives users a reviewable boundary before execution.

## Consequences

- The existing `DataStore.runInSchemaLock` model remains the local locking mechanism; distributed locking is required before multi-instance deployments are claimed.
- Index, constraint, and dynamic DDL operations require validation and plan coverage before execution.
- Migration history UI must display affected objects and destructive warnings.
- Failed migrations must remain visible with execution details.
