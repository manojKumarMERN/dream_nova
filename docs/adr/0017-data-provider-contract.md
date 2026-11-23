# ADR-0017: Data provider and connector contract

Status: Accepted

## Context

The runtime must not depend on PostgreSQL, REST, or any external provider. The repository has generic `DataStoreAdapter`, `AuthProviderAdapter`, and `StorageAdapter` interfaces in `packages/backend-adapters/src/adapters.ts:1-40`, but no data-provider contract with schema discovery, capabilities, query execution, connection testing, or lifecycle management.

## Decision

A provider-independent `DataProvider` contract will be added to the existing backend adapter layer. It must expose connection testing, capability reporting, schema discovery, validated query execution, and close/lifecycle behavior.

Provider implementations may be added only when real behavior is implemented and tested. Internal PostgreSQL remains the first provider. REST and external database providers are staged work and must not be represented by fake or success-only implementations.

Credentials stay outside `AppDefinition`, are encrypted at rest, and are never returned to frontend clients.

## Rationale

A shared contract keeps the runtime, SDK, data engine, and UI independent of provider specifics. Capability reporting is required because SQL databases, document databases, and REST APIs do not support identical operations.

## Consequences

- Connector metadata in canonical schema references provider IDs, not credentials.
- Each provider must declare supported filters, sorting, transactions, relationships, aggregations, and pagination.
- Runtime requests continue through authorized API/SDK routes.
- Connector work includes SSRF protection, DNS/IP validation, timeouts, retry policy, and audit logging before release.
