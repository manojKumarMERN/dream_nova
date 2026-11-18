# ADR-0002: Strict TypeScript everywhere

Status: Accepted

## Decision

Use strict TypeScript with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and explicit package entrypoints.

## Rationale

Types are part of the product contract. The specification, proposals, and component registry must be safely consumable by the editor, API, runtime, and AI systems.

## Consequences

Some third-party boundaries require explicit type narrowing. `any` is rejected by lint.
