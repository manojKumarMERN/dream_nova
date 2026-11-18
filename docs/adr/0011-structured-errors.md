# ADR-0011: Structured logs and stable error codes

Status: Accepted

## Decision

Use JSON logs with request IDs and stable `NovaError` codes across packages.

## Rationale

Distributed debugging requires correlatable logs and machine-readable errors. Human-only error strings are insufficient for API and worker systems.

## Consequences

All thrown platform errors should use `NovaError` or wrap it with context. Logs must not include secrets or raw prompt content.
