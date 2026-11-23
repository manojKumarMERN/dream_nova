# ADR-0013: Canonical Data Engine schema extension

Status: Accepted

## Context

The Data Engine specification requires models, fields, relationships, indexes, constraints, data sources, queries, bindings, permissions, and migrations. The repository already treats `@nova/spec` as the canonical application-definition package.

## Decision

All Data Engine definitions remain additive, versioned fields of the existing `AppDefinition` in `@nova/spec`. No separate schema registry package or incompatible data-model format may be introduced.

Schema contracts must remain Zod-validated, JSON-Schema-exportable, and covered by `@nova/spec-validator`. Breaking changes require a spec migration.

## Rationale

One canonical definition prevents drift between editor state, stored versions, AI proposals, migrations, API validation, and runtime payloads. A second schema system would create ambiguous ownership and unsafe migration behavior.

## Consequences

- New Data Engine capabilities extend existing spec modules rather than replacing them.
- Every new data contract requires validator coverage and fixture updates.
- Provider-specific details stay out of canonical application definitions; providers are referenced by stable IDs and capabilities.
- SQL and visual designer changes must both resolve back to these contracts.
