# ADR-0003: Canonical versioned application specification

Status: Accepted

## Decision

`@nova/spec` owns a versioned `AppDefinition` document validated by Zod, with generated JSON Schema for tooling.

## Rationale

A single portable format prevents drift between editor state, stored definitions, AI proposals, and runtime input.

## Consequences

All consumers must support declared spec versions. Breaking changes require migrations.
