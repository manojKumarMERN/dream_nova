# ADR-0007: Immutable versioned component registry

Status: Accepted

## Decision

Component contracts are immutable `(type, version)` records registered in `@nova/component-registry`. The registry accepts new versions and never mutates existing versions in place.

## Rationale

Application definitions must continue to validate after contract changes. Renderers need explicit contract versions to select compatible implementations.

## Consequences

Deprecated contracts remain readable until an explicit removal policy is implemented. Spec validation rejects unknown or incompatible contracts.
