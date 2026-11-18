# ADR-0005: Separate visual editor and runtime

Status: Accepted

## Decision

Implement editor and runtime as separate apps/packages with no shared server dependencies.

## Rationale

The runtime must be small, portable, and free of editor/API/DB coupling. The editor can evolve without changing runtime behavior.

## Consequences

Shared behavior belongs in `@nova/spec`, `@nova/contracts`, and future `@nova/runtime-core`.
