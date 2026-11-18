# ADR-0008: Provider-independent backend and AI interfaces

Status: Accepted

## Decision

Define interfaces for data, auth, and storage in `@nova/backend-adapters` and LLM clients in `@nova/ai-core`. Concrete providers are deferred.

## Rationale

Self-hosting and managed deployments need different implementations. Core packages must not depend on specific vendors.

## Consequences

Provider packages can be added later without changing spec, proposal, or API contracts. No placeholder provider is implemented in Phase 0.
