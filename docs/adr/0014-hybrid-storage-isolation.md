# ADR-0014: Hybrid storage and isolation strategy

Status: Proposed

## Context

The target architecture is hybrid relational storage plus JSONB flexible attributes on shared PostgreSQL infrastructure. The current Phase 4 implementation stores app data in shared `AppDataRecord.values` JSONB with organization, app, and environment columns plus RLS. It does not create per-model relational tables.

The specification requires per-application schema provisioning to be verified before adoption.

## Decision

The current shared-table JSONB baseline remains in place until Stage 3 verifies dynamic schema provisioning. Relational columns, indexes, keys, and per-app schemas must not be enabled by default until an ADR records evidence for:

- Prisma compatibility.
- Dynamic schema creation.
- Search-path handling.
- Connection pooling.
- Migration execution.
- RLS enforcement.
- Schema/table count limits.
- Backup and restore behavior.

A separate PostgreSQL database per application is rejected.

## Rationale

Shared scoped tables are already verified with real PostgreSQL and RLS. Dynamic DDL is a larger operational and security surface. The hybrid target is retained, but adoption must follow evidence rather than assumption.

## Consequences

- Stage 3 must produce a validation ADR before switching physical storage strategy.
- Application-defined field names must be treated as untrusted identifiers even after validation.
- JSONB remains the fallback storage for flexible attributes; it must not silently replace required relational fields in the target design.
- Existing Phase 4 data must remain readable during any future storage transition.
