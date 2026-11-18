# ADR-0012: Redacted prompt contexts and no server code execution

Status: Accepted

## Decision

AI receives only redacted structural context and structured proposals. AI output is never executed as code on the platform server.

## Rationale

Prompt injection and secret leakage are unacceptable risks. App behavior can be represented through validated component definitions and contracts instead.

## Consequences

AI integrations must use schema-constrained structured output. Future tool access will use an explicit allowlist with server-side authorization.
