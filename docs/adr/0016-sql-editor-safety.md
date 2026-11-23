# ADR-0016: SQL editor and SQL safety

Status: Accepted

## Context

The specification requires an advanced SQL editor with query and schema modes, syntax highlighting, autocomplete, results, history, and visual/SQL synchronization. No SQL editor dependency, SQL parser, or statement classifier currently exists.

## Decision

The SQL editor must be implemented as two distinct modes:

- Query mode is read-only by default and returns bounded results.
- Schema mode produces a reviewed migration proposal and never executes directly from the client.

Monaco may be used if it fits the existing build; otherwise an equivalent editor must be evaluated before adoption. SQL safety must use a real parser or equivalent validated parsing layer. Regular expressions alone are insufficient.

All SQL execution must pass statement allowlists, permission checks, schema-boundary checks, timeouts, result limits, destructive-operation approval, and audit logging. Access to platform schemas, system catalogs, COPY PROGRAM, privilege escalation, and unrestricted multi-statement execution is rejected.

## Rationale

An SQL editor is a high-risk interface. Visual and SQL editing must share one canonical schema, but raw SQL cannot be trusted with platform credentials or unrestricted execution.

## Consequences

- Stage 5 must add parser and classifier tests before any execution path exists.
- SQL schema changes that cannot be represented in canonical schema operations must be rejected with a clear error.
- Query and schema actions must remain visually and semantically separate in the UI.
- Query history and execution details must exclude secrets.
