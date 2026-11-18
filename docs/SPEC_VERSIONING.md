# Application Specification Versioning

`@nova/spec` owns the canonical `AppDefinition`.

## Current version

```text
1.0
```

## Rules

1. `schemaVersion` is required.
2. Versions use `major.minor`.
3. Major versions may contain breaking changes.
4. Minor versions must be backward-compatible.
5. Every breaking change requires a migration in `src/migrations`.
6. Migrations must be deterministic and side-effect free.
7. Unsupported versions must be rejected with a meaningful error.
8. Runtime and validator compatibility must be declared explicitly in later phases.

## Stability rules

- Component node IDs and page IDs are UUIDs.
- Stable IDs must not be reused after deletion.
- Component nodes reference versioned contracts using `type` and `contractVersion`.
- Platform metadata such as organization ID, environment, and publication status is not part of the spec.
- Integration config cannot contain secrets; use `secretRef`.

## Validation layers

1. Zod schema validation in `@nova/spec`.
2. Semantic validation in `@nova/spec-validator`:
   - duplicate page IDs/routes
   - duplicate node IDs
   - invalid page roots
   - orphan nodes
   - component cycles
   - unknown contracts
   - prop schema violations
   - target incompatibilities
   - invalid parent/child relationships
3. Proposal validation before apply in `@nova/proposal-model`.

## JSON Schema

`getAppDefinitionJsonSchema()` generates JSON Schema from the Zod definition for tooling and documentation. Zod remains the runtime source of truth.
