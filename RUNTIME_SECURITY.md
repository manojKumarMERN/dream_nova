# Runtime Security

## Expression evaluation

- No `eval()` or `Function()` constructor.
- Identifier-based parser/evaluator with an explicit function allowlist (`RUNTIME_EXPRESSION_FUNCTIONS`).
- Enforced limits:
  - Length: 512 characters.
  - Tokens: 200.
  - Nesting depth: 24.
  - Evaluation steps: 2,000.
  - Interpolation depth: 8.
  - Interpolated result length: 4,096.
- Limit violations produce safe errors; no raw source is echoed to end users.

## Actions

Allowed runtime actions are an explicit allowlist. Any other action is rejected, including `eval`.

Additional checks:

- Maximum 64 actions per event.
- Maximum nested action depth 8.
- Maximum serialized nested action length 64.
- Safe path parsing with maximum path length 256 and 32 segments.
- Blocked path segments: `__proto__`, `prototype`, `constructor`, `eval`, `function`.
- State writes are limited to approved roots; component prop writes require writable keys.
- Navigation blocks `javascript:`, `data:`, and `vbscript:` URLs.

## Contract validation

`validateRuntimeDefinitionContracts()` validates:

- propsSchema subset: object/array/string/number/boolean, `required`, `additionalProperties`, `enum`, min/max, minLength/maxLength, and `pattern`.
- Component layout props and breakpoint overrides.
- Declared events and payload contracts.
- Missing contract registration.

Issues are attached to runtime nodes and rendered by `FallbackRenderer` as `nova-fallback-issue` notes.

## Telemetry

- Adapter-based telemetry with no-op and console implementations.
- Redacted keys: `password`, `token`, `secret`, `authorization`, `cookie`, `value`, `values`, `payload`, `credential`, `apikey`.
- Long strings are truncated.
- Render errors are reported as `RUNTIME_RENDER_FAILED` while users see a generic message.

## Classification

| Area                            | Status                                 |
| ------------------------------- | -------------------------------------- |
| Expression sandbox              | PASS (unit tested)                     |
| Action allowlist                | PASS (unit tested)                     |
| Path/prototype pollution guards | PASS (unit tested)                     |
| Contract-backed prop validation | PASS (unit tested + E2E API rejection) |
| Telemetry redaction             | PASS (unit tested)                     |
| Unknown renderer fallback       | PASS (unit tested + E2E)               |
| Native target rendering         | NOT TESTED / not implemented           |
| Full third-party security audit | NOT TESTED                             |
